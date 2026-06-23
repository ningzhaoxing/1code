import * as fs from "fs/promises"
import * as path from "path"
import {
  CLAUDE_CONFIG_PATH,
  GLOBAL_MCP_PATH,
  getMergedGlobalMcpServers,
  getMergedLocalProjectMcpServers,
  getMcpServerConfig,
  readClaudeConfig,
  readClaudeDirConfig,
  readProjectMcpJson,
  removeMcpServerConfig,
  updateMcpServerConfig,
  writeClaudeConfig,
  type McpServerConfig,
} from "../../../claude-config"
import { discoverPluginMcpServers } from "../../../plugins"
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "../../../trpc/routers/claude-settings"
import { ToolingError } from "../../errors"
import { createToolingItemId, parseToolingItemId } from "../../ids"
import {
  officialRegistry as defaultOfficialRegistry,
  type OfficialMcpEntry,
  type OfficialRegistry,
} from "../../official-registry"
import {
  officialPreferencesStore as defaultOfficialPreferencesStore,
  type OfficialPreferencesStore,
} from "../../preferences"
import type {
  CreateMcpInput,
  ProviderListQuery,
  ToolingItemRef,
  ToolingStatus,
  UpdateMcpPatch,
} from "../../types"
import type { ProviderMcpRecord } from "../provider-model"

type ProjectMcpDocument = Record<string, unknown> & {
  mcpServers?: Record<string, McpServerConfig>
}

type EditableMcpRef =
  | {
      scope: "global"
      name: string
      config: McpServerConfig
      storage: "global-config"
    }
  | {
      scope: "project"
      name: string
      projectPath: string
      config: McpServerConfig
      storage: "project-json" | "private-project-config"
    }

type ParsedEditableMcpRef =
  | {
      scope: "global"
      name: string
    }
  | {
      scope: "project"
      name: string
      projectPath: string
    }

function projectIdentity(projectPath: string, name: string): string {
  return JSON.stringify({ projectPath, name })
}

function parseJsonIdentity(identity: string): Record<string, string> {
  try {
    const parsed = JSON.parse(identity)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function detectTransport(config: McpServerConfig): "stdio" | "http" | "sse" | "unknown" {
  if (config.type === "sse") return "sse"
  if (config.url) return "http"
  if (config.command) return "stdio"
  return "unknown"
}

function statusFromConfig(config: McpServerConfig): {
  status: ToolingStatus
  needsAuth: boolean
} {
  if (config.disabled) {
    return { status: "disabled", needsAuth: false }
  }
  const headers = config.headers as Record<string, string> | undefined
  const needsAuth =
    (config.authType === "oauth" || config.authType === "bearer") &&
    !headers?.Authorization &&
    !config._oauth?.accessToken
  return { status: needsAuth ? "needs-auth" : "unknown", needsAuth }
}

type ClaudeMcpSource = "official" | "user" | "project" | "plugin"

function createMcpRecord(input: {
  name: string
  source: ClaudeMcpSource
  config: McpServerConfig
  locationPath: string
  projectPath?: string | null
  pluginName?: string
  approved?: boolean
  enabled?: boolean
  displayName?: string
  nativeName?: string
}): ProviderMcpRecord {
  const scope =
    input.source === "project"
      ? "project"
      : input.source === "plugin"
        ? "plugin"
        : "global"
  const enabled = input.enabled ?? !input.config.disabled
  const configForStatus = enabled ? input.config : { ...input.config, disabled: true }
  const { status, needsAuth } = statusFromConfig(configForStatus)
  const pendingApproval = input.source === "plugin" && input.approved === false

  return {
    provider: "claude",
    source: input.source,
    scope,
    name: input.name,
    nativeName: input.nativeName || input.name,
    displayName: input.displayName || input.name,
    projectPath: input.projectPath ?? null,
    pluginName: input.pluginName,
    locationPath: input.locationPath,
    config: input.config,
    transport: detectTransport(input.config),
    tools: [],
    needsAuth,
    authType: input.config.authType,
    enabled,
    status: pendingApproval ? "pending-approval" : status,
  }
}

function cloneMcpConfig(config: McpServerConfig): McpServerConfig {
  return JSON.parse(JSON.stringify(config))
}

function buildMcpServerConfig(input: CreateMcpInput | UpdateMcpPatch): McpServerConfig {
  const config: McpServerConfig = {}
  if (input.transport === "stdio") {
    if (!input.command?.trim()) {
      throw new ToolingError("INVALID_NAME", "Command is required for stdio servers")
    }
    config.command = input.command.trim()
    if (input.args?.length) config.args = input.args
    if (input.env && Object.keys(input.env).length > 0) config.env = input.env
  } else if (input.transport === "http") {
    if (!input.url?.trim()) {
      throw new ToolingError("INVALID_NAME", "URL is required for HTTP servers")
    }
    config.url = input.url.trim()
  }

  if (input.authType) config.authType = input.authType
  if (input.bearerToken) {
    config.authType = "bearer"
    config.headers = { Authorization: `Bearer ${input.bearerToken}` }
  }
  if (input.disabled !== undefined) config.disabled = input.disabled
  return config
}

function buildMcpUpdateConfig(input: UpdateMcpPatch): McpServerConfig {
  const config: McpServerConfig = {}
  if (input.command !== undefined) config.command = input.command
  if (input.args !== undefined) config.args = input.args
  if (input.env !== undefined) config.env = input.env
  if (input.url !== undefined) config.url = input.url
  if (input.disabled !== undefined) config.disabled = input.disabled
  if (input.authType !== undefined) config.authType = input.authType
  if (input.bearerToken) {
    config.authType = "bearer"
    config.headers = { Authorization: `Bearer ${input.bearerToken}` }
  }
  if (input.authType === "none") {
    config.headers = undefined
    config._oauth = undefined
  }
  return config
}

function assertValidMcpName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new ToolingError(
      "INVALID_NAME",
      "Name must contain only letters, numbers, underscores, and hyphens",
    )
  }
}

