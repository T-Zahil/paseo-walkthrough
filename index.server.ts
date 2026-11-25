import type { PluginServerContext } from "@getpaseo/plugin/server";
import { GENERATOR_TITLE, Generator, modelCatalog } from "./server/generate";
import { readShot } from "./server/capture";
import { isGitRepo, readDiff, resolveScope } from "./server/git";
import { answerGeneratorPermission } from "./server/permissions";
import { loadProgress, loadWalkthrough, saveProgress } from "./server/store";
import {
  cancelWalkthrough,
  getImage,
  getWalkthrough,
  listModels,
  setProgress,
  settingsDefinition,
  startWalkthrough,
  type WalkthroughSettings,
} from "./shared/walkthrough";

const DEFAULTS: WalkthroughSettings = settingsDefinition.schema.parse({});

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(settingsDefinition);
  let generator: Generator | null = null;
  const generatorFor = (paseo: ConstructorParameters<typeof Generator>[0]) => (generator ??= new Generator(paseo));

  server.handle(getWalkthrough, async ({ cwd, scope }, { paseo }) => {
    const job = generatorFor(paseo).job(cwd, scope);
    if (!(await isGitRepo(cwd))) {
      return { git: false, scopeLabel: "", hasChanges: false, walkthrough: null, stale: false, progress: { read: [], last: null, checked: [] }, job };
    }
    const resolved = await resolveScope(cwd, scope);
    const diff = await readDiff(cwd, resolved);
    const walkthrough = await loadWalkthrough(cwd, scope);
    const progress = await loadProgress(cwd, scope, walkthrough?.generatedAt ?? null);
    return {
      git: true,
      scopeLabel: resolved.label,
      hasChanges: diff.files.length > 0,
      walkthrough,
      stale: walkthrough ? walkthrough.fingerprint !== diff.fingerprint : false,
      progress,
      job,
    };
  });

  server.handle(startWalkthrough, async ({ cwd, scope, workspaceId, capturesOnly }, { paseo }) => {
    const current = await settings.read();
    const values = current.status === "ready" ? current.values : DEFAULTS;
    generatorFor(paseo).start({ cwd, scope, workspaceId, settings: values, capturesOnly });
    return { ok: true };
  });

  server.handle(cancelWalkthrough, async ({ cwd, scope }, { paseo }) => {
    await generatorFor(paseo).cancel(cwd, scope);
    return { ok: true };
  });

  server.handle(setProgress, async ({ cwd, scope, progress }) => {
    const walkthrough = await loadWalkthrough(cwd, scope);
    if (!walkthrough) return { ok: false };
    await saveProgress(cwd, scope, walkthrough.generatedAt, progress);
    return { ok: true };
  });

  server.handle(getImage, async ({ cwd, file }) => readShot(cwd, file));

  server.handle(listModels, async (_input, { paseo }) => modelCatalog(paseo));

  // The generator only reads. Answer its permission requests so it never waits on a person.
  server.addHook("agent.permission.before", async (event, context) => {
    const ours =
      generator?.owns(event.agent.id) || (event.agent.background && event.agent.title?.startsWith(GENERATOR_TITLE));
    if (!ours) return;
    await answerGeneratorPermission(context.paseo, event.agent.id, event.request);
  });

  return async () => {
    await generator?.dispose();
  };
}
