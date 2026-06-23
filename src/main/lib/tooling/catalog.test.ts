import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { ToolingCatalog } from "./catalog"
import { ToolingStore } from "./store"
import { ClaudeMcpStore } from "./providers/claude/claude-mcp-store"
import { ClaudeAdapter } from "./providers/claude/claude-adapter"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

describe("tooling catalog and store", () => {
  test("keeps Claude provider skill records separate from catalog DTOs", async () => {
    const oldHome = process.env.HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-tooling-domain-"))
    const homeDir = join(root, "home")
    process.env.HOME = homeDir

    try {
      const skillDir = join(
        homeDir,
        ".1code",
        ".claude",
        "skills",
        "provider-record-skill",
      )
      const skillMdPath = join(skillDir, "SKILL.md")
      await mkdir(skillDir, { recursive: true })
      await writeFile(
        skillMdPath,
        [
          "---",
          "name: provider-record-skill",
          "description: Provider record skill",
          "---",
          "",
          "Provider records should stay UI-free.",
          "",
        ].join("\n"),
        "utf-8",
      )

      const adapter = new ClaudeAdapter()
      const providerRecords = await adapter.listSkills({
        provider: "claude",
        kind: "skill",
        includeContent: true,
      })
      const providerRecord = providerRecords.find(
        (record) => record.nativeName === "provider-record-skill",
      ) as Record<string, unknown> | undefined

      assert.ok(providerRecord)
      assert.equal(providerRecord.provider, "claude")
      assert.equal(providerRecord.nativeName, "provider-record-skill")
      assert.equal("kind" in providerRecord, false)
      assert.equal("id" in providerRecord, false)
      assert.equal("canEdit" in providerRecord, false)

      const catalog = new ToolingCatalog([adapter])
      const listed = await catalog.list({
        provider: "claude",
        kind: "skill",
        includeContent: true,
      })
      const item = listed.items.find(
        (candidate) =>
          candidate.kind === "skill" && candidate.name === "provider-record-skill",
      )

      assert.ok(item)
      assert.equal(item.kind, "skill")
      assert.equal(item.id.startsWith("skill:claude:user:global:"), true)
      assert.equal(item.canEdit, true)
      assert.equal(item.location.path, skillMdPath)
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
    }
  })

  test("creates and lists Claude user skills through the unified model", async () => {
    const oldHome = process.env.HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-tooling-skill-"))
    const homeDir = join(root, "home")
    process.env.HOME = homeDir

    try {
      const adapter = new ClaudeAdapter()
      const catalog = new ToolingCatalog([adapter])
      const store = new ToolingStore(new Map([["claude", adapter]]))

      const created = await store.createSkill({
        provider: "claude",
        source: "user",
        name: "Tooling User Skill",
        description: "Created by unified tooling store",
        content: "Use this skill in tooling tests.",
      })

      const expectedPath = join(
        homeDir,
        ".1code",
        ".claude",
        "skills",
        "tooling-user-skill",
        "SKILL.md",
      )
      const legacyPath = join(
        homeDir,
        ".claude",
        "skills",
        "tooling-user-skill",
        "SKILL.md",
      )

      assert.equal(created.nativePath, expectedPath)
      assert.equal(await pathExists(expectedPath), true)
      assert.equal(await pathExists(legacyPath), false)

      const listed = await catalog.list({
        provider: "claude",
        kind: "skill",
        includeContent: true,
      })
      const skill = listed.items.find(
        (item) => item.kind === "skill" && item.name === "tooling-user-skill",
      )

      assert.ok(skill)
      assert.equal(skill.source, "user")
      assert.equal(skill.provider, "claude")
      assert.equal(skill.location.path, expectedPath)
      assert.match(await readFile(expectedPath, "utf-8"), /name: tooling-user-skill/)
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
    }
  })

  test("manages Claude project MCP servers in project .mcp.json", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "onecode-tooling-mcp-"))
    const mcpStore = new ClaudeMcpStore()

    const created = await mcpStore.createMcpServer({
      provider: "claude",
      scope: "project",
      projectPath,
      name: "project_server",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { MODE: "test" },
    })

    const mcpJsonPath = join(projectPath, ".mcp.json")
    assert.equal(created.source, "project")
    assert.equal(await pathExists(mcpJsonPath), true)
    assert.deepEqual(JSON.parse(await readFile(mcpJsonPath, "utf-8")), {
      project_server: {
        command: "node",
        args: ["server.js"],
        env: { MODE: "test" },
      },
    })

    const createdRef = mcpStore.itemRefFromScope("project", created.name, projectPath)

    await mcpStore.updateMcpServer(createdRef, {
      disabled: true,
      command: "bun",
    })

    const updated = JSON.parse(await readFile(mcpJsonPath, "utf-8"))
    assert.equal(updated.project_server.command, "bun")
    assert.equal(updated.project_server.disabled, true)

    const listed = await mcpStore.listMcpServers({ provider: "claude", projectPath })
    const projectServer = listed.find(
      (record) => record.source === "project" && record.name === "project_server",
    )
    assert.ok(projectServer)
    assert.equal(projectServer.enabled, false)

    await mcpStore.deleteMcpServer(createdRef)
    assert.deepEqual(JSON.parse(await readFile(mcpJsonPath, "utf-8")), {})
  })

  test("does not overwrite an existing Claude project MCP server on rename", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "onecode-tooling-mcp-conflict-"))
    const mcpStore = new ClaudeMcpStore()

    const first = await mcpStore.createMcpServer({
      provider: "claude",
      scope: "project",
      projectPath,
      name: "first_server",
      transport: "stdio",
      command: "node",
    })
    await mcpStore.createMcpServer({
      provider: "claude",
      scope: "project",
      projectPath,
      name: "second_server",
      transport: "stdio",
      command: "bun",
    })

    await assert.rejects(
      () =>
        mcpStore.updateMcpServer(
          mcpStore.itemRefFromScope("project", first.name, projectPath),
          { newName: "second_server" },
        ),
      /already exists/,
    )

    assert.deepEqual(JSON.parse(await readFile(join(projectPath, ".mcp.json"), "utf-8")), {
      first_server: { command: "node" },
      second_server: { command: "bun" },
    })
  })
})
