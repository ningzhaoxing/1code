import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { ToolingCatalog } from "./catalog"
import { createToolingItemId } from "./ids"
import { OfficialPreferencesStore } from "./preferences"
import { OfficialRegistry } from "./official-registry"
import { ClaudeAdapter } from "./providers/claude/claude-adapter"
import { ClaudeMcpStore } from "./providers/claude/claude-mcp-store"
import { ClaudeSkillStore } from "./providers/claude/claude-skill-store"
import { ToolingStore } from "./store"
import type { ToolingMcpItem } from "./types"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function withTempHome<T>(fn: (homeDir: string, root: string) => Promise<T>): Promise<T> {
  const oldHome = process.env.HOME
  const root = await mkdtemp(join(tmpdir(), "onecode-official-tooling-"))
  const homeDir = join(root, "home")
  process.env.HOME = homeDir

  try {
    return await fn(homeDir, root)
  } finally {
    if (oldHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = oldHome
    }
  }
}

function createOfficialFixture(root: string): {
  registry: OfficialRegistry
  preferences: OfficialPreferencesStore
} {
  const registry = new OfficialRegistry({
    version: 1,
    skills: [
      {
        id: "official-review",
        name: "official-review",
        displayName: "Official Review",
        providers: ["claude"],
        sourceDir: "skills/official-review",
        defaultEnabled: true,
        scope: "global",
      },
    ],
    mcpServers: [
      {
        id: "official_adb",
        name: "official_adb",
        nativeName: "onecode_official_adb",
        displayName: "Official ADB",
        providers: ["claude"],
        defaultEnabled: true,
        config: {
          command: "node",
          args: ["official-adb.js"],
        },
      },
    ],
  })
  const preferences = new OfficialPreferencesStore(
    join(root, "home", ".1code", "tooling", "official-preferences.json"),
  )
  return { registry, preferences }
}

