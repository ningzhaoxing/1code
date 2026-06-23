import type { McpServerConfig } from "../../claude-config"
import type { McpToolInfo } from "../../mcp-auth"
import type {
  McpTransport,
  ToolingProvider,
  ToolingScope,
  ToolingSource,
  ToolingStatus,
} from "../types"

export type ProviderSkillRecord = {
  provider: ToolingProvider
  source: ToolingSource
  scope: ToolingScope
  nativeName: string
  displayName?: string
  description?: string
  projectPath?: string | null
  pluginName?: string
  nativePath: string
  displayPath: string
  body?: string
  frontmatter?: {
    name?: string
    description?: string
  }
  enabled?: boolean
  status?: ToolingStatus
}

export type ProviderMcpRecord = {
  provider: ToolingProvider
  source: ToolingSource
  scope: ToolingScope
  name: string
  nativeName: string
  displayName?: string
  projectPath?: string | null
  pluginName?: string
  locationPath: string
  config: McpServerConfig
  transport: McpTransport
  tools?: McpToolInfo[]
  needsAuth: boolean
  authType?: "none" | "oauth" | "bearer"
  enabled?: boolean
  status?: ToolingStatus
}
