import { useTranslation } from "@getpaseo/plugin/client";
import { Icon, Markdown } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { CaptureReason, Progress, Step, Walkthrough } from "../shared/walkthrough";
import { Button, Chip, LinkText, ProgressBar, SectionLabel, Tag } from "./bits";
import { messages, type T } from "./messages";
import { describeScope } from "./scope";
import { ShotThumb, statusColor, statusLabel } from "./shot";
import {
  alpha,
  type Colors,
  formatMoney,
  formatScore,
  impactColor,
  type PressState,
  riskColor,
  STAKE_ICON,
  timeAgo,
} from "./style";

const CAPTURE_KEYS = {
  disabled: "captures.disabled",
  "no-screens": "captures.noScreens",
  "no-capture-command": "captures.noCaptureCommand",
  "no-dev-command": "captures.noDevCommand",
  "none-captured": "captures.noneCaptured",
  "signed-out": "captures.signedOut",
  cancelled: "captures.cancelled",
  error: "captures.error",
} as const satisfies Record<CaptureReason, string>;

/** The capture banner: the reason in the app's language, then the raw detail as is. */
function captureText(t: T, captures: Walkthrough["captures"]): string | null {
  const reason = captures.reason ? t(CAPTURE_KEYS[captures.reason]) : null;
  return [reason, captures.note].filter(Boolean).join(" ") || null;
}

export function resumeStep(walkthrough: Walkthrough, progress: Progress): Step | null {
  const read = new Set(progress.read);
  const lastIndex = walkthrough.steps.findIndex((s) => s.id === progress.last);
  // The first unread step after the last one opened, else the first unread step.
  const after = walkthrough.steps.slice(lastIndex + 1).find((s) => !read.has(s.id));
  return after ?? walkthrough.steps.find((s) => !read.has(s.id)) ?? null;
}

export function StepFlag({ colors, step }: { colors: Colors; step: Step }) {
  const { t } = useTranslation(messages);
  if (step.risk === "high" || step.risk === "medium")
    return <Tag colors={colors} icon="Flag" label={t(`risk.tag.${step.risk}`)} color={riskColor(colors, step.risk)} />;
  if (step.notes.some((n) => n.kind === "decision"))
    return <Tag colors={colors} icon="CircleHelp" label={t("flag.decide")} color={colors.statusWarning} />;
  if (step.importance === "key") return <Tag colors={colors} label={t("flag.important")} color={colors.accent} />;
  if (step.importance === "minor") return <Tag colors={colors} label={t("flag.minor")} />;
  return null;
}

