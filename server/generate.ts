import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { readDiff, resolveScope } from "./git";
import { answerSchema, buildPrompt, repairPrompt } from "./prompt";
import { parseAnswer, shapeWalkthrough } from "./shape";
import { answerGeneratorPermission } from "./permissions";
import { captureScreens } from "./capture";
import { loadWalkthrough, saveWalkthrough } from "./store";
import {
  type Job,
  type Phase,
  type ScopeKind,
  type Walkthrough,
  type WalkthroughSettings,
  walkthroughLanguage,
} from "../shared/walkthrough";

type PaseoApi = PluginHandlerContext["paseo"];

export const GENERATOR_LABEL = "paseo-walkthrough";
export const GENERATOR_TITLE = "Walkthrough · ";
const TURN_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_PERMISSION_ROUNDS = 80;

type ModelChoice = { value: string; label: string };

/** Every selectable provider/model pair, plus the one used when the setting is empty. */
export async function modelCatalog(paseo: PaseoApi): Promise<{ options: ModelChoice[]; fallback: string | null }> {
  let entries: Awaited<ReturnType<PaseoApi["providers"]["snapshot"]>>["entries"] = [];
  try {
    entries = (await paseo.providers.snapshot()).entries;
    if (entries.some((e) => e.status === "loading")) {
      entries = (await paseo.providers.waitForReady({ timeoutMs: 15_000 } as never)).entries;
    }
  } catch {
    // Keep what we have.
  }
  const options: ModelChoice[] = [];
  let fallback: string | null = null;
  const usable = entries.filter((e) => e.enabled !== false && e.status === "ready");
  // Prefer Claude, then Codex, then whatever is installed.
  const order = (id: string) => (id === "claude" ? 0 : id === "codex" ? 1 : 2);
  usable.sort((a, b) => order(a.provider) - order(b.provider));
  for (const entry of usable) {
    const providerLabel = entry.label ?? entry.provider;
    for (const model of entry.models ?? []) {
      if (model.isSelectable === false) continue;
      const value = `${entry.provider}/${model.id}`;
      options.push({ value, label: `${providerLabel} · ${model.label}` });
      if (!fallback && model.isDefault) fallback = value;
    }
  }
  if (!fallback && options.length) fallback = options[0].value;
  return { options, fallback };
}

async function readOnlyMode(paseo: PaseoApi, provider: string): Promise<string | undefined> {
  try {
    const { entries } = await paseo.providers.snapshot();
    const entry = entries.find((e) => e.provider === provider.split("/")[0]);
    const mode = entry?.modes?.find((m) => /^(read-?only|readonly|ask)$/i.test(m.id));
    return mode?.id;
  } catch {
    return undefined;
  }
}

interface StartInput {
  cwd: string;
  scope: ScopeKind;
  workspaceId: string;
  settings: WalkthroughSettings;
  capturesOnly?: boolean;
  locale?: string;
}

interface Running {
  job: Job;
  agentId: string | null;
  cancelled: boolean;
}

export class Generator {
  private readonly jobs = new Map<string, Running>();

  constructor(private readonly paseo: PaseoApi) {}

  private key(cwd: string, scope: ScopeKind) {
    return `${cwd}::${scope}`;
  }

  owns(agentId: string): boolean {
    for (const running of this.jobs.values()) if (running.agentId === agentId) return true;
    return false;
  }

  job(cwd: string, scope: ScopeKind): Job | null {
    return this.jobs.get(this.key(cwd, scope))?.job ?? null;
  }

  async cancel(cwd: string, scope: ScopeKind): Promise<void> {
    const running = this.jobs.get(this.key(cwd, scope));
    if (!running) return;
    running.cancelled = true;
    this.jobs.delete(this.key(cwd, scope));
    if (running.agentId) await this.paseo.agents.ref(running.agentId).archive().catch(() => undefined);
  }

