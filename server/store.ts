import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gitDir } from "./git";
import { type Progress, type ScopeKind, Walkthrough } from "../shared/walkthrough";
import { z } from "zod";

// Walkthroughs live inside the worktree's own git directory: never committed, never in the way,
// and each worktree keeps its own.
async function folder(cwd: string): Promise<string> {
  const dir = join(await gitDir(cwd), "paseo-walkthrough");
  await mkdir(dir, { recursive: true });
  return dir;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value), "utf8");
  await rename(temp, path);
}

export async function loadWalkthrough(cwd: string, scope: ScopeKind): Promise<Walkthrough | null> {
  const parsed = Walkthrough.safeParse(await readJson(join(await folder(cwd), `${scope}.json`)));
  return parsed.success ? parsed.data : null;
}

export async function saveWalkthrough(cwd: string, walkthrough: Walkthrough): Promise<void> {
  await writeJson(join(await folder(cwd), `${walkthrough.scope}.json`), walkthrough);
}

const StoredProgress = z.object({
  generatedAt: z.string(),
  read: z.array(z.string()),
  last: z.string().nullable(),
  checked: z.array(z.string()).default([]),
});

export async function loadProgress(cwd: string, scope: ScopeKind, generatedAt: string | null): Promise<Progress> {
  const parsed = StoredProgress.safeParse(await readJson(join(await folder(cwd), `${scope}.progress.json`)));
  if (!parsed.success || !generatedAt || parsed.data.generatedAt !== generatedAt) return { read: [], last: null, checked: [] };
  return { read: parsed.data.read, last: parsed.data.last, checked: parsed.data.checked };
}

export async function saveProgress(cwd: string, scope: ScopeKind, generatedAt: string, progress: Progress): Promise<void> {
  await writeJson(join(await folder(cwd), `${scope}.progress.json`), { generatedAt, ...progress });
}
