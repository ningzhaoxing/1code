import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  calculateUnifiedDiffStats,
  extractCodexFileChanges,
  unifiedDiffToDisplayLines,
} from "./codex-file-change-stats"

describe("codex file change stats", () => {
  test("counts additions and deletions from unified_diff without counting headers", () => {
    const diff = [
      "@@ -1,3 +1,4 @@",
      " # title",
      "-old line",
      "+new line",
      "+another line",
      "--- a/file.md",
      "+++ b/file.md",
      "\\ No newline at end of file",
    ].join("\n")

    assert.deepEqual(calculateUnifiedDiffStats(diff), {
      additions: 2,
      deletions: 1,
    })
    assert.deepEqual(unifiedDiffToDisplayLines(diff), [
      { type: "context", content: "# title" },
      { type: "removed", content: "old line" },
      { type: "added", content: "new line" },
      { type: "added", content: "another line" },
    ])
  })

  test("extracts Codex update changes from a tool part", () => {
    const changes = extractCodexFileChanges({
      type: "tool-Edit",
      input: {
        changes: {
          "/workspace/漏洞挖掘记录.md": {
            type: "update",
            unified_diff: [
              "@@ -0,0 +1,3 @@",
              "+# 漏洞挖掘记录",
              "+",
              "+## 基本信息",
            ].join("\n"),
          },
        },
      },
    })

    assert.equal(changes.length, 1)
    assert.equal(changes[0]?.filePath, "/workspace/漏洞挖掘记录.md")
    assert.equal(changes[0]?.additions, 3)
    assert.equal(changes[0]?.deletions, 0)
    assert.deepEqual(changes[0]?.diffLines.slice(0, 2), [
      { type: "added", content: "# 漏洞挖掘记录" },
      { type: "added", content: "" },
    ])
  })

  test("extracts Codex add changes from content payloads", () => {
    const changes = extractCodexFileChanges({
      changes: {
        "/workspace/漏洞挖掘报告.md": {
          type: "add",
          content: "# 报告\n\n## 摘要",
        },
      },
    })

    assert.deepEqual(changes, [
      {
        filePath: "/workspace/漏洞挖掘报告.md",
        changeType: "add",
        additions: 3,
        deletions: 0,
        diffLines: [
          { type: "added", content: "# 报告" },
          { type: "added", content: "" },
          { type: "added", content: "## 摘要" },
        ],
      },
    ])
  })

  test("does not double count mirrored input and output changes on one part", () => {
    const changesPayload = {
      "/workspace/漏洞挖掘记录.md": {
        type: "update",
        unified_diff: [
          "@@ -1,1 +1,2 @@",
          "-旧结论",
          "+新结论",
          "+证据路径",
        ].join("\n"),
      },
    }

    const changes = extractCodexFileChanges({
      input: { changes: changesPayload },
      output: { changes: changesPayload },
    })

    assert.equal(changes.length, 1)
    assert.equal(changes[0]?.additions, 2)
    assert.equal(changes[0]?.deletions, 1)
  })
})
