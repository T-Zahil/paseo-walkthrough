import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export const scopeKinds = ["branch", "uncommitted", "last-commit"] as const;
export const ScopeKind = z.enum(scopeKinds);
export type ScopeKind = z.infer<typeof ScopeKind>;

export const LANGUAGES = [
  "English",
  "Français",
  "Español",
  "Deutsch",
  "Italiano",
  "Português",
  "Nederlands",
  "Polski",
  "Svenska",
  "Türkçe",
  "Русский",
  "日本語",
  "한국어",
  "中文",
  "العربية",
] as const;

// App locales (and their base languages) mapped to the language name given to the agent.
const LOCALE_LANGUAGES: Record<string, (typeof LANGUAGES)[number]> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
  sv: "Svenska",
  tr: "Türkçe",
  ru: "Русский",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ar: "العربية",
};

/** The language a walkthrough is written in: the setting when set, else the app's language. */
export function walkthroughLanguage(setting: string, locale: string | undefined): string {
  if (setting.trim()) return setting.trim();
  const base = (locale ?? "").split("-")[0].toLowerCase();
  return LOCALE_LANGUAGES[locale ?? ""] ?? LOCALE_LANGUAGES[base] ?? "English";
}

/** What a scope covers, as data: the client words it in the app's language. */
export const ScopeInfo = z.object({
  kind: z.enum(["branch", "uncommitted", "last-commit", "empty-repo", "no-base"]),
  branch: z.string().nullable(),
  baseRef: z.string().nullable(),
  commit: z.string().nullable(),
});
export type ScopeInfo = z.infer<typeof ScopeInfo>;

// ---------------------------------------------------------------------------
// What the generating agent returns. Every field is required (nullable where
// optional) so the JSON schema works with strict structured-output providers.
// The walkthrough is written for the product owner, not for a code reviewer.
// ---------------------------------------------------------------------------

export const RiskLevel = z.enum(["high", "medium", "low"]);
export type RiskLevel = z.infer<typeof RiskLevel>;
export const NoteKind = z.enum(["risk", "decision", "question"]);
export type NoteKind = z.infer<typeof NoteKind>;
export const Importance = z.enum(["key", "normal", "minor"]);
export type Importance = z.infer<typeof Importance>;
export const StakeKind = z.enum(["revenue", "conversion", "retention", "trust", "seo", "cost", "ops"]);
export type StakeKind = z.infer<typeof StakeKind>;
export const ScreenStatus = z.enum(["new", "changed", "removed"]);
export type ScreenStatus = z.infer<typeof ScreenStatus>;

export const RawWalkthrough = z.object({
  title: z.string().describe("Name of the change as a product owner would say it, under 60 characters."),
  pitch: z.string().describe("One sentence: what users can now do, see or no longer suffer."),
  summary: z
    .string()
    .describe("Markdown, 3 to 6 sentences in plain words: what changes for users and for the business, and why."),
  audience: z.array(z.string()).describe("Who is affected: visitors, signed-in users, paying customers, admins…"),
  stakes: z
    .array(z.object({ kind: StakeKind, text: z.string() }))
    .describe("Business stakes: revenue, conversion, retention, trust, SEO, cost or operations. 1 to 5."),
  screens: z
    .array(
      z.object({
        route: z.string().describe("Concrete URL path to open, like /pricing or /tools/notion. Never a pattern."),
        title: z.string().describe("Human name of the screen, like 'Page de tarifs'."),
        status: ScreenStatus,
        change: z.string().describe("What a user sees differently on this screen, in one or two sentences."),
        lookAt: z.string().describe("Where to look and what to try when reviewing this screen."),
        login: z.boolean().describe("True when the screen needs a signed-in user."),
      }),
    )
    .describe("Every user-facing screen this change adds or modifies. Empty for purely invisible changes."),
  steps: z
    .array(
      z.object({
        group: z.string().describe("Short theme shared by related steps, like 'Inscription' or 'Paiement'."),
        title: z.string().describe("What changes for the user in this step, under 60 characters."),
        explanation: z
          .string()
          .describe("Markdown. Explain from the user's and the business's point of view. No code, no file names."),
        importance: Importance,
        screens: z.array(z.string()).describe("Routes from the screens list that show this step."),
        files: z.array(z.string()).describe("Repository paths behind this step (kept for follow-up questions, never shown)."),
        notes: z.array(
          z.object({
            kind: NoteKind,
            level: RiskLevel.nullable().describe("Required for risks, null otherwise."),
            text: z.string(),
          }),
        ),
      }),
    )
    .describe("A guided tour of the change, in the order a user meets it. Usually 2 to 8 steps."),
  checks: z
    .array(z.object({ text: z.string(), route: z.string().nullable() }))
    .describe("What to try by hand before shipping, each a concrete action with the expected result."),
  review: z
    .object({
      impact: z.number().describe("Business impact from 1 to 10, by halves."),
      reason: z.string().describe("One or two sentences justifying the impact score."),
      risks: z.array(
        z.object({ level: RiskLevel, text: z.string(), step: z.number().int().describe("1-based step number.") }),
      ),
    })
    .nullable(),
});
export type RawWalkthrough = z.infer<typeof RawWalkthrough>;

// ---------------------------------------------------------------------------
// What the plugin stores and shows.
// ---------------------------------------------------------------------------

export const Shot = z.object({
  desktop: z.string().nullable(),
  mobile: z.string().nullable(),
  error: z.string().nullable(),
});
export type Shot = z.infer<typeof Shot>;

