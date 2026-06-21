import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  getCodexCompletedFileChange,
  snapshotCodexToolInputChunk,
} from "./codex-file-change"

describe("codex file-change bridge", () => {
  test("emits the same file-changed payload shape as Claude for Write tools", () => {
    const input = snapshotCodexToolInputChunk({
      type: "tool-input-available",
      toolCallId: "write-1",
      toolName: "Write",
      input: {
        file_path: "/workspace/漏洞挖掘记录.md",
      },
    })

    assert.deepEqual(input, {
      toolCallId: "write-1",
      snapshot: {
        type: "tool-Write",
        input: {
          file_path: "/workspace/漏洞挖掘记录.md",
        },
      },
    })

    assert.deepEqual(getCodexCompletedFileChange(input?.snapshot), {
      filePath: "/workspace/漏洞挖掘记录.md",
      type: "tool-Write",
    })
  })

  test("ignores completed non-file tools", () => {
    const input = snapshotCodexToolInputChunk({
      type: "tool-input-available",
      toolCallId: "bash-1",
      toolName: "Bash",
      input: {
        command: "curl -I https://example.com",
      },
    })

    assert.equal(getCodexCompletedFileChange(input?.snapshot), null)
  })
})
