import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve, sep } from "node:path";
import { execCommand } from "@getpaseo/plugin/server";
import { gitDir, worktreePaths } from "./git";
import type { ScopeKind, Shot, WalkthroughSettings } from "../shared/walkthrough";

const SERVER_TIMEOUT_MS = 4 * 60 * 1000;
const WARMUP_TIMEOUT_MS = 2 * 60 * 1000;
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000;
const QA_SCRIPT = "scripts/qa-screenshots.ts";
const AUTH_STATE = ".qa/.auth/storage-state.json";
const AUTH_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface CaptureOutcome {
  shots: Map<string, Shot>;
  anonymous: boolean;
  note: string | null;
  failed: boolean;
}

type Phase = (text: string) => void;

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  (timer as { unref?: () => void }).unref?.();
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Where shots live: inside the worktree's own git directory, one folder per scope and run.
// ---------------------------------------------------------------------------

export async function shotsRoot(cwd: string): Promise<string> {
  return join(await gitDir(cwd), "paseo-walkthrough", "shots");
}

export async function readShot(cwd: string, file: string): Promise<Uint8Array> {
  const root = await shotsRoot(cwd);
  const path = resolve(root, file);
  if (!path.startsWith(root + sep)) throw new Error("Chemin de capture invalide");
  return new Uint8Array(await readFile(path));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function devCommand(cwd: string, settings: WalkthroughSettings, port: number): Promise<string | null> {
  if (settings.devCommand.trim()) return settings.devCommand.replaceAll("{port}", String(port));
  let scripts: Record<string, string> = {};
  try {
    scripts = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")).scripts ?? {};
  } catch {
    return null;
  }
  if (!scripts.dev) return null;
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return `bun run dev --port ${port}`;
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return `pnpm dev --port ${port}`;
  if (existsSync(join(cwd, "yarn.lock"))) return `yarn dev --port ${port}`;
  return `npm run dev -- --port ${port}`;
}

function captureCommand(cwd: string, settings: WalkthroughSettings): { template: string; qaScript: boolean } | null {
  if (settings.captureCommand.trim()) return { template: settings.captureCommand, qaScript: false };
  if (existsSync(join(cwd, QA_SCRIPT))) {
    return {
      template: `bun run ${QA_SCRIPT} --routes {routes} --out {out} --base-url {baseUrl} --max-scroll 25`,
      qaScript: true,
    };
  }
  return null;
}

function shell(command: string, cwd: string, env: Record<string, string>): ChildProcess {
  // A login shell gives the same PATH as the user's terminal (Homebrew, bun, nvm…).
  const userShell = process.env.SHELL || "/bin/zsh";
  return spawn(userShell, ["-lc", command], {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  const pid = child.pid;
  const kill = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch {
      // Already gone.
    }
  };
  kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((done) => child.once("exit", () => done(true))),
    new Promise<boolean>((done) => setTimeout(() => done(false), 4000)),
  ]);
  if (!exited) kill("SIGKILL");
}

function collect(child: ChildProcess, max = 400): { lines: string[] } {
  const store = { lines: [] as string[] };
  const push = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      store.lines.push(line.replace(/\x1b\[[0-9;]*m/g, ""));
      if (store.lines.length > max) store.lines.shift();
    }
  };
  child.stdout?.on("data", push);
  child.stderr?.on("data", push);
  return store;
}

async function waitForServer(url: string, child: ChildProcess, output: { lines: string[] }, signal: () => boolean) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal()) throw new Error("Annulé");
    if (child.exitCode !== null) {
      throw new Error(`Le serveur de dev s'est arrêté : ${output.lines.slice(-4).join(" · ") || "aucune sortie"}`);
    }
    try {
      await fetch(url, { signal: timeoutSignal(5000), redirect: "manual" });
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 1500));
    }
  }
  throw new Error("Le serveur de dev n'a pas répondu en 4 minutes.");
}

/** Reuses the freshest signed-in session saved by the QA script in any checkout of the repo. */
async function seedAuthState(cwd: string): Promise<void> {
  const target = join(cwd, AUTH_STATE);
  let best: { path: string; mtime: number } | null = null;
  for (const checkout of await worktreePaths(cwd)) {
    const path = join(checkout, AUTH_STATE);
    try {
      const info = await stat(path);
      if (Date.now() - info.mtimeMs > AUTH_MAX_AGE_MS) continue;
      if (!best || info.mtimeMs > best.mtime) best = { path, mtime: info.mtimeMs };
    } catch {
      // No session there.
    }
  }
  if (!best || resolve(best.path) === resolve(target)) return;
  try {
    const current = await stat(target);
    if (current.mtimeMs >= best.mtime) return;
  } catch {
    // No local session yet.
  }
  await mkdir(join(cwd, ".qa", ".auth"), { recursive: true });
  await copyFile(best.path, target);
}

function slugify(route: string): string {
  return (
    route
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "home"
  );
}

async function hasSips(): Promise<boolean> {
  try {
    await execCommand("/usr/bin/sips", ["--help"], { timeout: 5000 });
    return true;
  } catch {
    return existsSync("/usr/bin/sips");
  }
}

/** Shrinks a PNG capture to a JPEG the panel can load quickly. Keeps the PNG when sips is missing. */
async function shrink(dir: string, file: string, width: number, sips: boolean): Promise<string> {
  if (!sips) return file;
  const jpeg = file.replace(/\.png$/i, ".jpg");
  try {
    await execCommand(
      "/usr/bin/sips",
      ["--resampleWidth", String(width), "-s", "format", "jpeg", "-s", "formatOptions", "72", join(dir, file), "--out", join(dir, jpeg)],
      { timeout: 60_000 },
    );
    await rm(join(dir, file), { force: true });
    return jpeg;
  } catch {
    return file;
  }
}

