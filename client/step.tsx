import { Markdown } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { Step, Walkthrough } from "../shared/walkthrough";
import { Button, LinkText, ProgressBar, SectionLabel } from "./bits";
import { StepFlag } from "./overview";
import { ScreenBlock } from "./shot";
import { alpha, type Colors, NOTE_LABEL, RISK_LABEL, riskColor } from "./style";

function Note({ colors, kind, level, text }: { colors: Colors; kind: Step["notes"][number]["kind"]; level: Step["notes"][number]["level"]; text: string }) {
  const tint = kind === "risk" ? riskColor(colors, level) : kind === "decision" ? colors.statusWarning : colors.accent;
  const label = kind === "risk" ? `Risque ${RISK_LABEL[level ?? "medium"]}` : NOTE_LABEL[kind];
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
        <Text style={{ color: tint, fontWeight: "700" }}>{label} : </Text>
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
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "600", flexShrink: 1, maxWidth: "45%" }}>
        Étape {props.index + 1} sur {props.total}
        <Text style={{ color: colors.foregroundMuted, fontWeight: "400" }}> · {props.title}</Text>
      </Text>
      <ProgressBar colors={colors} value={(props.index + 1) / props.total} />
      <Button colors={colors} variant="ghost" small label="‹ Préc." disabled={props.index === 0} onPress={props.onPrev} accessibilityLabel="Étape précédente (k)" />
      <Button
        colors={colors}
        variant="ghost"
        small
        label={props.index === props.total - 1 ? "Fin ›" : "Suiv. ›"}
        onPress={props.index === props.total - 1 ? props.onOverview : props.onNext}
        accessibilityLabel="Étape suivante (j)"
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
  const total = w.steps.length;
  const screens = step.screens.map((route) => w.screens.find((s) => s.route === route)).filter((s) => s !== undefined);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            {step.group} · Étape {props.index + 1} sur {total}
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
          label={props.read ? "Vue" : "Marquer comme vue"}
          onPress={props.onToggleRead}
          accessibilityLabel="Marquer comme vue (x)"
        />
        <Button
          colors={colors}
          small
          variant="primary"
          label={props.index === total - 1 ? "Terminer la visite" : "Étape suivante →"}
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
  const screen = w.screens.find((s) => s.route === props.route);
  if (!screen) return null;
  const steps = w.steps.filter((s) => s.screens.includes(screen.route));
  const checks = w.checks.filter((c) => c.route === screen.route);
  return (
    <View style={{ gap: 16 }}>
      <LinkText colors={colors} label="← Vue d'ensemble" onPress={() => props.onOpen("overview")} />
      <ScreenBlock colors={colors} cwd={props.cwd} screen={screen} compact={props.compact} pending={w.captures.state === "pending" && props.capturing} />
      {steps.length ? (
        <View style={{ gap: 6 }}>
          <SectionLabel colors={colors}>Dans la visite</SectionLabel>
          {steps.map((step) => (
            <LinkText key={step.id} colors={colors} label={`Étape ${w.steps.indexOf(step) + 1} · ${step.title} →`} onPress={() => props.onOpen(step.id)} />
          ))}
        </View>
      ) : null}
      {checks.length ? (
        <View style={{ gap: 6 }}>
          <SectionLabel colors={colors}>À vérifier ici</SectionLabel>
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
