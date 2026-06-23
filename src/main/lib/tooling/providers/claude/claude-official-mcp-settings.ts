import type { McpServerConfig } from "../../../claude-config"
import type { McpToolInfo } from "../../../mcp-auth"
import type { ToolingMcpItem } from "../../types"

export type McpSettingsServer = {
  name: string
  status: string
  tools: McpToolInfo[]
  needsAuth: boolean
  config: Record<string, unknown>
}

export type ProbeMcpServersForSettings = (
  servers: Record<string, McpServerConfig>,
) => Promise<McpSettingsServer[]>

function withOfficialMetadata(
  item: ToolingMcpItem,
  config: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...config,
    disabled: !item.enabled,
    _toolingItemId: item.id,
    _nativeName: item.mcp.nativeName,
  }
}

export async function buildOfficialMcpServersForSettings(
  items: ToolingMcpItem[],
  probeServers: ProbeMcpServersForSettings,
): Promise<McpSettingsServer[]> {
  const enabledItems = items.filter((item) => item.enabled)
  const enabledConfigs = Object.fromEntries(
    enabledItems.map((item) => [item.mcp.nativeName, item.mcp.config]),
  )
  const probedServers =
    Object.keys(enabledConfigs).length > 0
      ? await probeServers(enabledConfigs)
      : []
  const probedByNativeName = new Map(
    probedServers.map((server) => [server.name, server]),
  )

  return items.map((item) => {
    if (!item.enabled) {
      return {
        name: item.name,
        status: "disabled",
        tools: [],
        needsAuth: false,
        config: withOfficialMetadata(item, item.mcp.config),
      }
    }

    const probed = probedByNativeName.get(item.mcp.nativeName)
    return {
      name: item.name,
      status: probed?.status || item.status,
      tools: probed?.tools || item.mcp.tools,
      needsAuth: probed?.needsAuth ?? item.mcp.needsAuth,
      config: withOfficialMetadata(
        item,
        probed?.config || item.mcp.config,
      ),
    }
  })
}
