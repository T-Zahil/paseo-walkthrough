import type { Diff, ResolvedScope } from "./git";

const MAX_DIFF_CHARS = 140_000;

export function buildPrompt(input: {
  diff: Diff;
  resolved: ResolvedScope;
  language: string;
  review: boolean;
  instructions: string;
}): string {
  const { diff, resolved, language, review, instructions } = input;
  const range = resolved.head ? `${resolved.base} ${resolved.head}` : resolved.base;
  const fileList = diff.files
    .map((f) => {
      const stat = f.binary ? "binary" : `+${f.additions} -${f.deletions}`;
      return `- ${f.path} [${f.status}, ${stat}]`;
    })
    .join("\n");
  const truncated = diff.text.length > MAX_DIFF_CHARS;
  const diffText = truncated ? `${diff.text.slice(0, MAX_DIFF_CHARS)}\n[... diff truncated ...]` : diff.text;

  return `You are a product manager walking the founder of this product through a change before it ships. The founder does not read code and does not care about implementation. They want to understand what users will see and do differently, why it matters for the business, what could go wrong for users or revenue, and what to check by hand.

The change: ${resolved.label}.
${truncated ? `The diff below is truncated. Read the rest with read-only commands such as \`git diff ${range} -- <path>\`${resolved.includeUntracked ? " (untracked files are not in git diff: read them directly)" : ""}.` : "The complete diff is below."} Read the surrounding code (routes, pages, components, emails, pricing, permissions) as much as you need to understand the user-facing result. Use read-only commands only.

Rules:
- Do NOT modify any file, run the app, install anything or create commits.
- Write every human-readable string in ${language}, in plain words a non-developer understands. Never mention function names, components, files, database tables, migrations, endpoints or libraries in the text. Say "the pricing page", "the signup email", "paying members", not "PricingCard.vue" or "the users table".
- "screens" lists every page or screen a user can open that this change adds or modifies, with a concrete URL path the app serves (read the router or the pages folder). For a page with a dynamic segment, pick a real-looking example value found in the code, seeds or fixtures; if none can work, leave that screen out. Set "login" to true when the page requires a signed-in user. Emails, notifications or background behaviour are not screens: describe them in the steps instead.
- "steps" is a guided tour in the order a user meets the change. Each step is one thing that changes for someone (a visitor, a customer, an admin), with its screens. Use "key" for the 1 to 3 changes that matter most, "minor" for small polish. "files" lists the repository paths behind the step; they are hidden from the founder and only used if they ask a follow-up question.
- "notes" flag what the founder must notice in a step: "risk" (with level high, medium or low) for something that could hurt users, trust or revenue; "decision" for a product or business choice the founder should confirm; "question" for something unclear in the change. Zero to three notes per step; no filler.
- "stakes" says why this matters for the business (revenue, conversion, retention, trust, SEO, cost, operations), concretely.
- "checks" are hands-on things to try before shipping, each phrased as an action and its expected result ("Open /pricing signed out: the new annual plan shows 290 €"). Point at a route when there is one.
${
  review
    ? `- "review": "impact" from 1 to 10 by halves (1 = invisible polish, 5 = a noticeable improvement for some users, 10 = changes how the business makes money or how most users use the product), with a short "reason", and "risks" for users or the business, each pointing at its step (1-based). Only real, specific risks.`
    : `- Set "review" to null.`
}
${instructions.trim() ? `\nAdditional instructions from the founder:\n${instructions.trim()}\n` : ""}
Return only the JSON object that matches the requested schema, with no prose around it.

Changed files (${diff.files.length}):
${fileList}

Diff:
\`\`\`diff
${diffText}
\`\`\`
`;
}

export function repairPrompt(error: string): string {
  return `Your last answer could not be used: ${error}
Answer again with only the JSON object that matches the schema, with no Markdown fence and no prose.`;
}
