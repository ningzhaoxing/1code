import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "node:test"

describe("AgentModelSelector hover submenu", () => {
  test("guards relatedTarget before passing it to Node.contains", async () => {
    const source = await readFile(
      "src/renderer/features/agents/components/agent-model-selector.tsx",
      "utf-8",
    )

    assert.match(
      source,
      /function containsEventTarget[\s\S]*target instanceof Node[\s\S]*\.contains\(target\)/,
    )
    assert.doesNotMatch(source, /relatedTarget as Node/)
    assert.doesNotMatch(source, /\.contains\((related|e\.relatedTarget)\)/)
  })
})
