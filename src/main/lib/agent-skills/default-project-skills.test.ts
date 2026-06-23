import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, test } from "node:test"
import {
  getOneCodeCodexHome,
  getSkillInstallTargetPath,
  syncDefaultProjectSkills,
  syncProjectInstalledSkillsToWorktree,
} from "./default-project-skills"

describe("default project skill install helpers", () => {
  test("resolves provider-specific install locations", () => {
    assert.equal(
      getSkillInstallTargetPath({
        skillName: "security-mining-record",
        target: "claude-user",
        homeDir: "/home/user",
      }),
      "/home/user/.1code/.claude/skills/security-mining-record",
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

  test("syncs manifest skills to configured project-level targets", async () => {
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

  test("default manifest keeps security-mining-record on the Codex project path", async () => {
    const manifest = JSON.parse(
      await readFile(
        join(process.cwd(), "skills/default-project-skills.json"),
        "utf-8",
      ),
    )
    const skill = manifest.skills.find(
      (entry: { name?: string }) => entry.name === "security-mining-record",
    )

    assert.deepEqual(skill.targets, ["codex-project"])
  })

  test("syncs project-installed skills into a chat worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-project-skills-"))
    const projectPath = join(root, "project")
    const worktreePath = join(root, "worktree")
    const codexSkill = join(projectPath, ".agents", "skills", "vulnforge")
    const claudeSkill = join(projectPath, ".claude", "skills", "vulnforge")
    const incompleteSkill = join(projectPath, ".agents", "skills", "draft-skill")

    await mkdir(codexSkill, { recursive: true })
    await mkdir(claudeSkill, { recursive: true })
    await mkdir(incompleteSkill, { recursive: true })
    await mkdir(worktreePath, { recursive: true })
    await writeFile(join(codexSkill, "SKILL.md"), "# Codex VulnForge\n", "utf-8")
    await writeFile(join(codexSkill, "notes.md"), "codex notes\n", "utf-8")
    await writeFile(join(claudeSkill, "SKILL.md"), "# Claude VulnForge\n", "utf-8")

    const results = await syncProjectInstalledSkillsToWorktree({
      sourceProjectPath: projectPath,
      worktreePath,
    })

    assert.deepEqual(
      results.map((result) => ({
        skillName: result.skillName,
        target: result.target,
        ok: result.ok,
      })),
      [
        { skillName: "vulnforge", target: "claude-project", ok: true },
        { skillName: "vulnforge", target: "codex-project", ok: true },
      ],
    )
    assert.equal(
      await readFile(
        join(worktreePath, ".agents", "skills", "vulnforge", "SKILL.md"),
        "utf-8",
      ),
      "# Codex VulnForge\n",
    )
    assert.equal(
      await readFile(
        join(worktreePath, ".agents", "skills", "vulnforge", "notes.md"),
        "utf-8",
      ),
      "codex notes\n",
    )
    assert.equal(
      await readFile(
        join(worktreePath, ".claude", "skills", "vulnforge", "SKILL.md"),
        "utf-8",
      ),
      "# Claude VulnForge\n",
    )
  })
})
