import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execCommand } from "@getpaseo/plugin/server";
import type { ScopeInfo, ScopeKind } from "../shared/walkthrough";

export interface DiffLine {
  t: "add" | "del" | "ctx";
  o: number | null;
  n: number | null;
  s: string;
}

const MAX_BUFFER = 256 * 1024 * 1024;
const UNTRACKED_MAX_BYTES = 200 * 1024;

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execCommand("git", args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout;
}

export async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  return (await tryGit(cwd, ["rev-parse", "--is-inside-work-tree"]))?.trim() === "true";
}

export async function gitDir(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--absolute-git-dir"])).trim();
}

export async function currentBranch(cwd: string): Promise<string | null> {
  const name = (await tryGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]))?.trim();
  return name || null;
}

async function verify(cwd: string, ref: string): Promise<boolean> {
  return (await tryGit(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) !== null;
}

/** origin/HEAD when it is set, else the first of origin/main, origin/master, main, master. */
export async function defaultBaseRef(cwd: string): Promise<string | null> {
  const remoteHead = (await tryGit(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]))?.trim();
  if (remoteHead && (await verify(cwd, remoteHead))) return remoteHead;
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    if (await verify(cwd, ref)) return ref;
  }
  return null;
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface ResolvedScope {
  scope: ScopeKind;
  /** English description, for prompts. */
  label: string;
  info: ScopeInfo;
  /** What the diff is taken against. */
  base: string;
  /** Second side of the diff; null means the working tree. */
  head: string | null;
  includeUntracked: boolean;
  headSha: string;
  branch: string | null;
}

export async function resolveScope(cwd: string, scope: ScopeKind): Promise<ResolvedScope> {
  const headSha = (await tryGit(cwd, ["rev-parse", "HEAD"]))?.trim() ?? "";
  const branch = await currentBranch(cwd);
  const info = (kind: ScopeInfo["kind"], extra: Partial<ScopeInfo> = {}): ScopeInfo => ({
    kind,
    branch,
    baseRef: null,
    commit: null,
    ...extra,
  });
  if (!headSha) {
    // Repository without commits: everything is new.
    return {
      scope,
      label: "The whole repository (no commits yet)",
      info: info("empty-repo"),
      base: EMPTY_TREE,
      head: null,
      includeUntracked: true,
      headSha: "",
      branch,
    };
  }
  if (scope === "uncommitted") {
    return {
      scope,
      label: "Uncommitted changes since HEAD",
      info: info("uncommitted"),
      base: "HEAD",
      head: null,
      includeUntracked: true,
      headSha,
      branch,
    };
  }
  if (scope === "last-commit") {
    const parent = (await verify(cwd, "HEAD~1")) ? "HEAD~1" : EMPTY_TREE;
    const subject = (await tryGit(cwd, ["log", "-1", "--format=%h %s"]))?.trim() ?? "HEAD";
    return {
      scope,
      label: `Last commit, ${subject}`,
      info: info("last-commit", { commit: subject }),
      base: parent,
      head: "HEAD",
      includeUntracked: false,
      headSha,
      branch,
    };
  }
  const baseRef = await defaultBaseRef(cwd);
  if (!baseRef) {
    return {
      scope,
      label: "Uncommitted changes (no main branch found)",
      info: info("no-base"),
      base: "HEAD",
      head: null,
      includeUntracked: true,
      headSha,
      branch,
    };
  }
  const mergeBase = (await tryGit(cwd, ["merge-base", "HEAD", baseRef]))?.trim() || baseRef;
  return {
    scope,
    label: `What ${branch ? `"${branch}"` : "HEAD"} adds to ${baseRef}, committed or not`,
    info: info("branch", { baseRef }),
    base: mergeBase,
    head: null,
    includeUntracked: true,
    headSha,
    branch,
  };
}

// ---------------------------------------------------------------------------
// Diff parsing
// ---------------------------------------------------------------------------

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffLine[][];
}

export interface Diff {
  text: string;
  files: DiffFile[];
  fingerprint: string;
}

