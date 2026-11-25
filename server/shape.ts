import { type Diff, findFile, type ResolvedScope } from "./git";
import {
  type RawWalkthrough,
  RawWalkthrough as RawSchema,
  type RiskLevel,
  type Screen,
  type Step,
  type Walkthrough,
} from "../shared/walkthrough";

const RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };

function maxRisk(levels: (RiskLevel | null)[]): RiskLevel | null {
  let best: RiskLevel | null = null;
  for (const level of levels) if (level && (!best || RANK[level] > RANK[best])) best = level;
  return best;
}

// ---------------------------------------------------------------------------
// Normalization: models stray from enums ("none", "critical", "Medium"…). Map what is close to a
// valid value and default the rest, instead of throwing away a whole walkthrough for one word.
// ---------------------------------------------------------------------------

const LEVELS: Record<string, RiskLevel> = {
  critical: "high", severe: "high", major: "high", high: "high", élevé: "high", eleve: "high", haut: "high",
  medium: "medium", moderate: "medium", med: "medium", moyen: "medium", modéré: "medium",
  low: "low", minor: "low", info: "low", trivial: "low", faible: "low", bas: "low",
};
const NOTE_KINDS: Record<string, "risk" | "decision" | "question"> = {
  risk: "risk", warning: "risk", danger: "risk", issue: "risk", risque: "risk",
  decision: "decision", choice: "decision", tradeoff: "decision", "trade-off": "decision", décision: "decision", choix: "decision",
  question: "question", unclear: "question", note: "question", doute: "question",
};
const IMPORTANCE: Record<string, "key" | "normal" | "minor"> = {
  key: "key", core: "key", critical: "key", high: "key", main: "key", clé: "key", majeur: "key",
  normal: "normal", medium: "normal", default: "normal",
  minor: "minor", low: "minor", polish: "minor", context: "minor", mineur: "minor",
};
const STAKES: Record<string, "revenue" | "conversion" | "retention" | "trust" | "seo" | "cost" | "ops"> = {
  revenue: "revenue", money: "revenue", pricing: "revenue", sales: "revenue", revenu: "revenue", revenus: "revenue",
  conversion: "conversion", signup: "conversion", activation: "conversion", growth: "conversion", acquisition: "conversion",
  retention: "retention", engagement: "retention", churn: "retention", rétention: "retention",
  trust: "trust", security: "trust", brand: "trust", quality: "trust", confiance: "trust", privacy: "trust",
  seo: "seo", traffic: "seo", search: "seo",
  cost: "cost", costs: "cost", coût: "cost", infra: "cost",
  ops: "ops", operations: "ops", support: "ops", moderation: "ops", admin: "ops",
};
const STATUSES: Record<string, "new" | "changed" | "removed"> = {
  new: "new", added: "new", nouveau: "new", nouvelle: "new",
  changed: "changed", modified: "changed", updated: "changed", modifié: "changed",
  removed: "removed", deleted: "removed", supprimé: "removed",
};

const lookup = <T>(table: Record<string, T>, value: unknown): T | undefined =>
  typeof value === "string" ? table[value.trim().toLowerCase()] : undefined;
const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));
const integer = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number.parseInt(str(value), 10);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const bool = (value: unknown): boolean => value === true || value === "true" || value === 1;

export function normalizeAnswer(input: unknown): unknown {
  const root = record(input);
  const reviewIn = root.review && typeof root.review === "object" ? record(root.review) : null;
  return {
    title: str(root.title),
    pitch: str(root.pitch),
    summary: str(root.summary),
    audience: list(root.audience).map(str).filter(Boolean),
    stakes: list(root.stakes).map((raw) => {
      const stake = record(raw);
      return { kind: lookup(STAKES, stake.kind) ?? "conversion", text: str(stake.text) };
    }),
    screens: list(root.screens).map((raw) => {
      const screen = record(raw);
      return {
        route: str(screen.route),
        title: str(screen.title),
        status: lookup(STATUSES, screen.status) ?? "changed",
        change: str(screen.change),
        lookAt: str(screen.lookAt),
        login: bool(screen.login),
      };
    }),
    steps: list(root.steps).map((raw) => {
      const step = record(raw);
      return {
        group: str(step.group),
        title: str(step.title),
        explanation: str(step.explanation),
        importance: lookup(IMPORTANCE, step.importance) ?? "normal",
        screens: list(step.screens).map(str).filter(Boolean),
        files: list(step.files).map(str).filter(Boolean),
        notes: list(step.notes).map((rawNote) => {
          const note = record(rawNote);
          const level = lookup(LEVELS, note.level);
          const kind = lookup(NOTE_KINDS, note.kind) ?? (level ? "risk" : "question");
          return { kind, level: kind === "risk" ? (level ?? "medium") : null, text: str(note.text) };
        }),
      };
    }),
    checks: list(root.checks).map((raw) => {
      const check = record(raw);
      const route = str(check.route).trim();
      return { text: str(check.text), route: route || null };
    }),
    review: reviewIn
      ? {
          impact: Number(reviewIn.impact ?? reviewIn.complexity) || 5,
          reason: str(reviewIn.reason),
          risks: list(reviewIn.risks).map((rawRisk) => {
            const risk = record(rawRisk);
            return { level: lookup(LEVELS, risk.level) ?? "medium", text: str(risk.text), step: integer(risk.step) };
          }),
        }
      : null,
  };
}

const REQUIRED_ROOT = ["title", "pitch", "summary", "screens", "steps", "checks"] as const;
const REQUIRED_STEP = ["title", "explanation", "screens", "notes"] as const;

/**
 * Field names the answer leaves out. Normalization forgives near-miss enum values, not missing
 * fields: an answer written against another shape would otherwise parse into an empty tour.
 */
