import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  messages,
  type AppLocale,
  type TranslationKey,
} from "./messages"

type InterpolationValue = string | number

export function isSupportedLocale(locale: string): locale is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  values?: Record<string, InterpolationValue>,
): string {
  const template = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key

  if (!values) return template

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

export function getPersistedLocale(): AppLocale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE
  }

  try {
    const raw = window.localStorage.getItem("preferences:app-locale")
    const parsed = raw ? JSON.parse(raw) : null
    return typeof parsed === "string" && isSupportedLocale(parsed)
      ? parsed
      : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

export function translateCurrentLocale(
  key: TranslationKey,
  values?: Record<string, InterpolationValue>,
): string {
  return translate(getPersistedLocale(), key, values)
}
