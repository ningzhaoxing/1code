import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { extractChangedFiles } from "./git-activity"

describe("agent git activity changed files", () => {
  test("extracts Codex ACP changes payloads with per-file line counts", () => {
    const changedFiles = extractChangedFiles(
      [
        {
          type: "tool-Edit",
          input: {
            changes: {
              "/Users/me/.21st/worktrees/1code-preview/demo/漏洞挖掘记录.md": {
                type: "update",
                unified_diff: [
                  "@@ -0,0 +1,2 @@",
                  "+# 记录",
                  "+阶段结论",
                ].join("\n"),
              },
              "/Users/me/.21st/worktrees/1code-preview/demo/漏洞挖掘报告.md": {
                type: "add",
                content: "# 报告\n\n## 摘要",
              },
            },
          },
        },
      ],
      "/Users/me/.21st/worktrees/1code-preview/demo",
    )

    assert.deepEqual(changedFiles, [
      {
        filePath: "/Users/me/.21st/worktrees/1code-preview/demo/漏洞挖掘记录.md",
        displayPath: "漏洞挖掘记录.md",
        additions: 2,
        deletions: 0,
      },
      {
        filePath: "/Users/me/.21st/worktrees/1code-preview/demo/漏洞挖掘报告.md",
        displayPath: "漏洞挖掘报告.md",
        additions: 3,
        deletions: 0,
      },
    ])
  })
})