export function missingFields(input: unknown): string[] {
  const root = record(input);
  const missing: string[] = REQUIRED_ROOT.filter((key) => !(key in root));
  list(root.steps).forEach((raw, index) => {
    const step = record(raw);
    for (const key of REQUIRED_STEP) if (!(key in step)) missing.push(`steps[${index}].${key}`);
  });
  return missing;
}

/** Pulls the JSON object out of an agent answer, tolerating a Markdown fence or stray prose. */
export function parseAnswer(answer: string): { ok: true; value: RawWalkthrough } | { ok: false; error: string } {
  let body = answer.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(body);
  if (fence) body = fence[1].trim();
  if (!body.startsWith("{")) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end <= start) return { ok: false, error: "no JSON object found" };
    body = body.slice(start, end + 1);
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (error) {
    return { ok: false, error: `invalid JSON (${(error as Error).message})` };
  }
  const missing = missingFields(json);
  if (missing.length) {
    const shown = missing.slice(0, 8).join(", ");
    return { ok: false, error: `missing fields: ${shown}${missing.length > 8 ? ", …" : ""}` };
  }
  const parsed = RawSchema.safeParse(normalizeAnswer(json));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `schema mismatch at ${issue.path.join(".") || "root"}: ${issue.message}` };
  }
  if (parsed.data.steps.length === 0) return { ok: false, error: "the walkthrough has no steps" };
  return { ok: true, value: parsed.data };
}

/** Turns "https://site/x?y" or "x" into "/x?y"; returns null for anything that is not a path. */
export function cleanRoute(route: string): string | null {
  let value = route.trim();
  if (!value) return null;
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      value = url.pathname + url.search;
    }
  } catch {
    return null;
  }
  if (!value.startsWith("/")) value = `/${value}`;
  if (/[\[\]{}*]|\/:[a-z]/i.test(value) || /\s/.test(value)) return null;
  return value;
}

export function shapeWalkthrough(input: {
  raw: RawWalkthrough;
  diff: Diff;
  resolved: ResolvedScope;
  provider: string;
  modelLabel: string;
  language: string;
  costUsd: number | null;
  durationMs: number;
  captures: boolean;
}): Walkthrough {
  const { raw, diff, resolved } = input;
  const stepCount = raw.steps.length;
  const validStep = (n: number) => (Number.isInteger(n) && n >= 1 && n <= stepCount ? n : null);

  const screens: Screen[] = [];
  for (const screen of raw.screens) {
    const route = cleanRoute(screen.route);
    if (!route || screens.some((s) => s.route === route)) continue;
    screens.push({
      route,
      title: screen.title.trim() || route,
      status: screen.status,
      change: screen.change.trim(),
      lookAt: screen.lookAt.trim(),
      login: screen.login,
      shot: null,
    });
  }
  const known = new Set(screens.map((s) => s.route));

  const reviewRisks = (raw.review?.risks ?? []).map((r) => ({ ...r, step: validStep(r.step) }));

  const steps: Step[] = raw.steps.map((rawStep, index) => {
    const files = rawStep.files
      .map((path) => findFile(diff.files, path)?.path ?? null)
      .filter((path): path is string => path !== null);
    const stepScreens = rawStep.screens
      .map((route) => cleanRoute(route))
      .filter((route): route is string => route !== null && known.has(route));
    const notes = rawStep.notes
      .filter((n) => n.text.trim())
      .map((n) => ({ kind: n.kind, level: n.kind === "risk" ? (n.level ?? "medium") : null, text: n.text.trim() }));
    const stepNumber = index + 1;
    return {
      id: `s${stepNumber}`,
      group: rawStep.group.trim(),
      title: rawStep.title.trim(),
      explanation: rawStep.explanation.trim(),
      importance: rawStep.importance,
      risk: maxRisk([
        ...notes.map((n) => n.level),
        ...reviewRisks.filter((r) => r.step === stepNumber).map((r) => r.level),
      ]),
      screens: [...new Set(stepScreens)],
      files: [...new Set(files)],
      notes,
    };
  });

  const review = raw.review
    ? {
        impact: Math.min(10, Math.max(1, Math.round(raw.review.impact * 2) / 2)),
        reason: raw.review.reason.trim(),
        risks: reviewRisks.sort((a, b) => RANK[b.level] - RANK[a.level]),
      }
    : null;

  return {
    version: 2,
    scope: resolved.scope,
    scopeLabel: resolved.label,
    scopeInfo: resolved.info,
    base: resolved.base,
    branch: resolved.branch,
    headSha: resolved.headSha,
    fingerprint: diff.fingerprint,
    generatedAt: new Date().toISOString(),
    durationMs: input.durationMs,
    provider: input.provider,
    modelLabel: input.modelLabel,
    costUsd: input.costUsd,
    language: input.language,
    title: raw.title.trim(),
    pitch: raw.pitch.trim(),
    summary: raw.summary.trim(),
    audience: raw.audience.map((a) => a.trim()).filter(Boolean),
    stakes: raw.stakes.filter((s) => s.text.trim()).map((s) => ({ kind: s.kind, text: s.text.trim() })),
    screens,
    steps,
    checks: raw.checks
      .filter((c) => c.text.trim())
      .map((c, i) => ({ id: `c${i + 1}`, text: c.text.trim(), route: c.route ? cleanRoute(c.route) : null })),
    review,
    captures: {
      state: !input.captures ? "skipped" : screens.length ? "pending" : "skipped",
      reason: !input.captures ? "disabled" : screens.length ? null : "no-screens",
      note: null,
      anonymous: false,
    },
    totals: {
      files: diff.files.length,
      additions: diff.files.reduce((sum, f) => sum + f.additions, 0),
      deletions: diff.files.reduce((sum, f) => sum + f.deletions, 0),
    },
  };
}
