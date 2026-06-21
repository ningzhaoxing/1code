import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"
import {
  buildSecurityMiningRuntimePrompt,
  getSecurityMiningRecordPreviewState,
  shouldUseSecurityMiningRecord,
} from "./security-mining-record"

describe("security mining record prompt helpers", () => {
  test("detects vulnerability mining prompts", () => {
    assert.equal(
      shouldUseSecurityMiningRecord("https://example.com 非侵入式漏洞挖掘一下这个网页"),
      true,
    )
    assert.equal(shouldUseSecurityMiningRecord("帮我整理一份产品日报"), false)
  })

  test("detects explicit security-mining-record skill usage", () => {
    assert.equal(
      shouldUseSecurityMiningRecord("@[skill:security-mining-record] 记录这次检查过程"),
      true,
    )
    assert.equal(
      shouldUseSecurityMiningRecord("使用 security-mining-record 维护实时记录"),
      true,
    )
  })

  test("builds a thin runtime prompt with the prepared artifact paths", () => {
    const prompt = buildSecurityMiningRuntimePrompt("漏洞挖掘一下这个网页", {
      filePath: "/repo/漏洞挖掘记录.md",
      reportPath: "/repo/漏洞挖掘报告.md",
    })

    assert.match(prompt, /漏洞挖掘一下这个网页/)
    assert.match(prompt, /security-mining-record/)
    assert.match(prompt, /\/repo\/漏洞挖掘记录\.md/)
    assert.match(prompt, /\/repo\/漏洞挖掘报告\.md/)
    assert.doesNotMatch(prompt, /@\[skill:/)
    assert.doesNotMatch(prompt, /# Security Mining Record Skill/)
  })

  test("keeps runtime prompt unchanged without prepared artifact paths", () => {
    assert.equal(
      buildSecurityMiningRuntimePrompt("普通问题", null),
      "普通问题",
    )
  })

  test("does not inject direct skill invocation syntax into model prompts", () => {
    const files = [
      "src/renderer/features/agents/lib/security-mining-record.ts",
      "src/renderer/features/agents/lib/acp-chat-transport.ts",
      "src/renderer/features/agents/lib/ipc-chat-transport.ts",
    ]

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
      assert.doesNotMatch(source, /@\[skill:/, file)
      assert.doesNotMatch(source, /# Security Mining Record Skill/, file)
    }
  })

  test("does not generate the final report from renderer stream completion", () => {
    const source = readFileSync(
      join(process.cwd(), "src/renderer/features/agents/main/active-chat.tsx"),
      "utf8",
    )

    assert.doesNotMatch(source, /generateSecurityMiningReportAfterFinish/)
    assert.doesNotMatch(source, /securityMiningRecord\.generateReport\.mutate/)
  })

  test("builds side peek preview state from a prepared record", () => {
    assert.deepEqual(
      getSecurityMiningRecordPreviewState({
        filePath: "/repo/漏洞挖掘记录.md",
      }),
      {
        displayMode: "side-peek",
        filePath: "/repo/漏洞挖掘记录.md",
      },
    )
    assert.equal(getSecurityMiningRecordPreviewState(null), null)
  })
})