  async dispose(): Promise<void> {
    for (const running of this.jobs.values()) {
      running.cancelled = true;
      if (running.agentId) await this.paseo.agents.ref(running.agentId).archive().catch(() => undefined);
    }
    this.jobs.clear();
  }

  start(input: StartInput): void {
    const key = this.key(input.cwd, input.scope);
    const existing = this.jobs.get(key);
    if (existing?.job.state === "running") return;
    const running: Running = {
      job: { state: "running", startedAt: new Date().toISOString(), phase: { key: "reading" }, error: null, agentId: null },
      agentId: null,
      cancelled: false,
    };
    this.jobs.set(key, running);
    const work = input.capturesOnly ? this.recapture(running, input) : this.run(running, input);
    void work.then(
      () => {
        if (this.jobs.get(key) === running) this.jobs.delete(key);
      },
      (error: unknown) => {
        if (running.cancelled) return;
        console.error("[walkthrough] generation failed", error);
        running.job = { ...running.job, state: "error", error: (error as Error)?.message ?? String(error) };
      },
    );
  }

  /** Captures the screens of a saved walkthrough and stores the result in it. */
  private async captures(running: Running, input: StartInput, walkthrough: Walkthrough): Promise<void> {
    const routes = walkthrough.screens.map((s) => s.route);
    if (!input.settings.captures || routes.length === 0) return;
    const result = await captureScreens({
      cwd: input.cwd,
      scope: input.scope,
      routes,
      settings: input.settings,
      cancelled: () => running.cancelled,
      phase: (phase: Phase) => {
        running.job = { ...running.job, phase };
      },
    }).catch((error: unknown) => ({
      shots: new Map(),
      anonymous: false,
      reason: "error" as const,
      note: (error as Error)?.message ?? String(error),
      failed: true,
    }));
    if (running.cancelled) return;
    // Re-read: progress or another run may have touched the file meanwhile.
    const current = (await loadWalkthrough(input.cwd, input.scope)) ?? walkthrough;
    if (current.generatedAt !== walkthrough.generatedAt) return;
    current.screens = current.screens.map((screen) => ({ ...screen, shot: result.shots.get(screen.route) ?? screen.shot }));
    // The signed-out warning only matters when a screen needs a signed-in user.
    const needsLogin = current.screens.some((screen) => screen.login);
    const quiet = result.reason === "signed-out" && !needsLogin;
    current.captures = {
      state: result.failed ? "failed" : "done",
      reason: quiet ? null : result.reason,
      note: quiet ? null : result.note,
      anonymous: result.anonymous,
    };
    await saveWalkthrough(input.cwd, current);
  }

  private async recapture(running: Running, input: StartInput): Promise<void> {
    const walkthrough = await loadWalkthrough(input.cwd, input.scope);
    if (!walkthrough) throw new Error("There is no walkthrough to illustrate.");
    walkthrough.captures = { state: "pending", reason: null, note: null, anonymous: false };
    await saveWalkthrough(input.cwd, walkthrough);
    await this.captures(running, { ...input, settings: { ...input.settings, captures: true } }, walkthrough);
  }

