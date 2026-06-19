import { useAtom, useAtomValue } from "jotai"
import { useCallback, useMemo } from "react"
import { appLocaleAtom } from "../atoms"
import { translate } from "./core"
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  enMessages,
  messages,
  type AppLocale,
  type TranslationKey,
} from "./messages"

type InterpolationValue = string | number

export type { AppLocale, TranslationKey }
export { DEFAULT_LOCALE, LOCALE_LABELS, SUPPORTED_LOCALES, enMessages, messages }
export { getPersistedLocale, isSupportedLocale, translate, translateCurrentLocale } from "./core"

export function useI18n() {
  const [locale, setLocale] = useAtom(appLocaleAtom)

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, InterpolationValue>) =>
      translate(locale, key, values),
    [locale],
  )

  return useMemo(
    () => ({
      locale,
      setLocale,
      t,
      supportedLocales: SUPPORTED_LOCALES,
      localeLabels: LOCALE_LABELS,
    }),
    [locale, setLocale, t],
  )
}

export function useCurrentLocale() {
  return useAtomValue(appLocaleAtom)
}
