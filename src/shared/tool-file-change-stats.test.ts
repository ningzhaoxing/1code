import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { calculateToolChangedFileStats } from "./tool-file-change-stats"

describe("tool file change stats", () => {
  test("calculates Codex changes payloads for sidebar file stats", () => {
    const stats = calculateToolChangedFileStats([
      {
        type: "tool-Edit",
        input: {
          changes: {
            "/workspace/漏洞挖掘记录.md": {
              type: "update",
              unified_diff: [
                "@@ -0,0 +1,2 @@",
                "+# 记录",
                "+阶段结论",
              ].join("\n"),
            },
          },
        },
      },
      {
        type: "tool-Edit",
        input: {
          changes: {
            "/workspace/漏洞挖掘报告.md": {
              type: "add",
              content: "# 报告\n\n## 摘要",
            },
          },
        },
      },
    ])

    assert.deepEqual(stats, [
      {
        filePath: "/workspace/漏洞挖掘记录.md",
        additions: 2,
        deletions: 0,
      },
      {
        filePath: "/workspace/漏洞挖掘报告.md",
        additions: 3,
        deletions: 0,
      },
    ])
  })

  test("keeps Claude Write/Edit stats behavior", () => {
    const stats = calculateToolChangedFileStats([
      {
        type: "tool-Write",
        input: {
          file_path: "/workspace/漏洞挖掘记录.md",
          content: "# 记录\n\n## 初始",
        },
      },
      {
        type: "tool-Edit",
        input: {
          file_path: "/workspace/漏洞挖掘记录.md",
          old_string: "# 记录\n\n## 初始",
          new_string: "# 记录\n\n## 初始\n\n## 结论",
        },
      },
    ])

    assert.deepEqual(stats, [
      {
        filePath: "/workspace/漏洞挖掘记录.md",
        additions: 5,
        deletions: 0,
      },
    ])
  })
})