  private async run(running: Running, input: StartInput): Promise<void> {
    const started = Date.now();
    const { cwd, scope, workspaceId, settings } = input;
    const resolved = await resolveScope(cwd, scope);
    const diff = await readDiff(cwd, resolved);
    if (diff.files.length === 0) throw new Error("There are no changes to explain in this scope.");

    const catalog = await modelCatalog(this.paseo);
    const provider = settings.provider || catalog.fallback;
    if (!provider) throw new Error("No agent is available. Enable a provider in Paseo.");
    const modelLabel = catalog.options.find((o) => o.value === provider)?.label.split(" · ").pop() ?? provider;
    running.job = { ...running.job, phase: { key: "agentReading", model: modelLabel, count: diff.files.length } };
    const language = walkthroughLanguage(settings.language, input.locale);

    const prompt = buildPrompt({
      diff,
      resolved,
      language,
      review: settings.review,
      instructions: settings.instructions,
    });
    const modeId = await readOnlyMode(this.paseo, provider);
    const workspace = this.paseo.workspaces.ref(workspaceId);
    const create = (withSchema: boolean) =>
      workspace.agents.create({
        config: { provider, ...(modeId ? { modeId } : {}) },
        title: `${GENERATOR_TITLE}${resolved.branch ?? scope}`,
        prompt,
        background: true,
        labels: { [GENERATOR_LABEL]: "generator" },
        // Providers that enforce structured output use this; the prompt carries the same schema for the rest.
        ...(withSchema ? { outputSchema: answerSchema() } : {}),
      });

    type Agent = Awaited<ReturnType<typeof create>>;
    // waitForFinish returns as soon as a permission is pending. The generator only reads, so answer
    // each request here (read-only commands allowed, everything else denied) and keep waiting.
    const settle = async (target: Agent) => {
      let outcome = await target.waitForFinish(TURN_TIMEOUT_MS);
      for (let round = 0; outcome.status === "permission" && round < MAX_PERMISSION_ROUNDS && !running.cancelled; round++) {
        await target.refresh().catch(() => null);
        for (const request of target.pendingPermissions ?? []) {
          await answerGeneratorPermission(this.paseo, target.id, request);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        outcome = await target.waitForFinish(TURN_TIMEOUT_MS);
      }
      return outcome;
    };

    const unsupported = (message: string | null | undefined) => /output.?schema|structured output/i.test(message ?? "");
    let withSchema = true;
    let agent: Agent;
    let result: Awaited<ReturnType<Agent["waitForFinish"]>>;
    for (;;) {
      try {
        agent = await create(withSchema);
      } catch (error) {
        if (!withSchema || !unsupported((error as Error)?.message)) throw error;
        withSchema = false;
        continue;
      }
      running.agentId = agent.id;
      running.job = { ...running.job, agentId: agent.id };
      if (running.cancelled) {
        await agent.archive().catch(() => undefined);
        return;
      }
      result = await settle(agent);
      if (withSchema && result.status === "error" && unsupported(result.error)) {
        // This provider cannot enforce a schema: ask again and parse the JSON from the text.
        await agent.archive().catch(() => undefined);
        withSchema = false;
        continue;
      }
      break;
    }

    let generated: Walkthrough | null = null;
    try {
      let parsed = result.status === "idle" ? parseAnswer(result.lastMessage ?? "") : null;
      if (parsed && !parsed.ok && !running.cancelled) {
        running.job = { ...running.job, phase: { key: "repairing" } };
        await agent.send(repairPrompt(parsed.error));
        result = await settle(agent);
        parsed = result.status === "idle" ? parseAnswer(result.lastMessage ?? "") : null;
      }
      if (running.cancelled) return;
      if (!parsed) {
        if (result.status === "timeout") throw new Error("The agent did not finish in time (20 min).");
        if (result.status === "permission") throw new Error("The agent asked for too many permissions.");
        throw new Error(result.error ?? "The agent stopped on an error.");
      }
      if (!parsed.ok) throw new Error(`Unusable answer: ${parsed.error}`);

      await agent.refresh().catch(() => null);
      const costUsd = agent.lastUsage?.totalCostUsd ?? null;
      running.job = { ...running.job, phase: { key: "shaping" } };
      const fresh = await readDiff(cwd, resolved);
      const walkthrough = shapeWalkthrough({
        raw: parsed.value,
        diff: fresh,
        resolved,
        provider,
        modelLabel,
        language,
        costUsd: typeof costUsd === "number" ? costUsd : null,
        durationMs: Date.now() - started,
        captures: settings.captures,
      });
      await saveWalkthrough(cwd, walkthrough);
      generated = walkthrough;
    } finally {
      await agent.archive().catch(() => undefined);
    }
    // The walkthrough is readable now; the screenshots arrive while the reader starts.
    if (generated && !running.cancelled) await this.captures(running, input, generated);
  }
}
