import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { createToolingItemId } from "../../ids"
import { OfficialPreferencesStore } from "../../preferences"
import { OfficialRegistry } from "../../official-registry"
import { ClaudeAdapter } from "./claude-adapter"
import {
  projectClaudeUserSkillsForRuntime,
  projectOfficialClaudeSkillsIntoProject,
} from "./claude-runtime-context"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function createSkill(root: string, name: string): Promise<void> {
  const skillDir = join(root, name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${name}`, "---", "", "Body", ""].join(
      "\n",
    ),
    "utf-8",
  )
}

describe("claude runtime context", () => {
  test("builds a Claude runtime plan with config dir projection and enabled official MCP servers", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-claude-adapter-runtime-"))
    const sourceRoot = join(root, "source")
    const skillsDir = join(sourceRoot, "skills")
    const commandsDir = join(sourceRoot, "commands")
    const agentsDir = join(sourceRoot, "agents")
    const pluginsDir = join(sourceRoot, "plugins")
    const settingsPath = join(sourceRoot, "settings.json")
    const claudeJsonPath = join(sourceRoot, ".claude.json")
    const userDataDir = join(root, "user-data")
    const preferences = new OfficialPreferencesStore(join(root, "official-preferences.json"))
    const registry = new OfficialRegistry({
      version: 1,
      skills: [
        {
          id: "official-review",
          name: "official-review",
          providers: ["claude"],
          sourceDir: "official-review",
          defaultEnabled: true,
          scope: "global",
        },
      ],
      mcpServers: [
        {
          id: "official-context",
          name: "official-context",
          providers: ["claude"],
          defaultEnabled: true,
          config: {
            command: "node",
            args: ["server.js"],
          },
        },
      ],
    })
    const officialMcpId = createToolingItemId({
      kind: "mcp",
      provider: "claude",
      source: "official",
      scope: "global",
      identity: "official-context",
    })

    await createSkill(skillsDir, "official-review")
    await mkdir(commandsDir, { recursive: true })
    await mkdir(agentsDir, { recursive: true })
    await mkdir(pluginsDir, { recursive: true })
    await writeFile(settingsPath, "{}\n", "utf-8")
    await writeFile(claudeJsonPath, "{}\n", "utf-8")

    const adapter = new ClaudeAdapter(undefined, undefined, {
      registry,
      preferences,
      assetSources: {
        skillsDir,
        commandsDir,
        agentsDir,
        pluginsDir,
        settingsPath,
        claudeJsonPath,
      },
    })

    const runtimeContext = await adapter.buildRuntimeContext({
      cwd: root,
      projectPath: root,
      subChatId: "sub-chat-1",
      userDataDir,
      symlinkCache: new Set<string>(),
    })

    const isolatedConfigDir = join(userDataDir, "claude-sessions", "sub-chat-1")
    assert.equal(runtimeContext.env.CLAUDE_CONFIG_DIR, isolatedConfigDir)
    assert.deepEqual(runtimeContext.sdkOptions.settingSources, ["project"])
    assert.equal(
      await pathExists(join(isolatedConfigDir, "skills", "official-review")),
      true,
    )
    assert.equal(
      await pathExists(join(root, ".claude", "skills", "official-review")),
      true,
    )
    assert.deepEqual(runtimeContext.sdkOptions.mcpServers?.["official-context"], {
      command: "node",
      args: ["server.js"],
    })

    await preferences.setEnabled(officialMcpId, false)
    const disabledRuntimeContext = await adapter.buildRuntimeContext({
      cwd: root,
      projectPath: root,
      subChatId: "sub-chat-1",
      userDataDir,
      symlinkCache: new Set<string>(),
    })

    assert.equal(disabledRuntimeContext.sdkOptions.mcpServers?.["official-context"], undefined)
  })

  test("projects only enabled official skills into the runtime skills directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-claude-runtime-"))
    const sourceDir = join(root, "source-skills")
    const targetDir = join(root, "runtime", "skills")
    await createSkill(sourceDir, "user-skill")
    await createSkill(sourceDir, "official-review")

    const registry = new OfficialRegistry({
      version: 1,
      skills: [
        {
          id: "official-review",
          name: "official-review",
          providers: ["claude"],
          sourceDir: "skills/official-review",
          defaultEnabled: true,
          scope: "global",
        },
      ],
      mcpServers: [],
    })
    const preferences = new OfficialPreferencesStore(
      join(root, "official-preferences.json"),
    )
    const officialSkillId = createToolingItemId({
      kind: "skill",
      provider: "claude",
      source: "official",
      scope: "global",
      identity: "official-review",
    })

    await preferences.setEnabled(officialSkillId, false)
    await projectClaudeUserSkillsForRuntime({
      sourceDir,
      targetDir,
      registry,
      preferences,
    })

    assert.equal(await pathExists(join(targetDir, "user-skill")), true)
    assert.equal(await pathExists(join(targetDir, "official-review")), false)

    await preferences.setEnabled(officialSkillId, true)
    await projectClaudeUserSkillsForRuntime({
      sourceDir,
      targetDir,
      registry,
      preferences,
    })

    assert.equal(await pathExists(join(targetDir, "official-review")), true)
  })

  test("projects enabled official skills into the project skills directory without deleting project skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-claude-project-skills-"))
    const sourceDir = join(root, "onecode-user-skills")
    const targetDir = join(root, "project", ".claude", "skills")
    await createSkill(sourceDir, "official-review")
    await createSkill(sourceDir, "official-disabled")
    await createSkill(targetDir, "project-only")
    await createSkill(targetDir, "official-disabled")

    const registry = new OfficialRegistry({
      version: 1,
      skills: [
        {
          id: "official-review",
          name: "official-review",
          providers: ["claude"],
          sourceDir: "official-review",
          defaultEnabled: true,
          scope: "global",
        },
        {
          id: "official-disabled",
          name: "official-disabled",
          providers: ["claude"],
          sourceDir: "official-disabled",
          defaultEnabled: true,
          scope: "global",
        },
      ],
      mcpServers: [],
    })
    const preferences = new OfficialPreferencesStore(
      join(root, "official-preferences.json"),
    )
    const disabledSkillId = createToolingItemId({
      kind: "skill",
      provider: "claude",
      source: "official",
      scope: "global",
      identity: "official-disabled",
    })

    await preferences.setEnabled(disabledSkillId, false)
    await projectOfficialClaudeSkillsIntoProject({
      sourceDir,
      targetDir,
      registry,
      preferences,
    })

    assert.equal(await pathExists(join(targetDir, "project-only")), true)
    assert.equal(await pathExists(join(targetDir, "official-review")), true)
    assert.equal(await pathExists(join(targetDir, "official-disabled")), false)
  })
})