// ---------------------------------------------------------------------------
// The capture run
// ---------------------------------------------------------------------------

export async function captureScreens(input: {
  cwd: string;
  scope: ScopeKind;
  routes: string[];
  settings: WalkthroughSettings;
  phase: Phase;
  cancelled: () => boolean;
}): Promise<CaptureOutcome> {
  const { cwd, scope, routes, settings, phase, cancelled } = input;
  const shots = new Map<string, Shot>();
  const outcome = (note: string, failed = true): CaptureOutcome => ({ shots, anonymous: false, note, failed });

  const capture = captureCommand(cwd, settings);
  if (!capture) {
    return outcome(
      `Pas de script de capture dans ce projet (${QA_SCRIPT}). Ajoute une commande de capture dans les réglages du plugin.`,
    );
  }
  const port = await freePort();
  const dev = await devCommand(cwd, settings, port);
  if (!dev) return outcome("Pas de script « dev » dans package.json : précise la commande du serveur dans les réglages.");

  const root = await shotsRoot(cwd);
  const runDir = `${scope}-${Date.now().toString(36)}`;
  const out = join(root, runDir);
  await mkdir(out, { recursive: true });

  phase("Lancement du site…");
  const baseUrl = `http://localhost:${port}`;
  const server = shell(dev, cwd, { PORT: String(port), NUXT_PORT: String(port), BROWSER: "none" });
  const serverOutput = collect(server);
  try {
    await waitForServer(baseUrl, server, serverOutput, cancelled);

    // The first request to each page compiles it; do it before the capture timeouts start.
    for (const [index, route] of routes.entries()) {
      if (cancelled()) return outcome("Annulé");
      phase(`Préparation des écrans (${index + 1}/${routes.length})…`);
      try {
        await fetch(baseUrl + route, { signal: timeoutSignal(WARMUP_TIMEOUT_MS), redirect: "manual" });
      } catch {
        // The capture reports pages that really fail.
      }
    }

    if (capture.qaScript) await seedAuthState(cwd).catch(() => undefined);

    phase(`Captures de ${routes.length} écran${routes.length > 1 ? "s" : ""}…`);
    const command = capture.template
      .replaceAll("{routes}", quote(routes.join(",")))
      .replaceAll("{out}", quote(out))
      .replaceAll("{baseUrl}", quote(baseUrl));
    const runner = shell(command, cwd, {});
    const runnerOutput = collect(runner, 2000);
    const finished = await Promise.race([
      new Promise<number>((done) => runner.once("exit", (code) => done(code ?? 1))),
      new Promise<number>((done) => setTimeout(() => done(-1), CAPTURE_TIMEOUT_MS)),
    ]);
    if (finished === -1) await stop(runner);

    const anonymous = runnerOutput.lines.some((line) => /ANONYMOUS mode|Anonymous mode forced/i.test(line));
    const errors = new Map<string, string>();
    const files = new Map<string, { desktop: string | null; mobile: string | null }>();
    for (const line of runnerOutput.lines) {
      const ok = /^✓\s+(\S+)\s+\((desktop|mobile)\)\s+→\s+(.+)$/.exec(line.trim());
      if (ok) {
        const entry = files.get(ok[1]) ?? { desktop: null, mobile: null };
        entry[ok[2] as "desktop" | "mobile"] = ok[3].trim().split(sep).pop() ?? null;
        files.set(ok[1], entry);
        continue;
      }
      const ko = /^✗\s+(\S+)\s+\((desktop|mobile)\):\s+(.+)$/.exec(line.trim());
      if (ko) errors.set(ko[1], ko[3].slice(0, 200));
    }
    // Commands that do not print the QA script's lines: match files by route slug.
    if (files.size === 0) {
      const names = await readdir(out).catch(() => [] as string[]);
      for (const route of routes) {
        const slug = slugify(route);
        const pick = (viewport: string) =>
          names.find((name) => name.includes(`-${slug}-${viewport}.`) || name.startsWith(`${slug}-${viewport}.`)) ?? null;
        const entry = { desktop: pick("desktop"), mobile: pick("mobile") };
        if (entry.desktop || entry.mobile) files.set(route, entry);
      }
    }

    phase("Mise en forme des captures…");
    const sips = await hasSips();
    for (const route of routes) {
      const found = files.get(route);
      const desktop = found?.desktop ? `${runDir}/${await shrink(out, found.desktop, 1280, sips)}` : null;
      const mobile = found?.mobile ? `${runDir}/${await shrink(out, found.mobile, 640, sips)}` : null;
      shots.set(route, {
        desktop,
        mobile,
        error: desktop || mobile ? null : (errors.get(route) ?? "Capture impossible"),
      });
    }

    // Older runs of this scope are no longer referenced.
    for (const name of await readdir(root).catch(() => [] as string[])) {
      if (name.startsWith(`${scope}-`) && name !== runDir) await rm(join(root, name), { recursive: true, force: true });
    }

    const captured = [...shots.values()].filter((s) => s.desktop || s.mobile).length;
    const note =
      captured === 0
        ? `Aucune capture n'a abouti. ${runnerOutput.lines.slice(-3).join(" · ")}`.trim()
        : anonymous
          ? "Captures faites sans connexion : les écrans réservés aux membres montrent la page de connexion. Ajoute QA_USER_EMAIL et QA_USER_PASSWORD au .env du projet pour les voir connecté."
          : null;
    return { shots, anonymous, note, failed: captured === 0 };
  } finally {
    await stop(server);
  }
}
