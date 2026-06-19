import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, test } from "node:test"
import {
  getOneCodeCodexHome,
  getSkillInstallTargetPath,
  syncDefaultProjectSkills,
} from "./default-project-skills"

describe("default project skill install helpers", () => {
  test("resolves provider-specific install locations", () => {
    assert.equal(
      getSkillInstallTargetPath({
        skillName: "security-mining-record",
        target: "claude-user",
        homeDir: "/home/user",
      }),
      "/home/user/.claude/skills/security-mining-record",
    )
    assert.equal(
      getSkillInstallTargetPath({
        skillName: "security-mining-record",
        target: "claude-project",
        projectPath: "/repo/project",
        homeDir: "/home/user",
      }),
      "/repo/project/.claude/skills/security-mining-record",
    )
    assert.equal(
      getSkillInstallTargetPath({
        skillName: "security-mining-record",
        target: "codex-user",
        homeDir: "/home/user",
      }),
      "/home/user/.agents/skills/security-mining-record",
    )
    assert.equal(
      getSkillInstallTargetPath({
        skillName: "security-mining-record",
        target: "codex-project",
        projectPath: "/repo/project",
        homeDir: "/home/user",
      }),
      "/repo/project/.agents/skills/security-mining-record",
    )
    assert.equal(
      getSkillInstallTargetPath({
        skillName: "security-mining-record",
        target: "onecode-codex",
        homeDir: "/home/user",
      }),
      "/home/user/.1code/codex/skills/security-mining-record",
    )
  })

  test("uses explicit Codex home when provided", () => {
    assert.equal(
      getOneCodeCodexHome("/custom/codex", "/home/user"),
      "/custom/codex",
    )
  })

  test("syncs manifest skills to all configured targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-skills-"))
    const homeDir = join(root, "home")
    const projectPath = join(root, "project")
    const codexHome = join(root, "onecode-codex")
    const skillSource = join(root, "skill-source", "security-mining-record")
    const manifestPath = join(root, "default-project-skills.json")

    await mkdir(skillSource, { recursive: true })
    await mkdir(projectPath, { recursive: true })
    await writeFile(join(skillSource, "SKILL.md"), "# Security Mining\n", "utf-8")
    await writeFile(
      manifestPath,
      JSON.stringify({
        skills: [
          {
            name: "security-mining-record",
            source: skillSource,
            targets: [
              "claude-project",
              "codex-project",
            ],
          },
        ],
      }),
      "utf-8",
    )

    const results = await syncDefaultProjectSkills({
      projectPath,
      manifestPath,
      homeDir,
      codexHome,
    })

    assert.equal(results.length, 2)
    assert.equal(results.every((result) => result.ok), true)

    const installedPaths = [
      join(projectPath, ".claude", "skills", "security-mining-record", "SKILL.md"),
      join(projectPath, ".agents", "skills", "security-mining-record", "SKILL.md"),
    ]

    for (const installedPath of installedPaths) {
      assert.equal(await readFile(installedPath, "utf-8"), "# Security Mining\n")
    }
  })
})
