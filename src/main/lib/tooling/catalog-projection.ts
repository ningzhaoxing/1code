import { createToolingItemId } from "./ids"
import type {
  ToolingMcpItem,
  ToolingScope,
  ToolingSkillItem,
} from "./types"
import type {
  ProviderMcpRecord,
  ProviderSkillRecord,
} from "./providers/provider-model"

function projectIdentity(projectPath: string, name: string): string {
  return JSON.stringify({ projectPath, name })
}

function pluginIdentity(pluginName: string, name: string): string {
  return JSON.stringify({ pluginName, name })
}

function identityForRecord(input: {
  source: ProviderSkillRecord["source"] | ProviderMcpRecord["source"]
  scope: ToolingScope
  name: string
  projectPath?: string | null
  pluginName?: string
}): string {
  if (input.scope === "project" && input.projectPath) {
    return projectIdentity(input.projectPath, input.name)
  }
  if (input.scope === "plugin" && input.pluginName) {
    return pluginIdentity(input.pluginName, input.name)
  }
  return input.name
}

export function projectProviderSkillRecord(record: ProviderSkillRecord): ToolingSkillItem {
  const readonly = record.source === "plugin" || record.source === "official"
  const enabled = record.enabled ?? true
  const name = record.frontmatter?.name || record.nativeName

  return {
    id: createToolingItemId({
      kind: "skill",
      provider: record.provider,
      source: record.source,
      scope: record.scope,
      identity: identityForRecord({
        source: record.source,
        scope: record.scope,
        name,
        projectPath: record.projectPath,
        pluginName: record.pluginName,
      }),
    }),
    kind: "skill",
    provider: record.provider,
    source: record.source,
    scope: record.scope,
    name,
    displayName: record.displayName || name,
    description: record.description,
    projectPath: record.projectPath ?? null,
    pluginName: record.pluginName,
    readonly,
    canEdit: !readonly,
    canDelete: !readonly,
    canToggle: record.source === "official",
    enabled,
    status: record.status ?? (enabled ? "available" : "disabled"),
    location: {
      path: record.nativePath,
      displayPath: record.displayPath,
    },
    skill: {
      path: record.nativePath,
      body: record.body,
      frontmatter: record.frontmatter,
    },
    content: record.body,
  }
}

export function projectProviderMcpRecord(record: ProviderMcpRecord): ToolingMcpItem {
  const readonly = record.source === "plugin" || record.source === "official"
  const enabled = record.enabled ?? !record.config.disabled

  return {
    id: createToolingItemId({
      kind: "mcp",
      provider: record.provider,
      source: record.source,
      scope: record.scope,
      identity: identityForRecord({
        source: record.source,
        scope: record.scope,
        name: record.name,
        projectPath: record.projectPath,
        pluginName: record.pluginName,
      }),
    }),
    kind: "mcp",
    provider: record.provider,
    source: record.source,
    scope: record.scope,
    name: record.name,
    displayName: record.displayName || record.name,
    projectPath: record.projectPath ?? null,
    pluginName: record.pluginName,
    readonly,
    canEdit: !readonly,
    canDelete: !readonly,
    canToggle: record.source === "official" || !readonly,
    enabled,
    status: record.status ?? (enabled ? "unknown" : "disabled"),
    location: {
      path: record.locationPath,
      displayPath: record.locationPath,
    },
    mcp: {
      transport: record.transport,
      config: record.config,
      tools: record.tools ?? [],
      needsAuth: record.needsAuth,
      authType: record.authType,
      nativeName: record.nativeName,
    },
  }
}
