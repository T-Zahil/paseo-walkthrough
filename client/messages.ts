import { defineTranslations, type useTranslation } from "@getpaseo/plugin/client";
import { en } from "./locales/en";
import { fr } from "./locales/fr";

export const messages = defineTranslations({ resources: { en, fr } });

/** The `t` returned by `useTranslation(messages)`, for helpers that take it as an argument. */
export type T = ReturnType<typeof useTranslation<typeof en>>["t"];
