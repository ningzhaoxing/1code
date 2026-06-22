import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "node:test"

describe("security artifact toolbar feedback", () => {
  test("does not show success toasts when opening live record or report preview", async () => {
    const source = await readFile(
      "src/renderer/features/agents/main/active-chat.tsx",
      "utf-8",
    )

    assert.doesNotMatch(source, /chat\.toast\.vulnerabilityRecordCreated/)
    assert.doesNotMatch(source, /chat\.toast\.vulnerabilityRecordOpened/)
    assert.doesNotMatch(source, /chat\.toast\.vulnerabilityRecordUpdated/)
    assert.doesNotMatch(source, /chat\.toast\.markdownReportGenerated/)
  })
})