export const Screen = z.object({
  route: z.string(),
  title: z.string(),
  status: ScreenStatus,
  change: z.string(),
  lookAt: z.string(),
  login: z.boolean(),
  shot: Shot.nullable(),
});
export type Screen = z.infer<typeof Screen>;

export const Step = z.object({
  id: z.string(),
  group: z.string(),
  title: z.string(),
  explanation: z.string(),
  importance: Importance,
  risk: RiskLevel.nullable(),
  screens: z.array(z.string()),
  files: z.array(z.string()),
  notes: z.array(z.object({ kind: NoteKind, level: RiskLevel.nullable(), text: z.string() })),
});
export type Step = z.infer<typeof Step>;

export const Review = z.object({
  impact: z.number(),
  reason: z.string(),
  risks: z.array(z.object({ level: RiskLevel, text: z.string(), step: z.number().nullable() })),
});
export type Review = z.infer<typeof Review>;

export const CaptureReason = z.enum([
  "disabled",
  "no-screens",
  "no-capture-command",
  "no-dev-command",
  "none-captured",
  "signed-out",
  "cancelled",
  "error",
]);
export type CaptureReason = z.infer<typeof CaptureReason>;

export const Captures = z.object({
  state: z.enum(["pending", "done", "skipped", "failed"]),
  /** Why the screenshots are missing or incomplete; null when there is nothing to say. */
  reason: CaptureReason.nullable().optional(),
  /** Raw detail (command output, error message), shown as is after the reason. */
  note: z.string().nullable(),
  anonymous: z.boolean(),
});
export type Captures = z.infer<typeof Captures>;

export const Walkthrough = z.object({
  version: z.literal(2),
  scope: ScopeKind,
  scopeLabel: z.string(),
  scopeInfo: ScopeInfo.optional(),
  base: z.string(),
  branch: z.string().nullable(),
  headSha: z.string(),
  fingerprint: z.string(),
  generatedAt: z.string(),
  durationMs: z.number(),
  provider: z.string(),
  modelLabel: z.string(),
  costUsd: z.number().nullable(),
  language: z.string(),
  title: z.string(),
  pitch: z.string(),
  summary: z.string(),
  audience: z.array(z.string()),
  stakes: z.array(z.object({ kind: StakeKind, text: z.string() })),
  screens: z.array(Screen),
  steps: z.array(Step),
  checks: z.array(z.object({ id: z.string(), text: z.string(), route: z.string().nullable() })),
  review: Review.nullable(),
  captures: Captures,
  totals: z.object({ files: z.number(), additions: z.number(), deletions: z.number() }),
});
export type Walkthrough = z.infer<typeof Walkthrough>;

export const Progress = z.object({
  read: z.array(z.string()),
  last: z.string().nullable(),
  checked: z.array(z.string()).default([]),
});
export type Progress = z.infer<typeof Progress>;

export const PhaseKey = z.enum([
  "reading",
  "agentReading",
  "repairing",
  "shaping",
  "startingSite",
  "warming",
  "capturing",
  "processingShots",
]);
export type PhaseKey = z.infer<typeof PhaseKey>;

export const Phase = z.object({
  key: PhaseKey,
  model: z.string().optional(),
  count: z.number().optional(),
  index: z.number().optional(),
});
export type Phase = z.infer<typeof Phase>;

export const Job = z.object({
  state: z.enum(["running", "error"]),
  startedAt: z.string(),
  phase: Phase,
  error: z.string().nullable(),
  agentId: z.string().nullable(),
});
export type Job = z.infer<typeof Job>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsDefinition = defineSettings({
  id: "walkthrough",
  scope: "host",
  version: 1,
  schema: z.object({
    review: z.boolean().default(true),
    provider: z.string().default(""),
    /** Empty: the language of the app that starts the walkthrough. */
    language: z.string().default(""),
    defaultScope: ScopeKind.default("branch"),
    instructions: z.string().default(""),
    captures: z.boolean().default(true),
    devCommand: z.string().default(""),
    captureCommand: z.string().default(""),
  }),
});
export type WalkthroughSettings = z.infer<(typeof settingsDefinition)["schema"]>;

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

const target = { cwd: z.string(), scope: ScopeKind };

export const getWalkthrough = defineRpc({
  name: "walkthrough.get",
  input: z.object(target),
  output: z.object({
    git: z.boolean(),
    scope: ScopeInfo.nullable(),
    hasChanges: z.boolean(),
    walkthrough: Walkthrough.nullable(),
    stale: z.boolean(),
    progress: Progress,
    job: Job.nullable(),
  }),
});

export const startWalkthrough = defineRpc({
  name: "walkthrough.start",
  input: z.object({
    ...target,
    workspaceId: z.string(),
    capturesOnly: z.boolean().optional(),
    /** The app's language, used when the language setting is empty. */
    locale: z.string().optional(),
  }),
  output: z.object({ ok: z.boolean() }),
});

export const cancelWalkthrough = defineRpc({
  name: "walkthrough.cancel",
  input: z.object(target),
  output: z.object({ ok: z.boolean() }),
});

export const setProgress = defineRpc({
  name: "walkthrough.progress",
  input: z.object({ ...target, progress: Progress }),
  output: z.object({ ok: z.boolean() }),
});

export const getImage = defineRpc({
  name: "walkthrough.image",
  input: z.object({ cwd: z.string(), file: z.string() }),
  output: z.instanceof(Uint8Array),
});

export const listModels = defineRpc({
  name: "walkthrough.models",
  input: z.object({}),
  output: z.object({
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    fallback: z.string().nullable(),
  }),
});
