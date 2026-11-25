import { type PluginSurfaceProps, useRpc, useSettings, useTranslation } from "@getpaseo/plugin/client";
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
import { LANGUAGES, listModels, scopeKinds, settingsDefinition, type WalkthroughSettings } from "../shared/walkthrough";
import { messages } from "./messages";
import { scopeTitle } from "./scope";

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const { t } = useTranslation(messages);
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
    return <Text style={{ color: theme.colors.foregroundMuted }}>{settings.status === "loading" ? t("settings.loading") : t("settings.unreadable")}</Text>;
  }
  const values = settings.values;
  const save = (patch: Partial<WalkthroughSettings>) => void settings.save({ ...values, ...patch }, settings.revision);

  const fallback = catalog.data?.fallback;
  const fallbackLabel = catalog.data?.options.find((o) => o.value === fallback)?.label;
  const modelOptions = [
    { value: "", label: fallbackLabel ? t("settings.defaultWith", { label: fallbackLabel }) : t("settings.default") },
    ...(catalog.data?.options ?? []),
  ];
  if (values.provider && !modelOptions.some((o) => o.value === values.provider)) {
    modelOptions.push({ value: values.provider, label: t("settings.unavailable", { value: values.provider }) });
  }
  const languageOptions = [{ value: "", label: t("settings.appLanguage") }, ...LANGUAGES.map((l) => ({ value: l, label: l }))];
  if (values.language && !languageOptions.some((o) => o.value === values.language)) {
    languageOptions.push({ value: values.language, label: values.language });
  }

  return (
    <>
      <SettingsSection title={t("settings.generation")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.review")}
            hint={t("settings.reviewHint")}
            value={values.review}
            onValueChange={(review) => save({ review })}
          />
          <SettingsSelect
            label={t("settings.agent")}
            hint={catalog.isLoading ? t("settings.agentLoading") : t("settings.agentHint")}
            value={values.provider}
            options={modelOptions}
            onValueChange={(provider) => save({ provider })}
          />
          <SettingsSelect
            label={t("settings.language")}
            hint={t("settings.languageHint")}
            value={values.language}
            options={languageOptions}
            onValueChange={(language) => save({ language })}
          />
          <SettingsSelect
            label={t("settings.defaultScope")}
            hint={t("settings.defaultScopeHint")}
            value={values.defaultScope}
            options={scopeKinds.map((k) => ({ value: k, label: scopeTitle(t, k) }))}
            onValueChange={(defaultScope) => save({ defaultScope: defaultScope as WalkthroughSettings["defaultScope"] })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("settings.captures")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.capturesSwitch")}
            hint={t("settings.capturesHint")}
            value={values.captures}
            onValueChange={(captures) => save({ captures })}
          />
          <SettingsInput
            label={t("settings.devCommand")}
            hint={t("settings.devCommandHint")}
            initialValue={values.devCommand}
            placeholder="npm run dev -- --port {port}"
            onChangeText={(text) => setCommands((c) => ({ ...c, devCommand: text }))}
          />
          <SettingsInput
            label={t("settings.captureCommand")}
            hint={t("settings.captureCommandHint")}
            initialValue={values.captureCommand}
            placeholder="node scripts/screenshots.mjs --routes {routes} --out {out} --base-url {baseUrl}"
            onChangeText={(text) => setCommands((c) => ({ ...c, captureCommand: text }))}
          />
          <SettingsAction
            label={t("settings.saveCommands")}
            actionLabel={t("settings.save")}
            disabled={commands.devCommand === values.devCommand && commands.captureCommand === values.captureCommand}
            onPress={() => save(commands)}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("settings.instructions")}>
        <SettingsCard>
          <SettingsInput
            label={t("settings.instructionsLabel")}
            hint={t("settings.instructionsHint")}
            initialValue={values.instructions}
            placeholder={t("settings.instructionsPlaceholder")}
            onChangeText={setDraft}
          />
          <SettingsAction
            label={t("settings.saveInstructions")}
            actionLabel={t("settings.save")}
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
