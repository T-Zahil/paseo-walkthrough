import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTranslations } from "@getpaseo/plugin/client";
import { afterAll, describe, expect, it } from "vitest";
import { en } from "../client/locales/en";
import { fr } from "../client/locales/fr";
import { resolveScope } from "../server/git";
import { isReadOnlyCommand } from "../server/permissions";
import { cleanRoute, parseAnswer } from "../server/shape";
import { walkthroughLanguage } from "../shared/walkthrough";

describe("read-only commands", () => {
  it("allows reading", () => {
    expect(isReadOnlyCommand("git diff main -- src/app.ts")).toBe(true);
    expect(isReadOnlyCommand("cd web && rg -n pricing src | head -20")).toBe(true);
    expect(isReadOnlyCommand("bash -lc 'cat package.json 2>/dev/null'")).toBe(true);
  });

  it("refuses writing, substitution and redirection", () => {
    expect(isReadOnlyCommand("rm -rf src")).toBe(false);
    expect(isReadOnlyCommand("git checkout main")).toBe(false);
    expect(isReadOnlyCommand("git branch -D feature")).toBe(false);
    expect(isReadOnlyCommand("sed -i s/a/b/ file")).toBe(false);
    expect(isReadOnlyCommand("cat $(which node)")).toBe(false);
    expect(isReadOnlyCommand("echo hi > file")).toBe(false);
    expect(isReadOnlyCommand("find . -delete")).toBe(false);
  });
});

describe("agent answers", () => {
  const answer = {
    title: "Annual plan",
    pitch: "Customers can pay yearly.",
    summary: "Adds an annual plan.",
    audience: ["visitors"],
    stakes: [{ kind: "Pricing", text: "More upfront revenue" }],
    screens: [{ route: "https://example.com/pricing", title: "Pricing", status: "modified", change: "x", lookAt: "y", login: false }],
    steps: [{ group: "", title: "Pick a plan", explanation: "…", importance: "core", screens: ["/pricing"], files: [], notes: [{ kind: "warning", level: "Critical", text: "Tax" }] }],
    checks: [{ text: "Open /pricing", route: "/pricing" }],
    review: null,
  };

  it("reads JSON inside a fence and normalizes near-miss enums", () => {
    const parsed = parseAnswer(`Here it is:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.stakes[0].kind).toBe("revenue");
    expect(parsed.value.screens[0].status).toBe("changed");
    expect(parsed.value.steps[0].importance).toBe("key");
    expect(parsed.value.steps[0].notes[0]).toMatchObject({ kind: "risk", level: "high" });
  });

  it("rejects an answer written with other field names, so the agent is asked again", () => {
    const { screens: _screens, ...rest } = answer;
    const renamed = {
      ...rest,
      steps: answer.steps.map(({ explanation: _explanation, ...step }) => ({ ...step, description: "…" })),
    };
    expect(parseAnswer(JSON.stringify(renamed))).toEqual({
      ok: false,
      error: "missing fields: screens, steps[0].explanation",
    });
  });

  it("rejects an answer without steps", () => {
    expect(parseAnswer(JSON.stringify({ ...answer, steps: [] }))).toEqual({ ok: false, error: "the walkthrough has no steps" });
  });

  it("keeps concrete paths only", () => {
    expect(cleanRoute("https://site.test/tools/notion?x=1")).toBe("/tools/notion?x=1");
    expect(cleanRoute("pricing")).toBe("/pricing");
    expect(cleanRoute("/tools/[slug]")).toBeNull();
    expect(cleanRoute("/users/:id")).toBeNull();
  });
});

describe("walkthrough language", () => {
  it("prefers the setting, then the app locale, then English", () => {
    expect(walkthroughLanguage("Deutsch", "fr")).toBe("Deutsch");
    expect(walkthroughLanguage("", "fr")).toBe("Français");
    expect(walkthroughLanguage("", "pt-BR")).toBe("Português");
    expect(walkthroughLanguage("", "zh-CN")).toBe("中文");
    expect(walkthroughLanguage("", "xx")).toBe("English");
    expect(walkthroughLanguage("", undefined)).toBe("English");
  });
});

describe("translations", () => {
  it("are accepted by the Paseo runtime", () => {
    expect(() => defineTranslations({ resources: { en, fr } })).not.toThrow();
  });
});

describe("scopes", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function repo(): string {
    const dir = mkdtempSync(join(tmpdir(), "walkthrough-"));
    dirs.push(dir);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    return dir;
  }

  it("describes an empty repository", async () => {
    const scope = await resolveScope(repo(), "branch");
    expect(scope.info.kind).toBe("empty-repo");
  });

  it("describes the branch against main", async () => {
    const dir = repo();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
    writeFileSync(join(dir, "a.txt"), "a\n");
    git("add", ".");
    git("commit", "-q", "-m", "first");
    git("checkout", "-q", "-b", "feature");
    const scope = await resolveScope(dir, "branch");
    expect(scope.info).toEqual({ kind: "branch", branch: "feature", baseRef: "main", commit: null });
    expect(scope.label).toBe('What "feature" adds to main, committed or not');

    const last = await resolveScope(dir, "last-commit");
    expect(last.info.kind).toBe("last-commit");
    expect(last.info.commit).toMatch(/^[0-9a-f]+ first$/);
  });
});
