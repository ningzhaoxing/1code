import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

describe("security-mining-record skill template", () => {
  test("keeps chat summaries separate from final report files", () => {
    const skill = readFileSync(
      join(process.cwd(), "skills/security-mining-record/SKILL.md"),
      "utf8",
    )

    assert.match(skill, /聊天最终回复不是最终 Markdown 报告/)
    assert.match(skill, /阶段性总结/)
    assert.doesNotMatch(skill, /不要在任务中途生成最终报告/)
  })

  test("uses Findings.md as the only live record filename", () => {
    const skill = readFileSync(
      join(process.cwd(), "skills/security-mining-record/SKILL.md"),
      "utf8",
    )

    assert.match(skill, /Findings\.md/)
    assert.match(skill, /漏洞挖掘报告\.md/)
    assert.match(skill, /不要因为没有收到隐藏提示词或显式路径就跳过记录/)
    assert.doesNotMatch(skill, /漏洞挖掘记录\.md/)
    assert.doesNotMatch(skill, /prompt 提供/)
    assert.doesNotMatch(skill, /prompt 指定/)
  })

  test("states both live record and final report responsibilities", () => {
    const skill = readFileSync(
      join(process.cwd(), "skills/security-mining-record/SKILL.md"),
      "utf8",
    )

    assert.match(skill, /## 核心职责/)
    assert.match(skill, /## 实时记录/)
    assert.match(skill, /## 最终报告/)
    assert.match(skill, /先判断当前处于哪一个阶段/)
    assert.match(skill, /最终报告不是实时记录的简单复制/)
  })

  test("keeps the 1Code final artifact as Markdown when combined with other security skills", () => {
    const skill = readFileSync(
      join(process.cwd(), "skills/security-mining-record/SKILL.md"),
      "utf8",
    )

    assert.match(skill, /1Code/)
    assert.match(skill, /最终交付物/)
    assert.match(skill, /Markdown/)
    assert.match(skill, /其他漏洞挖掘 skill/)
  })

  test("frontmatter description has explicit vulnerability-mining trigger terms", () => {
    const skill = readFileSync(
      join(process.cwd(), "skills/security-mining-record/SKILL.md"),
      "utf8",
    )

    assert.match(skill, /description: .*vulnerability mining/i)
    assert.match(skill, /description: .*pentest/i)
    assert.match(skill, /description: .*bug bounty/i)
    assert.match(skill, /description: .*live Markdown record/i)
    assert.match(skill, /description: .*final Markdown report/i)
  })

  test("requires final chat replies to expose clickable Markdown file links", () => {
    const skill = readFileSync(
      join(process.cwd(), "skills/security-mining-record/SKILL.md"),
      "utf8",
    )

    assert.match(skill, /\[Findings\.md\]\(/)
    assert.match(skill, /\[漏洞挖掘报告\.md\]\(/)
    assert.match(skill, /不要用反引号包裹文件名/)
  })
})
