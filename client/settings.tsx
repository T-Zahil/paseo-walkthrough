import { type PluginSurfaceProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsAction,
} from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { LANGUAGES, listModels, SCOPE_TITLES, scopeKinds, settingsDefinition, type WalkthroughSettings } from "../shared/walkthrough";

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(settingsDefinition);
  const models = useRpc(listModels);
  const catalog = useQuery({ queryKey: ["walkthrough-models"], queryFn: () => models({}) });
  const [draft, setDraft] = useState<string | null>(null);
  const [commands, setCommands] = useState({ devCommand: "", captureCommand: "" });
  const ready = settings.status === "ready";
  useEffect(() => {
    if (settings.status === "ready") {
      setCommands({ devCommand: settings.values.devCommand, captureCommand: settings.values.captureCommand });
    }
  }, [ready]);

  if (settings.status !== "ready") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>{settings.status === "loading" ? "Chargement…" : "Réglages illisibles."}</Text>;
  }
  const values = settings.values;
  const save = (patch: Partial<WalkthroughSettings>) => void settings.save({ ...values, ...patch }, settings.revision);

  const fallback = catalog.data?.fallback;
  const fallbackLabel = catalog.data?.options.find((o) => o.value === fallback)?.label;
  const modelOptions = [
    { value: "", label: fallbackLabel ? `Par défaut (${fallbackLabel})` : "Par défaut" },
    ...(catalog.data?.options ?? []),
  ];
  if (values.provider && !modelOptions.some((o) => o.value === values.provider)) {
    modelOptions.push({ value: values.provider, label: `${values.provider} (indisponible)` });
  }

  return (
    <>
      <SettingsSection title="Génération">
        <SettingsCard>
          <SettingsSwitch
            label="Review"
            hint="Score d'impact business et ce qui peut mal tourner"
            value={values.review}
            onValueChange={(review) => save({ review })}
          />
          <SettingsSelect
            label="Agent et modèle"
            hint={catalog.isLoading ? "Lecture des providers…" : "N'importe quel agent activé dans Paseo"}
            value={values.provider}
            options={modelOptions}
            onValueChange={(provider) => save({ provider })}
          />
          <SettingsSelect
            label="Langue"
            hint={`${LANGUAGES.length} langues`}
            value={values.language}
            options={LANGUAGES.map((l) => ({ value: l, label: l }))}
            onValueChange={(language) => save({ language })}
          />
          <SettingsSelect
            label="Portée par défaut"
            hint="Ce que le panneau explique quand il s'ouvre"
            value={values.defaultScope}
            options={scopeKinds.map((k) => ({ value: k, label: SCOPE_TITLES[k] }))}
            onValueChange={(defaultScope) => save({ defaultScope: defaultScope as WalkthroughSettings["defaultScope"] })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Captures d'écran">
        <SettingsCard>
          <SettingsSwitch
            label="Capturer les écrans touchés"
            hint="Lance le site du worktree et photographie chaque écran modifié, en ordinateur et en mobile"
            value={values.captures}
            onValueChange={(captures) => save({ captures })}
          />
          <SettingsInput
            label="Commande du serveur de dev"
            hint="Vide : détectée depuis package.json. {port} est remplacé par un port libre."
            initialValue={values.devCommand}
            placeholder="bun run dev --port {port}"
            onChangeText={(text) => setCommands((c) => ({ ...c, devCommand: text }))}
          />
          <SettingsInput
            label="Commande de capture"
            hint="Vide : scripts/qa-screenshots.ts s'il existe. Variables : {routes}, {out}, {baseUrl}."
            initialValue={values.captureCommand}
            placeholder="bun run scripts/qa-screenshots.ts --routes {routes} --out {out} --base-url {baseUrl}"
            onChangeText={(text) => setCommands((c) => ({ ...c, captureCommand: text }))}
          />
          <SettingsAction
            label="Enregistrer les commandes"
            actionLabel="Enregistrer"
            disabled={commands.devCommand === values.devCommand && commands.captureCommand === values.captureCommand}
            onPress={() => save(commands)}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Consignes en plus">
        <SettingsCard>
          <SettingsInput
            label="Pour l'agent qui écrit la visite"
            hint="Par exemple : insiste sur l'impact sur les membres Pro, ignore les traductions"
            initialValue={values.instructions}
            placeholder="Aucune"
            onChangeText={setDraft}
          />
          <SettingsAction
            label="Enregistrer les consignes"
            actionLabel="Enregistrer"
            disabled={draft === null || draft === values.instructions}
            onPress={() => {
              if (draft !== null) save({ instructions: draft });
            }}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
