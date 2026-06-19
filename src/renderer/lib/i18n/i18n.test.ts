import { describe, expect, test } from "bun:test"
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  enMessages,
  messages,
  type TranslationKey,
} from "./messages"
import { translate } from "./core"

describe("i18n", () => {
  test("all supported locales define the same keys", () => {
    const expectedKeys = Object.keys(enMessages).sort()

    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(messages[locale]).sort()).toEqual(expectedKeys)
    }
  })

  test("translates by locale", () => {
    expect(translate("en", "settings.tabs.preferences")).toBe("Preferences")
    expect(translate("zh-CN", "settings.tabs.preferences")).toBe("偏好设置")
  })

  test("interpolates placeholders", () => {
    expect(
      translate("en", "settings.preferences.quickSwitch.description", {
        shortcut: "Ctrl+Tab",
      }),
    ).toBe("What Ctrl+Tab switches between")
  })

  test("keeps the key visible when a message is missing", () => {
    const missingKey = "missing.key" as TranslationKey

    expect(translate(DEFAULT_LOCALE, missingKey)).toBe(missingKey)
  })
})