export function Overview(props: {
  colors: Colors;
  compact: boolean;
  width: number;
  cwd: string;
  walkthrough: Walkthrough;
  progress: Progress;
  stale: boolean;
  busy: boolean;
  capturing: boolean;
  onOpen: (view: string) => void;
  onRegenerate: () => void;
  onRecapture: () => void;
  onToggleCheck: (id: string) => void;
}) {
  const { colors, compact, walkthrough: w, progress } = props;
  const { t, locale } = useTranslation(messages);
  const read = new Set(progress.read);
  const checked = new Set(progress.checked);
  const resume = resumeStep(w, progress);
  const readCount = w.steps.filter((s) => read.has(s.id)).length;
  const gap = 10;

  const meta = [w.modelLabel, timeAgo(t, w.generatedAt), w.costUsd !== null ? formatMoney(locale, w.costUsd) : null]
    .filter(Boolean)
    .join(" · ");

  const screenCols = Math.max(1, Math.floor((props.width + gap) / ((compact ? 160 : 230) + gap)));
  const screenWidth = Math.floor((props.width - gap * (screenCols - 1)) / screenCols);
  const stepCols = Math.max(1, Math.floor((props.width + gap) / ((compact ? 150 : 190) + gap)));
  const stepWidth = Math.floor((props.width - gap * (stepCols - 1)) / stepCols);

  const stepLink = (n: number | null) =>
    n !== null && w.steps[n - 1] ? (
      <LinkText colors={colors} label={t("overview.stepLink", { step: n })} onPress={() => props.onOpen(w.steps[n - 1].id)} />
    ) : null;

  const capturesPending = w.captures.state === "pending";
  const captureNote = captureText(t, w.captures);
  const captureIssue = !capturesPending && captureNote && w.screens.length > 0;

  return (
    <View style={{ gap: compact ? 20 : 26 }}>
      {/* Title */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{t("overview.title")}</Text>
          <ProgressBar colors={colors} value={w.steps.length ? readCount / w.steps.length : 0} />
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            {t("overview.seen", { read: readCount, total: w.steps.length })}
          </Text>
        </View>
        <Text style={{ color: colors.foreground, fontSize: compact ? 20 : 24, fontWeight: "700" }}>{w.title}</Text>
        {w.pitch ? <Text style={{ color: colors.foreground, fontSize: compact ? 15 : 16, lineHeight: compact ? 21 : 23 }}>{w.pitch}</Text> : null}
        <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
          {w.scopeInfo ? describeScope(t, w.scopeInfo) : w.scopeLabel}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {resume ? (
            <Button
              colors={colors}
              variant="primary"
              small
              label={readCount === 0 ? t("overview.start") : t("overview.resume", { step: w.steps.indexOf(resume) + 1 })}
              onPress={() => props.onOpen(resume.id)}
            />
          ) : (
            <Button colors={colors} small icon="CheckCheck" label={t("overview.allSeen")} onPress={() => props.onOpen(w.steps[0].id)} />
          )}
          <Text style={{ color: colors.foregroundMuted, fontSize: 11.5 }}>{meta}</Text>
        </View>
        {props.stale ? (
          <Banner colors={colors} tint={colors.statusWarning} icon="TriangleAlert" text={t("overview.stale")}>
            <Button colors={colors} small label={t("panel.regenerate")} icon="RefreshCw" disabled={props.busy} onPress={props.onRegenerate} />
          </Banner>
        ) : null}
        {captureIssue ? (
          <Banner colors={colors} tint={w.captures.state === "failed" ? colors.statusDanger : colors.statusWarning} icon="Camera" text={captureNote}>
            <Button colors={colors} small label={t("overview.recapture")} icon="Camera" disabled={props.busy} onPress={props.onRecapture} />
          </Banner>
        ) : null}
      </View>

      {/* Summary */}
      <View style={{ gap: 8 }}>
        <SectionLabel colors={colors}>{t("overview.summary")}</SectionLabel>
        <Markdown>{w.summary}</Markdown>
        {w.audience.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{t("overview.audience")}</Text>
            {w.audience.map((a) => (
              <Chip key={a} colors={colors} label={a} />
            ))}
          </View>
        ) : null}
      </View>

      {/* Stakes and impact */}
      {w.stakes.length || w.review ? (
        <View style={{ flexDirection: compact ? "column" : "row", gap: 12 }}>
          {w.stakes.length ? (
            <View style={{ flex: 1, gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
              <SectionLabel colors={colors}>{t("overview.stakes")}</SectionLabel>
              {w.stakes.map((stake, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <View style={{ width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: alpha(colors.accent, 0.12) }}>
                    <Icon name={STAKE_ICON[stake.kind]} size={14} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: colors.foregroundMuted, fontSize: 11, fontWeight: "600" }}>{t(`stake.${stake.kind}`)}</Text>
                    <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>{stake.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {w.review ? (
            <View style={{ flex: 1, gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ color: impactColor(colors, w.review.impact), fontSize: 26, fontWeight: "700" }}>
                  {formatScore(locale, w.review.impact)}
                </Text>
                <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>/10</Text>
                <Text style={{ color: colors.foregroundMuted, fontSize: 10.5, fontWeight: "700", letterSpacing: 1, marginLeft: 4 }}>{t("overview.impact")}</Text>
              </View>
              <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>{w.review.reason}</Text>
              {w.review.risks.length ? (
                <View style={{ gap: 8 }}>
                  <SectionLabel colors={colors}>{t("overview.risks", { count: w.review.risks.length })}</SectionLabel>
                  {w.review.risks.map((risk, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                      <View style={{ width: 58 }}>
                        <Tag colors={colors} label={t(`risk.${risk.level}`).toUpperCase()} color={riskColor(colors, risk.level)} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: colors.foreground, fontSize: 12.5, lineHeight: 18 }}>{risk.text}</Text>
                        {stepLink(risk.step)}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Screens */}
      {w.screens.length ? (
        <View style={{ gap: 10 }}>
          <SectionLabel colors={colors}>{t("overview.screens", { count: w.screens.length })}</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
            {w.screens.map((screen) => (
              <Pressable
                key={screen.route}
                accessibilityRole="button"
                accessibilityLabel={t("overview.screenLabel", { title: screen.title })}
                onPress={() => props.onOpen(`screen:${screen.route}`)}
                style={({ hovered }: PressState) => ({
                  width: screenWidth,
                  borderRadius: 10,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: hovered ? alpha(colors.foreground, 0.3) : colors.border,
                  backgroundColor: colors.surface1,
                })}
              >
                <ShotThumb colors={colors} cwd={props.cwd} screen={screen} height={compact ? 110 : 140} pending={capturesPending && props.capturing} />
                <View style={{ padding: 10, gap: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Tag colors={colors} label={statusLabel(t, screen.status)} color={statusColor(colors, screen.status)} />
                    {screen.login ? <Icon name="Lock" size={11} color={colors.foregroundMuted} /> : null}
                  </View>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                    {screen.title}
                  </Text>
                  <Text numberOfLines={2} style={{ color: colors.foregroundMuted, fontSize: 11.5, lineHeight: 16 }}>
                    {screen.change || screen.route}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Steps */}
      <View style={{ gap: 10 }}>
        <SectionLabel colors={colors}>{t("overview.tour", { count: w.steps.length })}</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
          {w.steps.map((step, index) => {
            const isRead = read.has(step.id);
            const isResume = resume?.id === step.id && readCount > 0;
            return (
              <Pressable
                key={step.id}
                accessibilityRole="button"
                accessibilityLabel={t(isRead ? "overview.stepLabelSeen" : "overview.stepLabel", { step: index + 1, title: step.title })}
                onPress={() => props.onOpen(step.id)}
                style={({ hovered, pressed }: PressState) => ({
                  width: stepWidth,
                  minHeight: 92,
                  padding: 10,
                  gap: 6,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: isResume ? colors.accent : hovered ? alpha(colors.foreground, 0.25) : colors.border,
                  backgroundColor: pressed ? colors.surface2 : colors.surface1,
                  justifyContent: "space-between",
                })}
              >
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
                      {index + 1} · {step.group || t("overview.ungrouped")}
                    </Text>
                    {isResume ? (
                      <Text style={{ color: colors.accent, fontSize: 10.5, fontWeight: "700" }}>{t("overview.resumeHere")}</Text>
                    ) : isRead ? (
                      <Icon name="Check" size={13} color={colors.statusSuccess} />
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={3}
                    style={{
                      color: isRead && !isResume ? colors.foregroundMuted : colors.foreground,
                      fontSize: 13,
                      fontWeight: isRead && !isResume ? "400" : "600",
                      lineHeight: 18,
                    }}
                  >
                    {step.title}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {step.screens.length ? (
                    <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
                      {t("overview.screenCount", { count: step.screens.length })}
                    </Text>
                  ) : null}
                  <StepFlag colors={colors} step={step} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Checks */}
      {w.checks.length ? (
        <View style={{ gap: 10 }}>
          <SectionLabel colors={colors}>{t("overview.checks", { done: checked.size, total: w.checks.length })}</SectionLabel>
          <Checklist colors={colors} walkthrough={w} checked={checked} onToggle={props.onToggleCheck} onOpen={props.onOpen} />
        </View>
      ) : null}
    </View>
  );
}

export function Checklist(props: {
  colors: Colors;
  walkthrough: Walkthrough;
  checked: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (view: string) => void;
}) {
  const { colors, walkthrough: w } = props;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface1, overflow: "hidden" }}>
      {w.checks.map((check, i) => {
        const done = props.checked.has(check.id);
        const screen = check.route ? w.screens.find((s) => s.route === check.route) : null;
        return (
          <View
            key={check.id}
            style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
          >
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} onPress={() => props.onToggle(check.id)} hitSlop={8}>
              <Icon name={done ? "SquareCheck" : "Square"} size={18} color={done ? colors.statusSuccess : colors.foregroundMuted} />
            </Pressable>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{
                  color: done ? colors.foregroundMuted : colors.foreground,
                  fontSize: 13,
                  lineHeight: 19,
                  textDecorationLine: done ? "line-through" : "none",
                }}
              >
                {check.text}
              </Text>
              {screen ? <LinkText colors={colors} label={`${screen.title} →`} onPress={() => props.onOpen(`screen:${screen.route}`)} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Banner(props: { colors: Colors; tint: string; icon: string; text: string; children?: React.ReactNode }) {
  const { colors } = props;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        borderRadius: 8,
        backgroundColor: alpha(props.tint, 0.1),
        borderWidth: 1,
        borderColor: alpha(props.tint, 0.35),
        flexWrap: "wrap",
      }}
    >
      <Icon name={props.icon} size={15} color={props.tint} />
      <Text style={{ color: colors.foreground, fontSize: 12.5, lineHeight: 18, flex: 1, minWidth: 180 }}>{props.text}</Text>
      {props.children}
    </View>
  );
}
