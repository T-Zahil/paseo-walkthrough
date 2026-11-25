import type { PluginClientContext } from "@getpaseo/plugin/client";
import { WalkthroughPanel } from "./client/panel";
import { setClient } from "./client/runtime";
import { SettingsScreen } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  setClient(client);

  client.addWorkspacePanel({
    id: "walkthrough",
    title: "Walkthrough",
    icon: "Route",
    Component: WalkthroughPanel,
  });

  client.addSettingsScreen({ id: "settings", title: "Walkthrough", icon: "Route", Component: SettingsScreen });

  client.addCommandCenterItem({
    id: "open-walkthrough",
    title: "Ouvrir le walkthrough",
    icon: "Route",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("walkthrough");
    },
  });

  client.addSlashCommand({
    name: "walkthrough",
    description: "Ouvre la visite guidée du diff de ce workspace",
    argumentHint: "",
    context: "workspace",
    onSubmit({ openPanel }) {
      openPanel("walkthrough");
    },
  });

  return () => setClient(null);
}
