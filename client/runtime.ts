import type { PluginClientContext } from "@getpaseo/plugin/client";

let current: PluginClientContext | null = null;

export function setClient(client: PluginClientContext | null) {
  current = client;
}

export function openWalkthroughSettings() {
  current?.openSettings("settings");
}
