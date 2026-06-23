import { createDefaultToolingAdapters } from "./adapters"
import {
  projectProviderMcpRecord,
  projectProviderSkillRecord,
} from "./catalog-projection"
import type { McpServerConfig } from "../claude-config"
import { ToolingError } from "./errors"
import { createToolingItemId } from "./ids"
import { parseToolingItemId } from "./ids"
import {
  officialRegistry as defaultOfficialRegistry,
  type OfficialRegistry,
} from "./official-registry"
import {
  officialPreferencesStore as defaultOfficialPreferencesStore,
  type OfficialPreferencesStore,
} from "./preferences"
import type {
  ProviderListQuery,
  ToolingCatalogQuery,
  ToolingCatalogResult,
  ToolingItem,
  ToolingKind,
  ToolingProvider,
} from "./types"
import type { ProviderAdapter } from "./providers/provider-adapter"
import type { ProviderMcpRecord, ProviderSkillRecord } from "./providers/provider-model"

function cloneMcpConfig(config: McpServerConfig): McpServerConfig {
  return JSON.parse(JSON.stringify(config))
}

function detectTransport(config: McpServerConfig): "stdio" | "http" | "sse" | "unknown" {
  if (config.type === "sse") return "sse"
  if (config.url) return "http"
  if (config.command) return "stdio"
  return "unknown"
}

function mcpNeedsAuth(config: McpServerConfig): boolean {
  const headers = config.headers as Record<string, string> | undefined
  return (
    (config.authType === "oauth" || config.authType === "bearer") &&
    !headers?.Authorization &&
    !config._oauth?.accessToken
  )
}

function shouldIncludeProvider(
  queryProvider: ToolingProvider | "all" | undefined,
  adapterProvider: ToolingProvider,
): boolean {
  return !queryProvider || queryProvider === "all" || queryProvider === adapterProvider
}

function shouldIncludeKind(
  queryKind: ToolingKind | "all" | undefined,
  itemKind: ToolingKind,
): boolean {
  return !queryKind || queryKind === "all" || queryKind === itemKind
}

function sortToolingItems(items: ToolingItem[]): ToolingItem[] {
  return [...items].sort((a, b) => {
    const provider = a.provider.localeCompare(b.provider)
    if (provider !== 0) return provider
    const kind = a.kind.localeCompare(b.kind)
    if (kind !== 0) return kind
    const source = a.source.localeCompare(b.source)
    if (source !== 0) return source
    return a.name.localeCompare(b.name)
  })
}

export class ToolingCatalog {
  constructor(
    private readonly adapters: ProviderAdapter[] = createDefaultToolingAdapters(),
    private readonly officialRegistry: OfficialRegistry = defaultOfficialRegistry,
    private readonly officialPreferences: OfficialPreferencesStore =
      defaultOfficialPreferencesStore,
  ) {}

  async list(query: ToolingCatalogQuery = {}): Promise<ToolingCatalogResult> {
    const items: ToolingItem[] = []
    const diagnostics: ToolingCatalogResult["diagnostics"] = []
    const selectedAdapters = this.adapters.filter((adapter) =>
      shouldIncludeProvider(query.provider, adapter.provider),
    )

    if (selectedAdapters.length === 0 && query.provider && query.provider !== "all") {
      throw new ToolingError("INVALID_PROVIDER", `Provider "${query.provider}" is not supported`)
    }

    const providerQuery: ProviderListQuery = query
    for (const adapter of selectedAdapters) {
      if (shouldIncludeKind(query.kind, "skill")) {
        items.push(
          ...(await this.projectSkillRecords(await adapter.listSkills(providerQuery))),
        )
      }
      if (shouldIncludeKind(query.kind, "mcp")) {
        const mcpRecords = await adapter.listMcpServers(providerQuery)
        items.push(
          ...mcpRecords.map(projectProviderMcpRecord),
          ...(await this.projectOfficialMcpRecords(adapter.provider, mcpRecords)),
        )
      }
    }

    return {
      items: sortToolingItems(items),
      diagnostics,
    }
  }

  async get(
    itemId: string,
    query: Omit<ToolingCatalogQuery, "provider" | "kind"> = {},
  ): Promise<ToolingItem> {
    const parsed = parseToolingItemId(itemId)
    if (!parsed) {
      throw new ToolingError("INVALID_PATH", "Invalid tooling item id")
    }

    const result = await this.list({
      ...query,
      provider: parsed.provider,
      kind: parsed.kind,
      projectPath: query.projectPath ?? this.projectPathFromIdentity(parsed),
    })
    const item = result.items.find((candidate) => candidate.id === itemId)
    if (!item) {
      throw new ToolingError("ITEM_NOT_FOUND", "Tooling item not found")
    }
    return item
  }

  private projectPathFromIdentity(parsed: NonNullable<ReturnType<typeof parseToolingItemId>>): string | null {
    if (parsed.scope !== "project") return null
    try {
      const identity = JSON.parse(parsed.identity)
      return typeof identity?.projectPath === "string" ? identity.projectPath : null
    } catch {
      return null
    }
  }

  private async projectSkillRecords(records: ProviderSkillRecord[]): Promise<ToolingItem[]> {
    return Promise.all(
      records.map(async (record) => {
        if (record.provider !== "claude" || record.source !== "user") {
          return projectProviderSkillRecord(record)
        }

        const name = record.frontmatter?.name || record.nativeName
        const officialEntry = this.officialRegistry.getSkill("claude", name)
        if (!officialEntry) {
          return projectProviderSkillRecord(record)
        }

        const itemId = createToolingItemId({
          kind: "skill",
          provider: "claude",
          source: "official",
          scope: "global",
          identity: name,
        })
        const enabled = await this.officialPreferences.getEnabled(
          itemId,
          officialEntry.defaultEnabled,
        )

        return projectProviderSkillRecord({
          ...record,
          source: "official",
          scope: "global",
          displayName: officialEntry.displayName,
          description: officialEntry.description || record.description,
          enabled,
          status: enabled ? "available" : "disabled",
        })
      }),
    )
  }

  private async projectOfficialMcpRecords(
    provider: ToolingProvider,
    providerRecords: ProviderMcpRecord[],
  ): Promise<ToolingItem[]> {
    if (provider !== "claude") return []

    const globalUserNames = new Set(
      providerRecords
        .filter((record) => record.source === "user" && record.scope === "global")
        .map((record) => record.name),
    )

    return Promise.all(
      this.officialRegistry.listMcpServers("claude").flatMap((entry) => {
        if (globalUserNames.has(entry.name)) return []

        return [
          (async () => {
            const itemId = createToolingItemId({
              kind: "mcp",
              provider: "claude",
              source: "official",
              scope: "global",
              identity: entry.name,
            })
            const enabled = await this.officialPreferences.getEnabled(
              itemId,
              entry.defaultEnabled,
            )
            const config = cloneMcpConfig(entry.config)
            const needsAuth = enabled ? mcpNeedsAuth(config) : false

            return projectProviderMcpRecord({
              provider: "claude",
              source: "official",
              scope: "global",
              name: entry.name,
              nativeName: entry.nativeName || entry.name,
              displayName: entry.displayName,
              projectPath: null,
              locationPath: "official-content.json",
              config,
              transport: detectTransport(config),
              tools: [],
              needsAuth,
              authType: config.authType,
              enabled,
              status: enabled ? (needsAuth ? "needs-auth" : "unknown") : "disabled",
            })
          })(),
        ]
      }),
    )
  }
}

export const toolingCatalog = new ToolingCatalog()
