import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { buildOfficialMcpServersForSettings } from "./claude-official-mcp-settings"
import type { ToolingMcpItem } from "../../types"

function officialMcpItem(input: {
  id: string
  name: string
  nativeName: string
  enabled: boolean
}): ToolingMcpItem {
  return {
    id: input.id,
    kind: "mcp",
    provider: "claude",
    source: "official",
    scope: "global",
    name: input.name,
    displayName: input.name,
    readonly: true,
    canEdit: false,
    canDelete: false,
    canToggle: true,
    enabled: input.enabled,
    status: input.enabled ? "unknown" : "disabled",
    location: {
      path: "official-content.json",
      displayPath: "official-content.json",
    },
    mcp: {
      transport: "stdio",
      config: {
        command: "node",
        args: [`${input.nativeName}.js`],
      },
      tools: [],
      needsAuth: false,
      nativeName: input.nativeName,
    },
  }
}

describe("official MCP settings projection", () => {
  test("probes enabled official MCP by native name and preserves official display name", async () => {
    const enabled = officialMcpItem({
      id: "mcp:claude:official:global:official-adb",
      name: "official-adb",
      nativeName: "onecode_official_adb",
      enabled: true,
    })
    const disabled = officialMcpItem({
      id: "mcp:claude:official:global:official-disabled",
      name: "official-disabled",
      nativeName: "onecode_official_disabled",
      enabled: false,
    })
    const probedKeys: string[] = []

    const servers = await buildOfficialMcpServersForSettings(
      [enabled, disabled],
      async (configs) => {
        probedKeys.push(...Object.keys(configs))
        return [
          {
            name: "onecode_official_adb",
            status: "connected",
            tools: [
              {
                name: "devices",
                description: "List devices",
                inputSchema: {},
              },
            ],
            needsAuth: false,
            config: configs.onecode_official_adb,
          },
        ]
      },
    )

    assert.deepEqual(probedKeys, ["onecode_official_adb"])
    assert.equal(servers[0].name, "official-adb")
    assert.equal(servers[0].status, "connected")
    assert.equal(servers[0].tools.length, 1)
    assert.equal(servers[0].config._toolingItemId, enabled.id)
    assert.equal(servers[0].config._nativeName, "onecode_official_adb")

    assert.equal(servers[1].name, "official-disabled")
    assert.equal(servers[1].status, "disabled")
    assert.equal(servers[1].config.disabled, true)
    assert.equal(servers[1].config._toolingItemId, disabled.id)
  })
})