describe("official tooling", () => {
  test("classifies official Claude skills and preserves user toggle preferences", async () => {
    await withTempHome(async (homeDir, root) => {
      const { registry, preferences } = createOfficialFixture(root)
      const skillDir = join(homeDir, ".1code", ".claude", "skills", "official-review")
      const skillPath = join(skillDir, "SKILL.md")
      await mkdir(skillDir, { recursive: true })
      await writeFile(
        skillPath,
        [
          "---",
          "name: official-review",
          "description: Official review skill",
          "---",
          "",
          "Use this official skill in tests.",
          "",
        ].join("\n"),
        "utf-8",
      )

      const adapter = new ClaudeAdapter(
        new ClaudeSkillStore(registry, preferences),
        new ClaudeMcpStore(registry, preferences),
      )
      const providerRecords = await adapter.listSkills({
        provider: "claude",
        kind: "skill",
        includeContent: true,
      })
      const providerRecord = providerRecords.find(
        (record) => record.nativeName === "official-review",
      )

      assert.ok(providerRecord)
      assert.equal(providerRecord.source, "user")

      const catalog = new ToolingCatalog([adapter], registry, preferences)
      const store = new ToolingStore(
        new Map([["claude", adapter]]),
        preferences,
        registry,
      )

      const listed = await catalog.list({
        provider: "claude",
        kind: "skill",
        includeContent: true,
      })
      const officialSkill = listed.items.find(
        (item) => item.kind === "skill" && item.name === "official-review",
      )

      assert.ok(officialSkill)
      assert.equal(officialSkill.source, "official")
      assert.equal(officialSkill.readonly, true)
      assert.equal(officialSkill.canEdit, false)
      assert.equal(officialSkill.canDelete, false)
      assert.equal(officialSkill.canToggle, true)
      assert.equal(officialSkill.enabled, true)
      assert.equal(officialSkill.status, "available")

      await assert.rejects(
        () =>
          store.updateSkill(officialSkill.id, {
            name: "official-review",
            description: "Changed",
            content: "Changed",
          }),
        /readonly/i,
      )

      await store.setEnabled(officialSkill.id, false)

      const relisted = await catalog.list({ provider: "claude", kind: "skill" })
      const disabledSkill = relisted.items.find(
        (item) => item.kind === "skill" && item.name === "official-review",
      )

      assert.ok(disabledSkill)
      assert.equal(disabledSkill.source, "official")
      assert.equal(disabledSkill.enabled, false)
      assert.equal(disabledSkill.status, "disabled")
      assert.equal(await pathExists(skillPath), true)

      const preferencesJson = JSON.parse(
        await readFile(
          join(homeDir, ".1code", "tooling", "official-preferences.json"),
          "utf-8",
        ),
      )
      assert.equal(preferencesJson.items[officialSkill.id].enabled, false)
    })
  })

  test("lists official Claude MCP servers from manifest without writing user MCP config", async () => {
    await withTempHome(async (homeDir, root) => {
      const { registry, preferences } = createOfficialFixture(root)
      const adapter = new ClaudeAdapter(
        new ClaudeSkillStore(registry, preferences),
        new ClaudeMcpStore(registry, preferences),
      )
      const providerRecords = await adapter.listMcpServers({
        provider: "claude",
        kind: "mcp",
      })

      assert.equal(providerRecords.some((record) => record.source === "official"), false)

      const catalog = new ToolingCatalog([adapter], registry, preferences)
      const store = new ToolingStore(
        new Map([["claude", adapter]]),
        preferences,
        registry,
      )

      const listed = await catalog.list({ provider: "claude", kind: "mcp" })
      const officialMcp = listed.items.find(
        (item): item is ToolingMcpItem =>
          item.kind === "mcp" && item.name === "official_adb",
      )

      assert.ok(officialMcp)
      assert.equal(officialMcp.source, "official")
      assert.equal(officialMcp.readonly, true)
      assert.equal(officialMcp.canEdit, false)
      assert.equal(officialMcp.canDelete, false)
      assert.equal(officialMcp.canToggle, true)
      assert.equal(officialMcp.enabled, true)
      assert.equal(officialMcp.status, "unknown")
      assert.equal(officialMcp.mcp.nativeName, "onecode_official_adb")
      assert.deepEqual(officialMcp.mcp.config, {
        command: "node",
        args: ["official-adb.js"],
      })
      assert.equal(
        await pathExists(join(homeDir, ".1code", ".claude", ".claude.json")),
        false,
      )

      await store.setEnabled(officialMcp.id, false)

      const relisted = await catalog.list({ provider: "claude", kind: "mcp" })
      const disabledMcp = relisted.items.find(
        (item) => item.kind === "mcp" && item.name === "official_adb",
      )

      assert.ok(disabledMcp)
      assert.equal(disabledMcp.source, "official")
      assert.equal(disabledMcp.enabled, false)
      assert.equal(disabledMcp.status, "disabled")
      assert.equal(
        await pathExists(join(homeDir, ".1code", ".claude", ".claude.json")),
        false,
      )
    })
  })

  test("rejects creating user skills that use official reserved names", async () => {
    await withTempHome(async (_homeDir, root) => {
      const { registry, preferences } = createOfficialFixture(root)
      const adapter = new ClaudeAdapter(
        new ClaudeSkillStore(registry, preferences),
        new ClaudeMcpStore(registry, preferences),
      )
      const store = new ToolingStore(
        new Map([["claude", adapter]]),
        preferences,
        registry,
      )

      await assert.rejects(
        () =>
          store.createSkill({
            provider: "claude",
            source: "user",
            name: "official-review",
            description: "User override attempt",
            content: "Should be rejected.",
          }),
        /reserved official/i,
      )
    })
  })

  test("returns only enabled official MCP servers for runtime injection", async () => {
    await withTempHome(async (_homeDir, root) => {
      const { registry, preferences } = createOfficialFixture(root)
      const officialMcpId = createToolingItemId({
        kind: "mcp",
        provider: "claude",
        source: "official",
        scope: "global",
        identity: "official_adb",
      })

      const mcpStore = new ClaudeMcpStore(registry, preferences)

      assert.deepEqual(await mcpStore.getEnabledOfficialMcpServers(), {
        onecode_official_adb: {
          command: "node",
          args: ["official-adb.js"],
        },
      })

      await preferences.setEnabled(officialMcpId, false)

      assert.deepEqual(await mcpStore.getEnabledOfficialMcpServers(), {})
    })
  })
})