async function readProjectDocument(projectPath: string): Promise<ProjectMcpDocument> {
  try {
    return JSON.parse(await fs.readFile(path.join(projectPath, ".mcp.json"), "utf-8"))
  } catch {
    return {}
  }
}

function getRawProjectServers(doc: ProjectMcpDocument): Record<string, McpServerConfig> {
  if (doc.mcpServers && typeof doc.mcpServers === "object") {
    return doc.mcpServers
  }

  const servers: Record<string, McpServerConfig> = {}
  for (const [key, value] of Object.entries(doc)) {
    if (
      key !== "mcpServers" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      servers[key] = value as McpServerConfig
    }
  }
  return servers
}

async function writeProjectDocument(projectPath: string, doc: ProjectMcpDocument): Promise<void> {
  await fs.mkdir(projectPath, { recursive: true })
  await fs.writeFile(
    path.join(projectPath, ".mcp.json"),
    JSON.stringify(doc, null, 2),
    "utf-8",
  )
}

async function updateProjectServer(
  projectPath: string,
  serverName: string,
  update: McpServerConfig,
): Promise<void> {
  const doc = await readProjectDocument(projectPath)
  if (doc.mcpServers && typeof doc.mcpServers === "object") {
    doc.mcpServers[serverName] = {
      ...(doc.mcpServers[serverName] || {}),
      ...update,
    }
  } else {
    doc[serverName] = {
      ...((doc[serverName] as McpServerConfig | undefined) || {}),
      ...update,
    }
  }
  await writeProjectDocument(projectPath, doc)
}

async function removeProjectServer(projectPath: string, serverName: string): Promise<void> {
  const doc = await readProjectDocument(projectPath)
  if (doc.mcpServers && typeof doc.mcpServers === "object") {
    delete doc.mcpServers[serverName]
  } else {
    delete doc[serverName]
  }
  await writeProjectDocument(projectPath, doc)
}

export class ClaudeMcpStore {
  constructor(
    private readonly officialRegistry: OfficialRegistry = defaultOfficialRegistry,
    private readonly officialPreferences: OfficialPreferencesStore =
      defaultOfficialPreferencesStore,
  ) {}

  async listMcpServers(query: ProviderListQuery): Promise<ProviderMcpRecord[]> {
    const [config, dirConfig] = await Promise.all([
      readClaudeConfig(),
      readClaudeDirConfig(),
    ])
    const items: ProviderMcpRecord[] = []

    const globalServers = await getMergedGlobalMcpServers(config, dirConfig)
    for (const [name, serverConfig] of Object.entries(globalServers)) {
      items.push(
        createMcpRecord({
          name,
          source: "user",
          config: serverConfig,
          locationPath: CLAUDE_CONFIG_PATH,
        }),
      )
    }

    if (query.projectPath) {
      const projectMcpJsonServers = await readProjectMcpJson(query.projectPath)
      const projectConfigServers = await getMergedLocalProjectMcpServers(
        query.projectPath,
        config,
        dirConfig,
      )
      const projectServers = { ...projectMcpJsonServers, ...projectConfigServers }
      for (const [name, serverConfig] of Object.entries(projectServers)) {
        items.push(
          createMcpRecord({
            name,
            source: "project",
            config: serverConfig,
            locationPath: path.join(query.projectPath, ".mcp.json"),
            projectPath: query.projectPath,
          }),
        )
      }
    }

    const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
      await Promise.all([
        getEnabledPlugins(),
        discoverPluginMcpServers(),
        getApprovedPluginMcpServers(),
      ])
    for (const pluginConfig of pluginMcpConfigs) {
      if (!enabledPluginSources.includes(pluginConfig.pluginSource)) continue
      for (const [name, serverConfig] of Object.entries(pluginConfig.mcpServers)) {
        if (globalServers[name]) continue
        const identifier = `${pluginConfig.pluginSource}:${name}`
        items.push(
          createMcpRecord({
            name,
            source: "plugin",
            config: serverConfig,
            locationPath: pluginConfig.pluginSource,
            pluginName: pluginConfig.pluginSource,
            approved: approvedServers.includes(identifier),
          }),
        )
      }
    }

    return items
  }

