import type { McpServerConfig } from "../claude-config"
import type { McpToolInfo } from "../mcp-auth"

export type ToolingKind = "skill" | "mcp"
export type ToolingProvider = "claude" | "codex"
export type ToolingSource = "official" | "user" | "project" | "plugin"
export type ToolingScope = "global" | "project" | "plugin"

export type ToolingStatus =
  | "available"
  | "connected"
  | "failed"
  | "needs-auth"
  | "disabled"
  | "pending-approval"
  | "shadowed"
  | "unknown"

export type ToolingLocation = {
  path: string
  displayPath: string
}

export type ToolingDiagnostic = {
  code: string
  message: string
  itemId?: string
}

export type BaseToolingItem = {
  id: string
  kind: ToolingKind
  provider: ToolingProvider
  source: ToolingSource
  scope: ToolingScope
  name: string
  displayName: string
  description?: string
  projectPath?: string | null
  pluginName?: string
  readonly: boolean
  canEdit: boolean
  canDelete: boolean
  canToggle: boolean
  enabled: boolean
  status: ToolingStatus
  location: ToolingLocation
  diagnostics?: ToolingDiagnostic[]
}

export type ToolingSkillItem = BaseToolingItem & {
  kind: "skill"
  skill: {
    path: string
    body?: string
    frontmatter?: {
      name?: string
      description?: string
    }
  }
  content?: string
}

export type McpTransport = "stdio" | "http" | "sse" | "unknown"

export type ToolingMcpItem = BaseToolingItem & {
  kind: "mcp"
  mcp: {
    transport: McpTransport
    config: McpServerConfig
    tools: McpToolInfo[]
    needsAuth: boolean
    authType?: "none" | "oauth" | "bearer"
    nativeName: string
  }
}

export type ToolingItem = ToolingSkillItem | ToolingMcpItem

export type ToolingCatalogQuery = {
  provider?: ToolingProvider | "all"
  kind?: ToolingKind | "all"
  projectPath?: string | null
  includeContent?: boolean
  includeStatus?: boolean
  includeDisabled?: boolean
}

export type ToolingCatalogResult = {
  items: ToolingItem[]
  diagnostics: ToolingDiagnostic[]
}

export type ToolingItemRef = {
  id: string
}

export type ProviderListQuery = ToolingCatalogQuery

export type CreateSkillInput = {
  provider?: ToolingProvider
  source: "user" | "project"
  projectPath?: string | null
  name: string
  description: string
  content: string
}

export type UpdateSkillPatch = {
  name: string
  description: string
  content: string
}

export type CreateMcpInput = {
  provider?: ToolingProvider
  scope: "global" | "project"
  projectPath?: string | null
  name: string
  transport: "stdio" | "http"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  authType?: "none" | "oauth" | "bearer"
  bearerToken?: string
  disabled?: boolean
}

export type UpdateMcpPatch = Partial<CreateMcpInput> & {
  newName?: string
  disabled?: boolean
}

export type ProviderRuntimeInput = {
  cwd: string
  projectPath?: string | null
  subChatId: string
  chatId?: string
  isUsingOllama?: boolean
  userDataDir?: string
  symlinkCache?: Set<string>
}

export type ProviderRuntimeContext = {
  env: Record<string, string>
  sdkOptions: {
    settingSources?: Array<"user" | "project" | "local">
    mcpServers?: Record<string, McpServerConfig>
  }
}
