import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import type { T } from "./messages";

export type Theme = PluginHostProps["theme"];
export type Colors = Theme["colors"];

export const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
});

/** Adds an alpha channel to a #rrggbb or #rgb theme color; other formats pass through. */
export function alpha(color: string, opacity: number): string {
  const hex = color.trim();
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  if (/^#[0-9a-f]{6}$/i.test(hex)) return `${hex}${a}`;
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}${a}`;
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(hex);
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").map((p) => p.trim());
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

export function riskColor(colors: Colors, level: "high" | "medium" | "low" | null): string {
  if (level === "high") return colors.statusDanger;
  if (level === "medium") return colors.statusWarning;
  return colors.foregroundMuted;
}

export function impactColor(colors: Colors, score: number): string {
  if (score >= 7.5) return colors.accent;
  if (score >= 4.5) return colors.statusSuccess;
  return colors.foregroundMuted;
}

export const STAKE_ICON = {
  revenue: "Wallet",
  conversion: "MousePointerClick",
  retention: "Repeat",
  trust: "ShieldCheck",
  seo: "Search",
  cost: "PiggyBank",
  ops: "Wrench",
} as const;

export function timeAgo(t: T, iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return t("ago.now");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("ago.minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("ago.hours", { count: hours });
  return t("ago.days", { count: Math.round(hours / 24) });
}

export function formatMoney(locale: string, value: number): string {
  const digits = value < 0.01 ? 3 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `$${value.toFixed(digits)}`;
  }
}

export function formatScore(locale: string, value: number): string {
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  } catch {
    return value.toFixed(1);
  }
}

/** React Native Web adds `hovered` to the Pressable state; native leaves it undefined. */
export type PressState = { pressed: boolean; hovered?: boolean };
