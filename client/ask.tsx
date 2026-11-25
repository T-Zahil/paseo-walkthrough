import { type AgentRef, useAgent, useAgents, usePaseo, useRpc, useSettings, useTranslation } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { listModels, settingsDefinition, type Step, type Walkthrough } from "../shared/walkthrough";
import { Button } from "./bits";
import { messages } from "./messages";
import { alpha, type Colors, type PressState } from "./style";

export function stepBrief(walkthrough: Walkthrough, step: Step): string {
  const index = walkthrough.steps.indexOf(step) + 1;
  const notes = step.notes.map((n) => `- ${n.kind}${n.level ? ` (${n.level})` : ""}: ${n.text}`).join("\n");
  const screens = step.screens
    .map((route) => walkthrough.screens.find((s) => s.route === route))
    .filter((s) => s !== undefined)
    .map((s) => `- ${s.title} (${s.route}): ${s.change}`)
    .join("\n");
  return [
    `Walkthrough step ${index}/${walkthrough.steps.length}: "${step.title}" (${step.group}).`,
    `Change under review: ${walkthrough.scopeLabel}. ${walkthrough.pitch}`,
    "",
    "What the step says:",
    step.explanation,
    notes ? `\nNotes:\n${notes}` : "",
    screens ? `\nScreens:\n${screens}` : "",
    step.files.length ? `\nFiles behind it: ${step.files.join(", ")}` : "",
    "\nI do not read code: answer in plain product terms unless I ask for code.",
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "step"
  );
}

function AgentChip(props: { colors: Colors; agent: AgentRef; selected: boolean; onSelect: (id: string) => void }) {
  const { colors } = props;
  const { t } = useTranslation(messages);
  const agent = useAgent(props.agent, (a) => ({ id: a.id, title: a.title, provider: a.provider, status: a.status }));
  if (!agent) return null;
  const busy = agent.status === "running";
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      onPress={() => props.onSelect(agent.id)}
      style={({ hovered }: PressState) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        maxWidth: 220,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: props.selected ? colors.accent : colors.border,
        backgroundColor: props.selected ? alpha(colors.accent, 0.12) : hovered ? colors.surface2 : colors.surface1,
      })}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: busy ? colors.statusWarning : colors.statusSuccess }} />
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, flexShrink: 1 }}>
        {agent.title || agent.provider}
      </Text>
      <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{busy ? t("ask.busy") : t("ask.idle")}</Text>
    </Pressable>
  );
}

export function AskBox(props: {
  colors: Colors;
  workspaceId: string;
  directory: string;
  branch: string | null;
  walkthrough: Walkthrough;
  step: Step;
  openAgent?: (input: { agentId: string }) => void;
}) {
  const { colors, walkthrough, step } = props;
  const { t } = useTranslation(messages);
  const paseo = usePaseo();
  const toast = useToast();
  const settings = useSettings(settingsDefinition);
  const models = useRpc(listModels);
  const agents = useAgents({
    where: (a) => a.workspaceId === props.workspaceId && !a.background && a.status !== "closed" && a.status !== "error",
    orderBy: ["lastActivityAt", "desc"],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<"send" | "session" | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const agentIds = agents.map((ref) => ref.id);
  useEffect(() => {
    if (selected && agentIds.includes(selected)) return;
    setSelected(agentIds[0] ?? null);
  }, [agentIds.join(","), selected]);
  useEffect(() => setSentTo(null), [step.id]);

  const index = walkthrough.steps.indexOf(step) + 1;
  const message = () => {
    const ask = question.trim() || t("ask.defaultQuestion");
    return `${ask}\n\n---\n${stepBrief(walkthrough, step)}`;
  };

  async function send() {
    if (!selected) return;
    setPending("send");
    try {
      await paseo.agents.ref(selected).send(message());
      setQuestion("");
      setSentTo(selected);
      toast.show(t("ask.sent"), { variant: "success" });
    } catch (error) {
      toast.error(t("ask.sendFailed", { error: (error as Error).message }));
    } finally {
      setPending(null);
    }
  }

  async function newSession() {
    setPending("session");
    try {
      let provider = settings.status === "ready" ? settings.values.provider : "";
      if (!provider) provider = (await models({})).fallback ?? "";
      if (!provider) throw new Error(t("ask.noAgent"));
      const title = t("ask.sessionTitle", { step: index, title: step.title });
      const workspace = await paseo.workspaces.create({
        source: {
          kind: "worktree",
          cwd: props.directory,
          action: "branch-off",
          refName: props.branch ?? "HEAD",
          branchName: `walkthrough/step-${index}-${slug(step.title)}-${Date.now().toString(36).slice(-4)}`,
        },
        title,
      } as never);
      const agent = await workspace.agents.create({
        config: { provider },
        title,
        prompt: `${message()}\n\nYou are in a fresh worktree branched off ${props.branch ?? "HEAD"}. Uncommitted changes from the original worktree (${props.directory}) are not here.`,
      });
      setQuestion("");
      toast.show(t("ask.sessionStarted"), { variant: "success" });
      props.openAgent?.({ agentId: agent.id });
    } catch (error) {
      toast.error(t("ask.sessionFailed", { error: (error as Error).message }));
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface1, padding: 12, gap: 10 }}>
      <Text style={{ color: colors.foreground, fontSize: 12.5, fontWeight: "600" }}>{t("ask.title")}</Text>
      <TextInput
        value={question}
        onChangeText={setQuestion}
        placeholder={t("ask.placeholder")}
        placeholderTextColor={colors.foregroundMuted}
        multiline
        style={{
          minHeight: 56,
          color: colors.foreground,
          backgroundColor: colors.surface0,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: 13,
          textAlignVertical: "top",
        }}
      />
      {agentIds.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {agents.map((ref, i) => (
            <AgentChip key={ref.key} colors={colors} agent={ref} selected={agentIds[i] === selected} onSelect={setSelected} />
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.foregroundMuted, fontSize: 11.5 }}>{t("ask.noAgents")}</Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button
          colors={colors}
          small
          variant="primary"
          icon="Send"
          label={pending === "send" ? t("ask.sending") : t("ask.send")}
          disabled={!selected || pending !== null}
          onPress={send}
        />
        <Button
          colors={colors}
          small
          icon="GitBranchPlus"
          label={pending === "session" ? t("ask.creating") : t("ask.newSession")}
          disabled={pending !== null}
          onPress={newSession}
        />
        {sentTo && props.openAgent ? (
          <Button colors={colors} small variant="ghost" label={t("ask.seeAnswer")} onPress={() => props.openAgent?.({ agentId: sentTo })} />
        ) : null}
      </View>
      <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
        {t("ask.hint", { branch: props.branch ?? "HEAD" })}
      </Text>
    </View>
  );
}
