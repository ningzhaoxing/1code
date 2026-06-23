import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { createToolingItemId } from "../../ids"
import { OfficialPreferencesStore } from "../../preferences"
import { OfficialRegistry } from "../../official-registry"
import { prepareClaudeConfigAssets } from "./claude-config-assets"

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

describe("claude config assets", () => {
  test("refreshes runtime skill projection even after static symlinks are cached", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-claude-assets-"))
    const isolatedConfigDir = join(root, "runtime")
    const skillsDir = join(root, "source", "skills")
    const commandsDir = join(root, "source", "commands")
    const agentsDir = join(root, "source", "agents")
    const pluginsDir = join(root, "source", "plugins")
    const settingsPath = join(root, "source", "settings.json")
    const claudeJsonPath = join(root, "source", ".claude.json")
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
      mcpServers: [],
    })
    const officialSkillId = createToolingItemId({
      kind: "skill",
      provider: "claude",
      source: "official",
      scope: "global",
      identity: "official-review",
    })
    const symlinkCache = new Set<string>()

    await createSkill(skillsDir, "official-review")
    await mkdir(commandsDir, { recursive: true })
    await mkdir(agentsDir, { recursive: true })
    await mkdir(pluginsDir, { recursive: true })
    await writeFile(settingsPath, "{}\n", "utf-8")
    await writeFile(claudeJsonPath, "{}\n", "utf-8")

    await prepareClaudeConfigAssets({
      isolatedConfigDir,
      cacheKey: "sub-chat-1",
      symlinkCache,
      registry,
      preferences,
      sources: {
        skillsDir,
        commandsDir,
        agentsDir,
        pluginsDir,
        settingsPath,
        claudeJsonPath,
      },
    })

    assert.equal(symlinkCache.has("sub-chat-1"), true)
    assert.equal(await pathExists(join(isolatedConfigDir, "skills", "official-review")), true)

    await preferences.setEnabled(officialSkillId, false)
    await prepareClaudeConfigAssets({
      isolatedConfigDir,
      cacheKey: "sub-chat-1",
      symlinkCache,
      registry,
      preferences,
      sources: {
        skillsDir,
        commandsDir,
        agentsDir,
        pluginsDir,
        settingsPath,
        claudeJsonPath,
      },
    })

    assert.equal(await pathExists(join(isolatedConfigDir, "skills", "official-review")), false)
  })
})
