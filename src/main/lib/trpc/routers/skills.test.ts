import assert from "node:assert/strict"
import { access, mkdtemp, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, test } from "node:test"
import { skillsRouter } from "./skills"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

describe("skills router", () => {
  test("creates Claude user skills in the OneCode Claude home", async () => {
    const oldHome = process.env.HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-claude-skills-router-"))
    const homeDir = join(root, "home")

    process.env.HOME = homeDir

    try {
      const caller = skillsRouter.createCaller({ getWindow: () => null })
      const created = await caller.create({
        name: "Claude User Skill",
        description: "Test Claude runtime skill",
        content: "Use this skill for Claude tests.",
        source: "user",
        provider: "claude",
      })

      const expectedPath = join(
        homeDir,
        ".1code",
        ".claude",
        "skills",
        "claude-user-skill",
        "SKILL.md",
      )
      const legacyClaudePath = join(
        homeDir,
        ".claude",
        "skills",
        "claude-user-skill",
        "SKILL.md",
      )

      assert.equal(created.path, expectedPath)
      assert.equal(await pathExists(expectedPath), true)
      assert.equal(await pathExists(legacyClaudePath), false)
      assert.match(await readFile(expectedPath, "utf-8"), /name: claude-user-skill/)

      const listed = await caller.list({ provider: "claude" })
      assert.deepEqual(
        listed.map((skill) => ({
          name: skill.name,
          source: skill.source,
          provider: skill.provider,
          path: skill.path,
        })),
        [
          {
            name: "claude-user-skill",
            source: "user",
            provider: "claude",
            path: expectedPath,
          },
        ],
      )
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
    }
  })

  test("creates Codex user skills in the OneCode Codex home", async () => {
    const oldHome = process.env.HOME
    const oldCodexHome = process.env.CODEX_HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-skills-router-"))
    const homeDir = join(root, "home")
    const codexHome = join(homeDir, ".1code", "codex")

    process.env.HOME = homeDir
    process.env.CODEX_HOME = codexHome

    try {
      const caller = skillsRouter.createCaller({ getWindow: () => null })
      const created = await caller.create({
        name: "Codex User Skill",
        description: "Test Codex runtime skill",
        content: "Use this skill for tests.",
        source: "user",
        provider: "codex",
      })

      const expectedPath = join(
        codexHome,
        "skills",
        "codex-user-skill",
        "SKILL.md",
      )
      const legacyAgentsPath = join(
        homeDir,
        ".agents",
        "skills",
        "codex-user-skill",
        "SKILL.md",
      )

      assert.equal(created.path, expectedPath)
      assert.equal(await pathExists(expectedPath), true)
      assert.equal(await pathExists(legacyAgentsPath), false)
      assert.match(await readFile(expectedPath, "utf-8"), /name: codex-user-skill/)

      const listed = await caller.list({ provider: "codex" })
      assert.deepEqual(
        listed.map((skill) => ({
          name: skill.name,
          source: skill.source,
          provider: skill.provider,
          path: skill.path,
        })),
        [
          {
            name: "codex-user-skill",
            source: "user",
            provider: "codex",
            path: expectedPath,
          },
        ],
      )
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
      if (oldCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = oldCodexHome
      }
    }
  })

  test("preserves unicode letters when deriving skill directory names", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-skill-unicode-"))
    const caller = skillsRouter.createCaller({ getWindow: () => null })

    const first = await caller.create({
      name: "测试一下 skill 安装位置",
      description: "First skill",
      content: "Use this skill for unicode name tests.",
      source: "project",
      provider: "claude",
      cwd: root,
    })

    const second = await caller.create({
      name: "测试一下 skill 报告流程",
      description: "Second skill",
      content: "Use this skill for unicode name tests.",
      source: "project",
      provider: "claude",
      cwd: root,
    })

    assert.equal(
      first.path,
      join(root, ".claude", "skills", "测试一下-skill-安装位置", "SKILL.md"),
    )
    assert.equal(
      second.path,
      join(root, ".claude", "skills", "测试一下-skill-报告流程", "SKILL.md"),
    )
    assert.equal(await pathExists(first.path), true)
    assert.equal(await pathExists(second.path), true)
    assert.equal(
      await pathExists(join(root, ".claude", "skills", "skill", "SKILL.md")),
      false,
    )
    assert.match(await readFile(first.path, "utf-8"), /name: 测试一下-skill-安装位置/)
  })
})
