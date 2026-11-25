import { useTranslation } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { Step, Walkthrough } from "../shared/walkthrough";
import { Button, LinkText, ProgressBar, SectionLabel } from "./bits";
import { messages } from "./messages";
import { StepFlag } from "./overview";
import { ScreenBlock } from "./shot";
import { alpha, type Colors, riskColor } from "./style";

function Note({ colors, kind, level, text }: { colors: Colors; kind: Step["notes"][number]["kind"]; level: Step["notes"][number]["level"]; text: string }) {
  const { t } = useTranslation(messages);
  const tint = kind === "risk" ? riskColor(colors, level) : kind === "decision" ? colors.statusWarning : colors.accent;
  const label = kind === "risk" ? t(`risk.tag.${level ?? "medium"}`) : t(`note.${kind}`);
  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: tint,
        borderRadius: 6,
        backgroundColor: alpha(tint, 0.08),
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
        <Text style={{ color: tint, fontWeight: "700" }}>{t("note.label", { label })}</Text>
        {text}
      </Text>
    </View>
  );
}

export function StepHeader(props: {
  colors: Colors;
  index: number;
  total: number;
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onOverview: () => void;
}) {
  const { colors } = props;
  const { t } = useTranslation(messages);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "600", flexShrink: 1, maxWidth: "45%" }}>
        {t("step.of", { step: props.index + 1, total: props.total })}
        <Text style={{ color: colors.foregroundMuted, fontWeight: "400" }}> · {props.title}</Text>
      </Text>
      <ProgressBar colors={colors} value={(props.index + 1) / props.total} />
      <Button colors={colors} variant="ghost" small label={t("step.prev")} disabled={props.index === 0} onPress={props.onPrev} accessibilityLabel={t("step.prevLabel")} />
      <Button
        colors={colors}
        variant="ghost"
        small
        label={props.index === props.total - 1 ? t("step.end") : t("step.next")}
        onPress={props.index === props.total - 1 ? props.onOverview : props.onNext}
        accessibilityLabel={t("step.nextLabel")}
      />
    </View>
  );
}

export function StepView(props: {
  colors: Colors;
  compact: boolean;
  cwd: string;
  walkthrough: Walkthrough;
  step: Step;
  index: number;
  read: boolean;
  capturing: boolean;
  onToggleRead: () => void;
  onNext: () => void;
  ask: ReactNode;
}) {
  const { colors, step, walkthrough: w } = props;
  const { t } = useTranslation(messages);
  const total = w.steps.length;
  const screens = step.screens.map((route) => w.screens.find((s) => s.route === route)).filter((s) => s !== undefined);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            {step.group
              ? t("step.groupOf", { group: step.group, step: props.index + 1, total })
              : t("step.of", { step: props.index + 1, total })}
          </Text>
          <StepFlag colors={colors} step={step} />
        </View>
        <Text style={{ color: colors.foreground, fontSize: props.compact ? 19 : 22, fontWeight: "700" }}>{step.title}</Text>
      </View>

      {step.notes.length ? (
        <View style={{ gap: 6 }}>
          {step.notes.map((note, i) => (
            <Note key={i} colors={colors} kind={note.kind} level={note.level} text={note.text} />
          ))}
        </View>
      ) : null}

      <Markdown>{step.explanation}</Markdown>

      {screens.map((screen) => (
        <ScreenBlock
          key={screen.route}
          colors={colors}
          cwd={props.cwd}
          screen={screen}
          compact={props.compact}
          pending={w.captures.state === "pending" && props.capturing}
        />
      ))}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button
          colors={colors}
          small
          icon={props.read ? "CircleCheck" : "Circle"}
          label={props.read ? t("step.seen") : t("step.markSeen")}
          onPress={props.onToggleRead}
          accessibilityLabel={t("step.markSeenLabel")}
        />
        <Button
          colors={colors}
          small
          variant="primary"
          label={props.index === total - 1 ? t("step.finish") : t("step.nextStep")}
          onPress={props.onNext}
        />
      </View>

      {props.ask}
    </View>
  );
}

export function ScreenView(props: {
  colors: Colors;
  compact: boolean;
  cwd: string;
  walkthrough: Walkthrough;
  route: string;
  capturing: boolean;
  onOpen: (view: string) => void;
}) {
  const { colors, walkthrough: w } = props;
  const { t } = useTranslation(messages);
  const screen = w.screens.find((s) => s.route === props.route);
  if (!screen) return null;
  const steps = w.steps.filter((s) => s.screens.includes(screen.route));
  const checks = w.checks.filter((c) => c.route === screen.route);
  return (
    <View style={{ gap: 16 }}>
      <LinkText colors={colors} label={t("step.back")} onPress={() => props.onOpen("overview")} />
      <ScreenBlock colors={colors} cwd={props.cwd} screen={screen} compact={props.compact} pending={w.captures.state === "pending" && props.capturing} />
      {steps.length ? (
        <View style={{ gap: 6 }}>
          <SectionLabel colors={colors}>{t("step.inTour")}</SectionLabel>
          {steps.map((step) => (
            <LinkText key={step.id} colors={colors} label={t("step.link", { step: w.steps.indexOf(step) + 1, title: step.title })} onPress={() => props.onOpen(step.id)} />
          ))}
        </View>
      ) : null}
      {checks.length ? (
        <View style={{ gap: 6 }}>
          <SectionLabel colors={colors}>{t("step.checkHere")}</SectionLabel>
          {checks.map((check) => (
            <Text key={check.id} style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
              • {check.text}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
