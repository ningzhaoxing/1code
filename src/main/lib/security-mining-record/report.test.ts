import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { createSecurityMiningMarkdownReport } from "./report"

describe("createSecurityMiningMarkdownReport", () => {
  test("builds a Markdown report from the full chat chain, tool calls, and live record", () => {
    const report = createSecurityMiningMarkdownReport({
      chatName: "简书漏洞挖掘",
      projectPath: "/workspace/jianshu",
      recordPath: "/workspace/jianshu/漏洞挖掘-record/漏洞挖掘记录.md",
      reportPath: "/workspace/jianshu/漏洞挖掘-record/漏洞挖掘报告.md",
      generatedAt: new Date("2026-06-18T12:00:00.000Z"),
      recordContent: "## 侦察结果\n\n发现 `/admin/` 暴露，需要复核。",
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "https://www.jianshu.com/ 漏洞挖掘一下这个网页" }],
        },
        {
          role: "assistant",
          parts: [
            { type: "text", text: "先确认 robots.txt 与公开接口。" },
            {
              type: "tool-Bash",
              toolName: "Bash",
              input: { command: "curl -I https://www.jianshu.com/" },
              result: "HTTP/2 200\nx-runtime: 0.123",
              state: "result",
            },
            {
              type: "tool-Write",
              toolName: "Write",
              input: { file_path: "/workspace/jianshu/漏洞挖掘-record/漏洞挖掘记录.md" },
              result: "File written",
              state: "result",
            },
          ],
        },
      ],
    })

    assert.match(report, /^# 漏洞挖掘报告/)
    assert.match(report, /简书漏洞挖掘/)
    assert.match(report, /完整执行链路/)
    assert.match(report, /https:\/\/www\.jianshu\.com/)
    assert.match(report, /Bash/)
    assert.match(report, /curl -I https:\/\/www\.jianshu\.com\//)
    assert.match(report, /HTTP\/2 200/)
    assert.match(report, /实时记录内容/)
    assert.match(report, /发现 `\/admin\/` 暴露/)
    assert.match(report, /\/workspace\/jianshu\/漏洞挖掘-record\/漏洞挖掘报告\.md/)
  })
})
