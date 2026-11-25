import {
  type PluginWorkspacePanelProps,
  useRpc,
  useSettings,
  useTabState,
  useTranslation,
  useWorkspace,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { z } from "zod";
import {
  cancelWalkthrough,
  getWalkthrough,
  type Phase,
  type Progress,
  ScopeKind,
  scopeKinds,
  setProgress,
  settingsDefinition,
  startWalkthrough,
  type Walkthrough,
} from "../shared/walkthrough";
import { AskBox } from "./ask";
import { Button, IconButton, SectionLabel } from "./bits";
import { messages, type T } from "./messages";
import { Overview, resumeStep } from "./overview";
import { openWalkthroughSettings } from "./runtime";
import { describeScope, scopeTitle } from "./scope";
import { ScreenView, StepHeader, StepView } from "./step";
import { alpha, type Colors, type PressState, riskColor } from "./style";
import { usePanelKeys } from "./web";

const TabState = z.object({ scope: ScopeKind.nullable(), view: z.string() });
const RAIL_MIN_WIDTH = 900;

function elapsed(t: T, since: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  if (seconds < 60) return t("panel.seconds", { seconds });
  return t("panel.minutes", { minutes: Math.floor(seconds / 60), seconds: String(seconds % 60).padStart(2, "0") });
}

function phaseText(t: T, phase: Phase): string {
  switch (phase.key) {
    case "agentReading":
      return t("phase.agentReading", { model: phase.model ?? "", count: phase.count ?? 0 });
    case "warming":
      return t("phase.warming", { index: phase.index ?? 0, count: phase.count ?? 0 });
    case "capturing":
      return t("phase.capturing", { count: phase.count ?? 0 });
    default:
      return t(`phase.${phase.key}`);
  }
}

function ScopePicker(props: { colors: Colors; value: ScopeKind; onChange: (scope: ScopeKind) => void; compact: boolean }) {
  const { colors } = props;
  const { t } = useTranslation(messages);
  return (
    <View style={{ flexDirection: "row", padding: 2, gap: 2, borderRadius: 8, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, flexShrink: 1 }}>
      {scopeKinds.map((kind) => {
        const active = kind === props.value;
        return (
          <Pressable
            key={kind}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => props.onChange(kind)}
            style={({ hovered }: PressState) => ({
              paddingHorizontal: props.compact ? 8 : 10,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: active ? colors.surface2 : hovered ? alpha(colors.surface2, 0.6) : "transparent",
            })}
          >
            <Text numberOfLines={1} style={{ color: active ? colors.foreground : colors.foregroundMuted, fontSize: 12, fontWeight: active ? "600" : "400" }}>
              {scopeTitle(t, kind, props.compact)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Rail(props: {
  colors: Colors;
  walkthrough: Walkthrough;
  progress: Progress;
  view: string;
  onOpen: (view: string) => void;
}) {
  const { colors, walkthrough: w } = props;
  const { t } = useTranslation(messages);
  const read = new Set(props.progress.read);
  const palette = [colors.accent, colors.statusSuccess, colors.statusWarning, colors.statusDanger, colors.foregroundMuted];
  const groups: { name: string; color: string; steps: { id: string; title: string; index: number; risk: Walkthrough["steps"][number]["risk"] }[] }[] = [];
  w.steps.forEach((step, index) => {
    let group = groups.find((g) => g.name === step.group);
    if (!group) {
      group = { name: step.group, color: palette[groups.length % palette.length], steps: [] };
      groups.push(group);
    }
    group.steps.push({ id: step.id, title: step.title, index, risk: step.risk });
  });
  const row = (key: string, active: boolean, onPress: () => void, children: React.ReactNode) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ hovered }: PressState) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: active ? alpha(colors.accent, 0.14) : hovered ? colors.surface2 : "transparent",
      })}
    >
      {children}
    </Pressable>
  );
  return (
    <View style={{ width: 240, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: colors.border }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 12 }}>
      {row("overview", props.view === "overview", () => props.onOpen("overview"), (
        <>
          <Icon name="LayoutGrid" size={13} color={props.view === "overview" ? colors.accent : colors.foregroundMuted} />
          <Text style={{ color: colors.foreground, fontSize: 12.5, fontWeight: "600" }}>{t("panel.overview")}</Text>
        </>
      ))}
      {groups.map((group) => (
        <View key={group.name} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, marginBottom: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: group.color }} />
            <SectionLabel colors={colors}>{group.name || t("overview.ungrouped")}</SectionLabel>
          </View>
          {group.steps.map((step) => {
            const isRead = read.has(step.id);
            const active = props.view === step.id;
            return row(step.id, active, () => props.onOpen(step.id), (
              <>
                <View style={{ width: 14, alignItems: "center" }}>
                  {isRead ? (
                    <Icon name="Check" size={12} color={colors.statusSuccess} />
                  ) : (
                    <Text style={{ color: colors.foregroundMuted, fontSize: 10.5 }}>{step.index + 1}</Text>
                  )}
                </View>
                <Text numberOfLines={1} style={{ color: active || !isRead ? colors.foreground : colors.foregroundMuted, fontSize: 12, flex: 1 }}>
                  {step.title}
                </Text>
                {step.risk === "high" || step.risk === "medium" ? <Icon name="Flag" size={11} color={riskColor(colors, step.risk)} /> : null}
              </>
            ));
          })}
        </View>
      ))}
      {w.screens.length ? (
        <View style={{ gap: 2 }}>
          <View style={{ paddingHorizontal: 8, marginBottom: 2 }}>
            <SectionLabel colors={colors}>{t("panel.screens")}</SectionLabel>
          </View>
          {w.screens.map((screen) =>
            row(`screen:${screen.route}`, props.view === `screen:${screen.route}`, () => props.onOpen(`screen:${screen.route}`), (
              <>
                <Icon name="AppWindow" size={12} color={colors.foregroundMuted} />
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, flex: 1 }}>
                  {screen.title}
                </Text>
              </>
            )),
          )}
        </View>
      ) : null}
      {w.checks.length ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: 11, paddingHorizontal: 8 }}>
          {t("panel.checksProgress", {
            done: props.progress.checked.filter((id) => w.checks.some((c) => c.id === id)).length,
            total: w.checks.length,
          })}
        </Text>
      ) : null}
    </ScrollView>
    </View>
  );
}

