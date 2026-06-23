import assert from "node:assert/strict"
import { access, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { toolingRouter } from "./tooling"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

describe("tooling router", () => {
  test("gets a tooling item by id after creation", async () => {
    const oldHome = process.env.HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-tooling-router-"))
    const homeDir = join(root, "home")
    process.env.HOME = homeDir

    try {
      const caller = toolingRouter.createCaller({ getWindow: () => null })
      const created = await caller.createSkill({
        provider: "claude",
        source: "user",
        name: "Router Skill",
        description: "Created through tooling router",
        content: "Router get should return this skill.",
      })

      const fetched = await caller.get({
        itemId: created.id,
        includeContent: true,
      })

      assert.equal(fetched.id, created.id)
      assert.equal(fetched.kind, "skill")
      assert.equal(fetched.name, "router-skill")
      assert.equal(fetched.source, "user")
      assert.equal(fetched.provider, "claude")
      assert.equal(await pathExists(fetched.skill.path), true)
      assert.equal(fetched.skill.body, "Router get should return this skill.")
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
    }
  })

  test("refreshes status through the tooling router list path", async () => {
    const oldHome = process.env.HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-tooling-refresh-"))
    process.env.HOME = join(root, "home")

    try {
      const caller = toolingRouter.createCaller({ getWindow: () => null })
      const projectPath = join(root, "project")
      await caller.createMcpServer({
        provider: "claude",
        scope: "project",
        projectPath,
        name: "refresh_server",
        transport: "stdio",
        command: "node",
        disabled: true,
      })

      const refreshed = await caller.refreshStatus({
        provider: "claude",
        kind: "mcp",
        projectPath,
      })
      const item = refreshed.items.find(
        (candidate) =>
          candidate.kind === "mcp" && candidate.name === "refresh_server",
      )

      assert.ok(item)
      assert.equal(item.enabled, false)
      assert.equal(item.status, "disabled")
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
    }
  })

  test("supports documented MCP CRUD aliases", async () => {
    const oldHome = process.env.HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-tooling-mcp-alias-"))
    process.env.HOME = join(root, "home")
    const projectPath = join(root, "project")

    try {
      const caller = toolingRouter.createCaller({ getWindow: () => null })
      const created = await caller.createMcp({
        provider: "claude",
        scope: "project",
        projectPath,
        name: "alias_server",
        transport: "stdio",
        command: "node",
      })

      assert.equal(created.kind, "mcp")
      assert.equal(created.name, "alias_server")
      assert.equal(created.source, "project")

      await caller.updateMcp({
        itemId: created.id,
        command: "bun",
        disabled: true,
      })
      const updated = await caller.get({ itemId: created.id, projectPath })

      assert.equal(updated.kind, "mcp")
      assert.equal(updated.enabled, false)
      assert.equal(updated.mcp.config.command, "bun")

      await caller.deleteMcp({ itemId: created.id })
      await assert.rejects(
        () => caller.get({ itemId: created.id, projectPath }),
        /not found/i,
      )
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
    }
  })

  test("rejects starting MCP auth for non-MCP tooling items", async () => {
    const oldHome = process.env.HOME
    const root = await mkdtemp(join(tmpdir(), "onecode-tooling-auth-"))
    process.env.HOME = join(root, "home")

    try {
      const caller = toolingRouter.createCaller({ getWindow: () => null })
      const created = await caller.createSkill({
        provider: "claude",
        source: "user",
        name: "Auth Skill",
        description: "Not an MCP server",
        content: "Auth should reject skills.",
      })

      await assert.rejects(
        () => caller.startMcpAuth({ itemId: created.id }),
        /MCP/i,
      )
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = oldHome
      }
    }
  })
})
