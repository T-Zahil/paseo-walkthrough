import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Platform } from "react-native";

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

export const STAKE_META = {
  revenue: { label: "Revenus", icon: "Wallet" },
  conversion: { label: "Conversion", icon: "MousePointerClick" },
  retention: { label: "Rétention", icon: "Repeat" },
  trust: { label: "Confiance", icon: "ShieldCheck" },
  seo: { label: "SEO", icon: "Search" },
  cost: { label: "Coûts", icon: "PiggyBank" },
  ops: { label: "Opérations", icon: "Wrench" },
} as const;

export const NOTE_LABEL = { decision: "À décider", question: "Question" } as const;

export const RISK_LABEL = { high: "élevé", medium: "moyen", low: "faible" } as const;

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

/** React Native Web adds `hovered` to the Pressable state; native leaves it undefined. */
export type PressState = { pressed: boolean; hovered?: boolean };
