import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, type Colors, type PressState } from "./style";

export function Button(props: {
  colors: Colors;
  label: string;
  onPress: () => void;
  icon?: string;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  small?: boolean;
  outlined?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors, variant = "secondary", small, disabled } = props;
  const fg = variant === "primary" ? colors.accentForeground : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      disabled={disabled}
      onPress={props.onPress}
      style={({ hovered, pressed }: PressState) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: small ? 10 : 14,
        paddingVertical: small ? 5 : 8,
        borderRadius: 7,
        opacity: disabled ? 0.5 : 1,
        borderWidth: 1,
        borderColor: props.outlined
          ? colors.accent
          : variant === "secondary"
            ? colors.border
            : "transparent",
        backgroundColor:
          variant === "primary"
            ? pressed
              ? alpha(colors.accent, 0.8)
              : hovered
                ? alpha(colors.accent, 0.9)
                : colors.accent
            : variant === "secondary"
              ? hovered || pressed
                ? colors.surface2
                : colors.surface1
              : hovered || pressed
                ? colors.surface2
                : "transparent",
      })}
    >
      {props.icon ? <Icon name={props.icon} size={small ? 13 : 15} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: small ? 12 : 13, fontWeight: "600" }}>{props.label}</Text>
    </Pressable>
  );
}

export function IconButton(props: {
  colors: Colors;
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const { colors } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ hovered, pressed }: PressState) => ({
        width: 30,
        height: 30,
        borderRadius: 7,
        alignItems: "center",
        justifyContent: "center",
        opacity: props.disabled ? 0.4 : 1,
        backgroundColor: props.active
          ? colors.accent
          : hovered || pressed
            ? colors.surface2
            : "transparent",
      })}
    >
      <Icon name={props.icon} size={16} color={props.active ? colors.accentForeground : colors.foregroundMuted} />
    </Pressable>
  );
}

export function Tag(props: { colors: Colors; label: string; color?: string; icon?: string; bordered?: boolean }) {
  const { colors } = props;
  const tint = props.color ?? colors.foregroundMuted;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: props.bordered === false ? "transparent" : alpha(tint, 0.45),
        backgroundColor: props.color ? alpha(tint, 0.1) : "transparent",
        alignSelf: "flex-start",
      }}
    >
      {props.icon ? <Icon name={props.icon} size={10} color={tint} /> : null}
      <Text style={{ color: tint, fontSize: 10.5, fontWeight: "600", letterSpacing: 0.2 }}>{props.label}</Text>
    </View>
  );
}

export function Chip(props: { colors: Colors; label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: props.colors.border,
        backgroundColor: props.colors.surface2,
      }}
    >
      <Text style={{ color: props.colors.foreground, fontSize: 11.5 }}>{props.label}</Text>
    </View>
  );
}

export function ProgressBar(props: { colors: Colors; value: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const pct = Math.round(Math.min(1, Math.max(0, props.value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[
        { height: props.height ?? 3, borderRadius: 2, backgroundColor: props.colors.surface2, overflow: "hidden", flex: 1 },
        props.style,
      ]}
    >
      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: props.colors.accent, borderRadius: 2 }} />
    </View>
  );
}

export function SectionLabel(props: { colors: Colors; children: ReactNode; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text
        style={{
          color: props.colors.foregroundMuted,
          fontSize: 10.5,
          fontWeight: "700",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {props.children}
      </Text>
      {props.trailing}
    </View>
  );
}

export function LinkText(props: { colors: Colors; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={props.onPress} hitSlop={6}>
      {({ hovered }: PressState) => (
        <Text
          style={{
            color: props.colors.accent,
            fontSize: 11.5,
            textDecorationLine: hovered ? "underline" : "none",
          }}
        >
          {props.label}
        </Text>
      )}
    </Pressable>
  );
}