function Centered(props: { colors: Colors; icon: string; title: string; body?: string; children?: React.ReactNode }) {
  const { colors } = props;
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 16 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: alpha(colors.accent, 0.12) }}>
        <Icon name={props.icon} size={22} color={colors.accent} />
      </View>
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700", textAlign: "center" }}>{props.title}</Text>
      {props.body ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 440 }}>{props.body}</Text>
      ) : null}
      {props.children}
    </View>
  );
}

export function WalkthroughPanel({ theme, layout, workspaceId, tab, navigation }: PluginWorkspacePanelProps) {
  const colors = theme.colors;
  const compact = layout.compact;
  const { t, locale } = useTranslation(messages);
  const workspace = useWorkspace(workspaceId, (w) => ({ directory: w.directory, branch: w.branch, projectKind: w.projectKind }));
  const settings = useSettings(settingsDefinition);
  const [tabState, setTabState] = useTabState(tab, TabState, { scope: null, view: "overview" });
  const scope: ScopeKind = tabState.scope ?? (settings.status === "ready" ? settings.values.defaultScope : "branch");
  const cwd = workspace?.directory ?? "";
  const queryClient = useQueryClient();
  const get = useRpc(getWalkthrough);
  const start = useRpc(startWalkthrough);
  const cancel = useRpc(cancelWalkthrough);
  const saveProgress = useRpc(setProgress);
  const queryKey = ["walkthrough", cwd, scope];

  const query = useQuery({
    queryKey,
    queryFn: () => get({ cwd, scope }),
    enabled: cwd !== "",
    refetchInterval: (q) => (q.state.data?.job?.state === "running" ? 2000 : 30000),
  });
  const data = query.data;
  const walkthrough = data?.walkthrough ?? null;
  const job = data?.job ?? null;
  const running = job?.state === "running";

  const [progress, setLocalProgress] = useState<Progress>({ read: [], last: null, checked: [] });
  const generatedAt = walkthrough?.generatedAt ?? null;
  useEffect(() => {
    if (data) setLocalProgress(data.progress);
    // Only take the server copy when a new walkthrough or scope arrives.
  }, [generatedAt, scope, data !== undefined]);

  const generate = useMutation({
    mutationFn: () => start({ cwd, scope, workspaceId, locale }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const recapture = useMutation({
    mutationFn: () => start({ cwd, scope, workspaceId, capturesOnly: true, locale }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const stop = useMutation({
    mutationFn: () => cancel({ cwd, scope }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // When a generation finishes, go back to the overview of the new walkthrough.
  const previousGeneratedAt = useRef(generatedAt);
  useEffect(() => {
    if (previousGeneratedAt.current && generatedAt && previousGeneratedAt.current !== generatedAt) {
      setTabState({ scope: tabState.scope, view: "overview" });
    }
    previousGeneratedAt.current = generatedAt;
  }, [generatedAt]);

  const view =
    walkthrough &&
    (walkthrough.steps.some((s) => s.id === tabState.view) ||
      (tabState.view.startsWith("screen:") && walkthrough.screens.some((s) => `screen:${s.route}` === tabState.view)))
      ? tabState.view
      : "overview";
  const stepIndex = walkthrough ? walkthrough.steps.findIndex((s) => s.id === view) : -1;
  const step = stepIndex >= 0 ? walkthrough!.steps[stepIndex] : null;

  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const wide = width >= RAIL_MIN_WIDTH && !compact;

  function persist(next: Progress) {
    setLocalProgress(next);
    void saveProgress({ cwd, scope, progress: next }).catch(() => undefined);
  }

  function open(nextView: string) {
    setTabState({ scope: tabState.scope, view: nextView });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (!nextView.startsWith("screen:") && nextView !== "overview" && nextView !== progress.last) persist({ ...progress, last: nextView });
  }

  function markRead(id: string, value: boolean, base: Progress = progress): Progress {
    const read = new Set(base.read);
    if (value) read.add(id);
    else read.delete(id);
    return { ...base, read: [...read] };
  }

  function next() {
    if (!walkthrough) return;
    if (!step) {
      const target = resumeStep(walkthrough, progress) ?? walkthrough.steps[0];
      if (target) open(target.id);
      return;
    }
    const nextStep = walkthrough.steps[stepIndex + 1];
    const updated = markRead(step.id, true, { ...progress, last: nextStep?.id ?? step.id });
    persist(updated);
    setTabState({ scope: tabState.scope, view: nextStep ? nextStep.id : "overview" });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function prev() {
    if (!walkthrough || !step) return;
    open(stepIndex > 0 ? walkthrough.steps[stepIndex - 1].id : "overview");
  }

  function toggleCheck(id: string) {
    const checked = new Set(progress.checked);
    if (checked.has(id)) checked.delete(id);
    else checked.add(id);
    persist({ ...progress, checked: [...checked] });
  }

  function toggleRead() {
    if (!step) return;
    persist(markRead(step.id, !progress.read.includes(step.id)));
  }

  const keysRef = usePanelKeys({
    j: next,
    k: prev,
    x: toggleRead,
    Escape: () => open("overview"),
  });

  const setScope = (kind: ScopeKind) => setTabState({ scope: kind, view: "overview" });

  const pad = compact ? 14 : 24;
  const modelLine = useMemo(() => {
    if (settings.status !== "ready") return "";
    const v = settings.values;
    return [
      v.provider ? v.provider.split("/").pop() : t("panel.defaultAgent"),
      v.language || t("panel.appLanguage"),
      v.review ? t("panel.withReview") : t("panel.withoutReview"),
    ].join(" · ");
  }, [settings, t]);
  const scopeText = data?.scope ? describeScope(t, data.scope) : scopeTitle(t, scope);

  let body: React.ReactNode;
  if (!workspace) {
    body = <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
  } else if (workspace.projectKind !== "git" || data?.git === false) {
    body = <Centered colors={colors} icon="FolderX" title={t("panel.noGitTitle")} body={t("panel.noGitBody")} />;
  } else if (query.isLoading) {
    body = <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
  } else if (query.isError) {
    body = (
      <Centered colors={colors} icon="TriangleAlert" title={t("panel.readErrorTitle")} body={(query.error as Error)?.message}>
        <Button colors={colors} small label={t("panel.retry")} onPress={() => query.refetch()} />
      </Centered>
    );
  } else if (!walkthrough && !running && job?.state !== "error") {
    body = data?.hasChanges ? (
      <Centered colors={colors} icon="Route" title={t("panel.readyTitle")} body={t("panel.readyBody", { scope: scopeText })}>
        <Button colors={colors} variant="primary" icon="Sparkles" label={t("panel.generate")} disabled={generate.isPending} onPress={() => generate.mutate()} />
        <Pressable onPress={openWalkthroughSettings}>
          {({ hovered }: PressState) => (
            <Text style={{ color: colors.foregroundMuted, fontSize: 11.5, textDecorationLine: hovered ? "underline" : "none" }}>{modelLine}</Text>
          )}
        </Pressable>
      </Centered>
    ) : (
      <Centered colors={colors} icon="CircleCheck" title={t("panel.nothingTitle")} body={t("panel.nothingBody", { scope: scopeText })} />
    );
  } else {
    body = (
      <View style={{ gap: 18 }}>
        {running && job ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: alpha(colors.accent, 0.4), backgroundColor: alpha(colors.accent, 0.07), flexWrap: "wrap" }}>
            <ActivityIndicator color={colors.accent} />
            <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                {walkthrough?.captures.state === "pending"
                  ? t("panel.jobCapturing")
                  : walkthrough
                    ? t("panel.jobRegenerating")
                    : t("panel.jobGenerating")}
              </Text>
              <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
                {phaseText(t, job.phase)} · {elapsed(t, job.startedAt, now)}
              </Text>
            </View>
            <Button colors={colors} small variant="ghost" label={t("panel.cancel")} disabled={stop.isPending} onPress={() => stop.mutate()} />
          </View>
        ) : null}
        {job?.state === "error" ? (
          <View style={{ gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: alpha(colors.statusDanger, 0.4), backgroundColor: alpha(colors.statusDanger, 0.07) }}>
            <Text style={{ color: colors.statusDanger, fontSize: 13, fontWeight: "600" }}>{t("panel.failed")}</Text>
            <Text selectable style={{ color: colors.foreground, fontSize: 12.5 }}>{job.error}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button colors={colors} small label={t("panel.retry")} icon="RefreshCw" onPress={() => generate.mutate()} />
              <Button colors={colors} small variant="ghost" label={t("panel.settingsShort")} onPress={openWalkthroughSettings} />
            </View>
          </View>
        ) : null}
        {walkthrough && step ? (
          <StepView
            colors={colors}
            compact={compact}
            cwd={cwd}
            walkthrough={walkthrough}
            step={step}
            index={stepIndex}
            capturing={running}
            read={progress.read.includes(step.id)}
            onToggleRead={toggleRead}
            onNext={next}
            ask={
              <AskBox
                colors={colors}
                workspaceId={workspaceId}
                directory={cwd}
                branch={workspace.branch ?? walkthrough.branch}
                walkthrough={walkthrough}
                step={step}
                openAgent={navigation?.openAgent}
              />
            }
          />
        ) : walkthrough && view.startsWith("screen:") ? (
          <ScreenView
            colors={colors}
            compact={compact}
            cwd={cwd}
            walkthrough={walkthrough}
            route={view.slice(7)}
            capturing={running}
            onOpen={open}
          />
        ) : walkthrough ? (
          <Overview
            colors={colors}
            compact={compact}
            width={Math.min(width - (wide ? 240 : 0), 900) - pad * 2}
            cwd={cwd}
            walkthrough={walkthrough}
            progress={progress}
            stale={data?.stale ?? false}
            busy={running || generate.isPending || recapture.isPending}
            capturing={running}
            onOpen={open}
            onRegenerate={() => generate.mutate()}
            onRecapture={() => recapture.mutate()}
            onToggleCheck={toggleCheck}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View
      ref={keysRef as never}
      style={{ flex: 1, backgroundColor: colors.surface0 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: compact ? 10 : 14,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <ScopePicker colors={colors} value={scope} onChange={setScope} compact={compact} />
        <View style={{ flex: 1 }} />
        {walkthrough ? (
          <IconButton colors={colors} icon="RefreshCw" label={t("panel.regenerate")} disabled={running || generate.isPending} onPress={() => generate.mutate()} />
        ) : null}
        <IconButton colors={colors} icon="Settings2" label={t("panel.settings")} onPress={openWalkthroughSettings} />
      </View>
      {walkthrough && step ? (
        <View style={{ paddingHorizontal: pad, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <StepHeader
            colors={colors}
            index={stepIndex}
            total={walkthrough.steps.length}
            title={step.title}
            onPrev={prev}
            onNext={next}
            onOverview={() => next()}
          />
        </View>
      ) : null}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {wide && walkthrough ? <Rail colors={colors} walkthrough={walkthrough} progress={progress} view={view} onOpen={open} /> : null}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: pad, paddingBottom: 48 }}>
          <View style={{ width: "100%", maxWidth: 900, alignSelf: "center" }}>{width > 0 ? body : null}</View>
        </ScrollView>
      </View>
    </View>
  );
}
