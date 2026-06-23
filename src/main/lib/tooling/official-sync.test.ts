import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { createToolingItemId } from "./ids"
import { OfficialInstalledStateStore } from "./official-installed-state"
import {
  OfficialRegistry,
  loadAndApplyOfficialContentManifest,
  loadOfficialContentManifest,
  officialRegistry,
} from "./official-registry"
import { syncOfficialClaudeSkills } from "./official-sync"
import { ClaudeMcpStore } from "./providers/claude/claude-mcp-store"

function createRegistry(): OfficialRegistry {
  return new OfficialRegistry({
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
        version: "1.0.0",
      },
    ],
    mcpServers: [],
  })
}

async function writeSkill(root: string, content: string): Promise<void> {
  const skillDir = join(root, "skills", "official-review")
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, "SKILL.md"), content, "utf-8")
}

describe("official content sync", () => {
  test("packaged official content includes Chrome DevTools MCP", async () => {
    const manifest = await loadOfficialContentManifest(
      join(process.cwd(), "skills", "official-content.json"),
    )
    const registry = new OfficialRegistry(manifest)
    const chromeDevtools = registry.getMcpServer("claude", "chrome-devtools")

    assert.ok(chromeDevtools)
    assert.equal(chromeDevtools.displayName, "Chrome DevTools")
    assert.equal(chromeDevtools.defaultEnabled, true)
    assert.deepEqual(chromeDevtools.config, {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"],
      env: {
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "true",
      },
    })
  })

  test("loads official content manifest from packaged JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-official-manifest-"))
    const manifestPath = join(root, "official-content.json")
    await writeFile(
      manifestPath,
      JSON.stringify({
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
        mcpServers: [
          {
            id: "official-adb",
            name: "official-adb",
            providers: ["claude"],
            defaultEnabled: true,
            config: {
              command: "node",
              args: ["adb.js"],
            },
          },
        ],
      }),
      "utf-8",
    )

    const manifest = await loadOfficialContentManifest(manifestPath)
    const registry = new OfficialRegistry(manifest)

    assert.equal(registry.getSkill("claude", "official-review")?.sourceDir, "skills/official-review")
    assert.equal(registry.getMcpServer("claude", "official-adb")?.config.command, "node")
  })

  test("rejects official MCP manifest entries without a runnable command or URL", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-official-manifest-invalid-"))
    const manifestPath = join(root, "official-content.json")
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        skills: [],
        mcpServers: [
          {
            id: "official-adb",
            name: "official-adb",
            providers: ["claude"],
            defaultEnabled: true,
            config: {
              args: ["adb.js"],
            },
          },
        ],
      }),
      "utf-8",
    )

    await assert.rejects(
      () => loadOfficialContentManifest(manifestPath),
      /official MCP server "official-adb".*command or url/i,
    )
  })

  test("applies packaged official content to the shared registry used by catalog and runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-official-manifest-apply-"))
    const manifestPath = join(root, "official-content.json")
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 99,
        skills: [],
        mcpServers: [
          {
            id: "official-runtime-mcp",
            name: "official-runtime-mcp",
            providers: ["claude"],
            defaultEnabled: true,
            config: {
              command: "node",
              args: ["runtime-mcp.js"],
            },
          },
        ],
      }),
      "utf-8",
    )

    const runtimeMcpStore = new ClaudeMcpStore()

    try {
      await loadAndApplyOfficialContentManifest(manifestPath)

      assert.equal(
        officialRegistry.getMcpServer("claude", "official-runtime-mcp")?.config.command,
        "node",
      )
      assert.deepEqual(await runtimeMcpStore.getEnabledOfficialMcpServers(), {
        "official-runtime-mcp": {
          command: "node",
          args: ["runtime-mcp.js"],
        },
      })
    } finally {
      officialRegistry.reset()
    }
  })

  test("installs and upgrades official Claude skills while recording ownership", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-official-sync-"))
    const bundleRoot = join(root, "bundle")
    const targetRoot = join(root, "home", ".1code", ".claude", "skills")
    const state = new OfficialInstalledStateStore(join(root, "state.json"))
    const registry = createRegistry()
    const itemId = createToolingItemId({
      kind: "skill",
      provider: "claude",
      source: "official",
      scope: "global",
      identity: "official-review",
    })

    await writeSkill(bundleRoot, "# Official v1\n")

    const installed = await syncOfficialClaudeSkills({
      registry,
      installedState: state,
      sourceRoot: bundleRoot,
      targetRoot,
    })

    assert.deepEqual(
      installed.map((result) => result.action),
      ["installed"],
    )
    assert.equal(
      await readFile(join(targetRoot, "official-review", "SKILL.md"), "utf-8"),
      "# Official v1\n",
    )

    const firstState = await state.read()
    assert.equal(firstState.items?.[itemId]?.targetPath, join(targetRoot, "official-review"))
    assert.equal(typeof firstState.items?.[itemId]?.fingerprint, "string")

    await writeSkill(bundleRoot, "# Official v2\n")

    const upgraded = await syncOfficialClaudeSkills({
      registry,
      installedState: state,
      sourceRoot: bundleRoot,
      targetRoot,
    })

    assert.deepEqual(
      upgraded.map((result) => result.action),
      ["updated"],
    )
    assert.equal(
      await readFile(join(targetRoot, "official-review", "SKILL.md"), "utf-8"),
      "# Official v2\n",
    )
  })

  test("does not overwrite user-owned or locally modified official skill paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-official-sync-conflict-"))
    const bundleRoot = join(root, "bundle")
    const targetRoot = join(root, "home", ".1code", ".claude", "skills")
    const targetSkill = join(targetRoot, "official-review")
    const state = new OfficialInstalledStateStore(join(root, "state.json"))
    const registry = createRegistry()

    await writeSkill(bundleRoot, "# Official v1\n")
    await mkdir(targetSkill, { recursive: true })
    await writeFile(join(targetSkill, "SKILL.md"), "# User custom\n", "utf-8")

    const conflict = await syncOfficialClaudeSkills({
      registry,
      installedState: state,
      sourceRoot: bundleRoot,
      targetRoot,
    })

    assert.deepEqual(
      conflict.map((result) => result.action),
      ["skipped-conflict"],
    )
    assert.equal(await readFile(join(targetSkill, "SKILL.md"), "utf-8"), "# User custom\n")

    await writeFile(join(targetSkill, "SKILL.md"), "# Official v1\n", "utf-8")
    await syncOfficialClaudeSkills({
      registry,
      installedState: state,
      sourceRoot: bundleRoot,
      targetRoot,
      allowAdoptExistingOfficialContent: true,
    })
    await writeFile(join(targetSkill, "SKILL.md"), "# Local edit\n", "utf-8")
    await writeSkill(bundleRoot, "# Official v2\n")

    const modified = await syncOfficialClaudeSkills({
      registry,
      installedState: state,
      sourceRoot: bundleRoot,
      targetRoot,
    })

    assert.deepEqual(
      modified.map((result) => result.action),
      ["skipped-modified"],
    )
    assert.equal(await readFile(join(targetSkill, "SKILL.md"), "utf-8"), "# Local edit\n")
  })

  test("removes discontinued official Claude skills only when owned and unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "onecode-official-sync-removed-"))
    const bundleRoot = join(root, "bundle")
    const targetRoot = join(root, "home", ".1code", ".claude", "skills")
    const state = new OfficialInstalledStateStore(join(root, "state.json"))

    await writeSkill(bundleRoot, "# Official v1\n")
    await syncOfficialClaudeSkills({
      registry: createRegistry(),
      installedState: state,
      sourceRoot: bundleRoot,
      targetRoot,
    })

    const discontinuedRegistry = new OfficialRegistry({
      version: 2,
      skills: [],
      mcpServers: [],
    })
    const removed = await syncOfficialClaudeSkills({
      registry: discontinuedRegistry,
      installedState: state,
      sourceRoot: bundleRoot,
      targetRoot,
    })

    assert.deepEqual(
      removed.map((result) => result.action),
      ["removed"],
    )

    await assert.rejects(
      () => readFile(join(targetRoot, "official-review", "SKILL.md"), "utf-8"),
      /ENOENT/,
    )

    const doc = await state.read()
    assert.equal(Object.keys(doc.items || {}).length, 0)
  })
})