  async getEnabledOfficialMcpServers(): Promise<Record<string, McpServerConfig>> {
    const servers: Record<string, McpServerConfig> = {}
    for (const officialServer of this.officialRegistry.listMcpServers("claude")) {
      const enabled = await this.officialPreferences.getEnabled(
        this.officialMcpItemId(officialServer),
        officialServer.defaultEnabled,
      )
      if (!enabled) continue
      servers[officialServer.nativeName || officialServer.name] = cloneMcpConfig(
        officialServer.config,
      )
    }
    return servers
  }

  async createMcpServer(input: CreateMcpInput): Promise<ProviderMcpRecord> {
    const name = input.name.trim()
    assertValidMcpName(name)
    const config = buildMcpServerConfig(input)

    if (input.scope === "project") {
      const projectPath = this.requireProjectPath(input.projectPath)
      const servers = getRawProjectServers(await readProjectDocument(projectPath))
      const privateProjectServers = await getMergedLocalProjectMcpServers(projectPath)
      if (servers[name] || privateProjectServers[name]) {
        throw new ToolingError("NAME_CONFLICT", `Server "${name}" already exists in this project`)
      }
      await updateProjectServer(projectPath, name, config)
      return createMcpRecord({
        name,
        source: "project",
        config,
        locationPath: path.join(projectPath, ".mcp.json"),
        projectPath,
      })
    }

    const [existingConfig, existingDirConfig] = await Promise.all([
      readClaudeConfig(),
      readClaudeDirConfig(),
    ])
    const globalServers = await getMergedGlobalMcpServers(existingConfig, existingDirConfig)
    if (globalServers[name]) {
      throw new ToolingError("NAME_CONFLICT", `Server "${name}" already exists`)
    }
    const updated = updateMcpServerConfig(existingConfig, GLOBAL_MCP_PATH, name, config)
    await writeClaudeConfig(updated)
    return createMcpRecord({
      name,
      source: "user",
      config,
      locationPath: CLAUDE_CONFIG_PATH,
    })
  }

  async updateMcpServer(itemRef: ToolingItemRef, patch: UpdateMcpPatch): Promise<void> {
    const ref = await this.resolveEditableMcpRefWithConfig(itemRef)
    if (patch.newName) assertValidMcpName(patch.newName)
    const update = buildMcpUpdateConfig(patch)

    if (ref.scope === "project") {
      if (patch.newName && patch.newName !== ref.name) {
        await this.assertProjectMcpNameAvailable(ref.projectPath, patch.newName)
      }

      if (ref.storage === "private-project-config") {
        const current = await readClaudeConfig()
        if (patch.newName && patch.newName !== ref.name) {
          const removed = removeMcpServerConfig(current, ref.projectPath, ref.name)
          const added = updateMcpServerConfig(removed, ref.projectPath, patch.newName, {
            ...ref.config,
            ...update,
          })
          await writeClaudeConfig(added)
          return
        }
        await writeClaudeConfig(
          updateMcpServerConfig(current, ref.projectPath, ref.name, {
            ...ref.config,
            ...update,
          }),
        )
        return
      }

      if (patch.newName && patch.newName !== ref.name) {
        await removeProjectServer(ref.projectPath, ref.name)
        await updateProjectServer(ref.projectPath, patch.newName, {
          ...ref.config,
          ...update,
        })
        return
      }
      await updateProjectServer(ref.projectPath, ref.name, { ...ref.config, ...update })
      return
    }

    const current = await readClaudeConfig()
    if (patch.newName && patch.newName !== ref.name) {
      await this.assertGlobalMcpNameAvailable(patch.newName)
      const removed = removeMcpServerConfig(current, GLOBAL_MCP_PATH, ref.name)
      const added = updateMcpServerConfig(removed, GLOBAL_MCP_PATH, patch.newName, {
        ...ref.config,
        ...update,
      })
      await writeClaudeConfig(added)
      return
    }
    await writeClaudeConfig(
      updateMcpServerConfig(current, GLOBAL_MCP_PATH, ref.name, {
        ...ref.config,
        ...update,
      }),
    )
  }