function unquote(path: string): string {
  if (path.startsWith('"') && path.endsWith('"')) {
    try {
      return JSON.parse(path) as string;
    } catch {
      return path.slice(1, -1);
    }
  }
  return path;
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffLine[] | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git (?:"?a\/)(.+?)"? (?:"?b\/)(.+?)"?$/.exec(line);
      file = {
        path: match ? unquote(match[2]) : line.slice(11),
        oldPath: match ? unquote(match[1]) : null,
        status: "modified",
        binary: false,
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;
    if (!hunk) {
      if (line.startsWith("new file mode")) file.status = "added";
      else if (line.startsWith("deleted file mode")) file.status = "deleted";
      else if (line.startsWith("rename to ")) {
        file.status = "renamed";
        file.path = unquote(line.slice(10));
      } else if (line.startsWith("rename from ")) file.oldPath = unquote(line.slice(12));
      else if (line.startsWith("Binary files ")) file.binary = true;
      else if (line.startsWith("+++ ") && !line.startsWith("+++ /dev/null")) {
        file.path = unquote(line.slice(4)).replace(/^b\//, "");
      }
    }
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      oldNo = Number(header[1]);
      newNo = Number(header[2]);
      hunk = [];
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith("+")) {
      hunk.push({ t: "add", o: null, n: newNo++, s: line.slice(1) });
      file.additions += 1;
    } else if (line.startsWith("-")) {
      hunk.push({ t: "del", o: oldNo++, n: null, s: line.slice(1) });
      file.deletions += 1;
    } else if (line.startsWith(" ")) {
      hunk.push({ t: "ctx", o: oldNo++, n: newNo++, s: line.slice(1) });
    }
  }
  for (const entry of files) if (entry.oldPath === entry.path) entry.oldPath = null;
  return files;
}

async function untrackedDiff(cwd: string): Promise<string> {
  const list = await tryGit(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (!list) return "";
  const parts: string[] = [];
  for (const path of list.split("\0").filter(Boolean)) {
    const absolute = join(cwd, path);
    try {
      const info = await stat(absolute);
      if (!info.isFile()) continue;
      const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n`;
      if (info.size > UNTRACKED_MAX_BYTES) {
        parts.push(`diff --git a/${path} b/${path}\nnew file mode 100644\nBinary files /dev/null and b/${path} differ\n`);
        continue;
      }
      const content = await readFile(absolute);
      if (content.includes(0)) {
        parts.push(`diff --git a/${path} b/${path}\nnew file mode 100644\nBinary files /dev/null and b/${path} differ\n`);
        continue;
      }
      const lines = content.toString("utf8").replace(/\n$/, "").split("\n");
      if (content.length === 0) {
        parts.push(header);
        continue;
      }
      parts.push(`${header}@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`);
    } catch {
      // The file vanished between listing and reading.
    }
  }
  return parts.join("");
}

export async function readDiff(cwd: string, resolved: ResolvedScope): Promise<Diff> {
  const range = resolved.head ? [resolved.base, resolved.head] : [resolved.base];
  const tracked = await git(cwd, ["diff", "--no-color", "--no-ext-diff", "-M", "-U3", ...range, "--"]);
  const untracked = resolved.includeUntracked ? await untrackedDiff(cwd) : "";
  const text = tracked + (tracked && untracked && !tracked.endsWith("\n") ? "\n" : "") + untracked;
  return {
    text,
    files: parseUnifiedDiff(text),
    fingerprint: createHash("sha1").update(text).digest("hex"),
  };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/^[ab]\//, "");
}

export function findFile(files: DiffFile[], path: string): DiffFile | null {
  const wanted = normalizePath(path);
  return (
    files.find((f) => f.path === wanted || f.oldPath === wanted) ??
    files.find((f) => f.path.endsWith(`/${wanted}`) || wanted.endsWith(`/${f.path}`)) ??
    null
  );
}

export async function commonGitDir(cwd: string): Promise<string> {
  const dir = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
  return dir;
}

/** Every checkout of this repository (main one first), from git worktree list. */
export async function worktreePaths(cwd: string): Promise<string[]> {
  const out = (await tryGit(cwd, ["worktree", "list", "--porcelain"])) ?? "";
  return out
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice(9).trim());
}
