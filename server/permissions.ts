import type { PluginHandlerContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHandlerContext["paseo"];
interface AgentPermissionRequest {
  id: string;
  input?: unknown;
}

const READ_ONLY_GIT =
  /^git\s+(?:-C\s+\S+\s+)?(?:--no-pager\s+)?(diff|log|show|status|blame|ls-files|ls-tree|grep|rev-parse|merge-base|cat-file|branch|describe|shortlog)\b/;
const DESTRUCTIVE_GIT_BRANCH = /^git\s+(?:-C\s+\S+\s+)?branch\b.*\s-(?:d|D|m|M|c|C|f)\b/;
const READ_ONLY_TOOLS =
  /^(cat|ls|head|tail|wc|rg|grep|egrep|fgrep|find|tree|file|stat|pwd|echo|printf|sed\s+-n|nl|sort|uniq|cut|tr|awk|jq|diff|basename|dirname|realpath|true)\b/;
const ASSIGNMENTS = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s*)+/;

function segmentIsReadOnly(raw: string): boolean {
  const segment = raw.trim().replace(ASSIGNMENTS, "").trim();
  if (segment === "") return true;
  if (/^cd(\s|$)/.test(segment)) return true;
  if (/\s-(?:delete|exec|execdir|ok|fprint\w*)\b/.test(segment)) return false;
  if (/^sed\b.*\s-i/.test(segment) || /system\s*\(/.test(segment)) return false;
  if (DESTRUCTIVE_GIT_BRANCH.test(segment)) return false;
  return READ_ONLY_GIT.test(segment) || READ_ONLY_TOOLS.test(segment);
}

function shellCommand(request: AgentPermissionRequest): string | null {
  const input = request.input as Record<string, unknown> | undefined;
  if (!input) return null;
  if (typeof input.command === "string") return input.command;
  if (typeof input.cmd === "string") return input.cmd;
  if (Array.isArray(input.command)) return input.command.join(" ");
  return null;
}

/** Splits a shell line on ; && || | and newlines outside quotes. Returns null on anything risky. */
function splitCommand(text: string): string[] | null {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (quote) {
      if (char === quote) quote = null;
      else if (quote === '"' && (char === "`" || (char === "$" && next === "("))) return null;
      else if (quote === '"' && char === "\\") {
        current += char + (next ?? "");
        i++;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\\") {
      current += char + (next ?? "");
      i++;
      continue;
    }
    if (char === "`" || (char === "$" && next === "(") || char === "<" || char === ">") return null;
    if (char === ";" || char === "\n" || char === "|" || (char === "&" && next === "&")) {
      if (char === "&" || (char === "|" && next === "|")) i++;
      segments.push(current);
      current = "";
      continue;
    }
    if (char === "&") return null;
    current += char;
  }
  if (quote) return null;
  segments.push(current);
  return segments.map((part) => part.trim()).filter((part) => part !== "");
}

export function isReadOnlyCommand(command: string): boolean {
  let text = command.trim();
  const wrapped = /^(?:bash|sh|zsh)\s+-l?c\s+(['"])([\s\S]*)\1$/.exec(text);
  if (wrapped) text = wrapped[2];
  // Harmless stderr redirections are fine; any other redirection or substitution is not.
  const segments = splitCommand(text.replace(/\s2>\s*\/dev\/null|\s2>&1/g, ""));
  return segments !== null && segments.length > 0 && segments.every(segmentIsReadOnly);
}

export async function answerGeneratorPermission(
  paseo: PaseoApi,
  agentId: string,
  request: AgentPermissionRequest,
): Promise<void> {
  const agent = paseo.agents.ref(agentId);
  const command = shellCommand(request);
  const allow = command !== null && isReadOnlyCommand(command);
  await agent
    .respondToPermission({
      requestId: request.id,
      response: allow
        ? { behavior: "allow" }
        : {
            behavior: "deny",
            message:
              "This session is read-only and nobody is watching it. Do not edit files or ask questions: answer from the diff and read-only commands, then return the JSON.",
          },
    })
    .catch(() => undefined);
}