  async deleteMcpServer(itemRef: ToolingItemRef): Promise<void> {
    const ref = await this.resolveEditableMcpRefWithConfig(itemRef)
    if (ref.scope === "project") {
      if (ref.storage === "private-project-config") {
        await writeClaudeConfig(
          removeMcpServerConfig(await readClaudeConfig(), ref.projectPath, ref.name),
        )
      } else {
        await removeProjectServer(ref.projectPath, ref.name)
      }
      return
    }
    await writeClaudeConfig(
      removeMcpServerConfig(await readClaudeConfig(), GLOBAL_MCP_PATH, ref.name),
    )
  }

  async setMcpEnabled(itemRef: ToolingItemRef, enabled: boolean): Promise<void> {
    await this.updateMcpServer(itemRef, { disabled: !enabled })
  }

  itemRefFromScope(scope: "global" | "project", name: string, projectPath?: string | null): ToolingItemRef {
    if (scope === "project") {
      const requiredProjectPath = this.requireProjectPath(projectPath)
      return {
        id: createToolingItemId({
          kind: "mcp",
          provider: "claude",
          source: "project",
          scope: "project",
          identity: projectIdentity(requiredProjectPath, name),
        }),
      }
    }

    return {
      id: createToolingItemId({
        kind: "mcp",
        provider: "claude",
        source: "user",
        scope: "global",
        identity: name,
      }),
    }
  }

  private resolveEditableMcpRef(itemRef: ToolingItemRef): ParsedEditableMcpRef {
    const parsed = parseToolingItemId(itemRef.id)
    if (!parsed || parsed.kind !== "mcp" || parsed.provider !== "claude") {
      throw new ToolingError("INVALID_PROVIDER", "Invalid Claude MCP item id")
    }
    if (parsed.source === "plugin" || parsed.source === "official") {
      throw new ToolingError("READONLY_ITEM", "This MCP source is readonly")
    }

    if (parsed.source === "project") {
      const identity = parseJsonIdentity(parsed.identity)
      if (!identity.projectPath || !identity.name) {
        throw new ToolingError("INVALID_PATH", "Invalid project MCP identity")
      }
      const projectPath = identity.projectPath
      const name = identity.name
      return {
        scope: "project",
        name,
        projectPath,
      }
    }

    return {
      scope: "global",
      name: parsed.identity,
    }
  }

  private async resolveEditableMcpRefWithConfig(itemRef: ToolingItemRef): Promise<EditableMcpRef> {
    const ref = this.resolveEditableMcpRef(itemRef)
    if (ref.scope === "project") {
      const servers = getRawProjectServers(await readProjectDocument(ref.projectPath))
      const config = servers[ref.name]
      if (config) {
        return {
          ...ref,
          config,
          storage: "project-json",
        }
      }

      const privateConfig = getMcpServerConfig(
        await readClaudeConfig(),
        ref.projectPath,
        ref.name,
      )
      if (!privateConfig) throw new ToolingError("ITEM_NOT_FOUND", `Server "${ref.name}" not found`)
      return {
        ...ref,
        config: privateConfig,
        storage: "private-project-config",
      }
    }

    const config = getMcpServerConfig(await readClaudeConfig(), GLOBAL_MCP_PATH, ref.name)
    if (!config) throw new ToolingError("ITEM_NOT_FOUND", `Server "${ref.name}" not found`)
    return {
      scope: "global",
      name: ref.name,
      config,
      storage: "global-config",
    }
  }

  private requireProjectPath(projectPath?: string | null): string {
    if (!projectPath) {
      throw new ToolingError("INVALID_SCOPE", "Project path required for project MCP servers")
    }
    return projectPath
  }

  private async assertProjectMcpNameAvailable(projectPath: string, name: string): Promise<void> {
    const projectJsonServers = getRawProjectServers(await readProjectDocument(projectPath))
    const privateProjectServers = await getMergedLocalProjectMcpServers(projectPath)
    if (projectJsonServers[name] || privateProjectServers[name]) {
      throw new ToolingError("NAME_CONFLICT", `Server "${name}" already exists in this project`)
    }
  }

  private async assertGlobalMcpNameAvailable(name: string): Promise<void> {
    const [config, dirConfig] = await Promise.all([
      readClaudeConfig(),
      readClaudeDirConfig(),
    ])
    const globalServers = await getMergedGlobalMcpServers(config, dirConfig)
    if (globalServers[name]) {
      throw new ToolingError("NAME_CONFLICT", `Server "${name}" already exists`)
    }
  }

  private officialMcpItemId(entry: OfficialMcpEntry): string {
    return createToolingItemId({
      kind: "mcp",
      provider: "claude",
      source: "official",
      scope: "global",
      identity: entry.name,
    })
  }
}
