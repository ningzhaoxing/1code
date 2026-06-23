import * as fs from "node:fs/promises"
import type { McpServerConfig } from "../claude-config"
import type { ToolingProvider } from "./types"

export type OfficialSkillEntry = {
  id: string
  name: string
  displayName?: string
  description?: string
  providers: ToolingProvider[]
  sourceDir: string
  defaultEnabled: boolean
  scope: "global"
  version?: string
}

export type OfficialMcpEntry = {
  id: string
  name: string
  nativeName?: string
  displayName?: string
  description?: string
  providers: ToolingProvider[]
  defaultEnabled: boolean
  config: McpServerConfig
  version?: string
}

export type OfficialContentManifest = {
  version: number
  skills?: OfficialSkillEntry[]
  mcpServers?: OfficialMcpEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function requireNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
}

function validateProviders(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} providers must be a non-empty array`)
  }

  for (const provider of value) {
    if (provider !== "claude" && provider !== "codex") {
      throw new Error(`${label} provider "${String(provider)}" is not supported`)
    }
  }
}

function validateOfficialSkillEntry(entry: unknown, index: number): void {
  if (!isRecord(entry)) {
    throw new Error(`official skill at index ${index} must be an object`)
  }

  const label = `official skill "${String(entry.name || entry.id || index)}"`
  requireNonEmptyString(entry.id, `${label} id`)
  requireNonEmptyString(entry.name, `${label} name`)
  requireNonEmptyString(entry.sourceDir, `${label} sourceDir`)
  validateProviders(entry.providers, label)

  if (entry.defaultEnabled !== true && entry.defaultEnabled !== false) {
    throw new Error(`${label} defaultEnabled must be boolean`)
  }
  if (entry.scope !== "global") {
    throw new Error(`${label} scope must be "global"`)
  }
}

function validateOfficialMcpEntry(entry: unknown, index: number): void {
  if (!isRecord(entry)) {
    throw new Error(`official MCP server at index ${index} must be an object`)
  }

  const label = `official MCP server "${String(entry.name || entry.id || index)}"`
  requireNonEmptyString(entry.id, `${label} id`)
  requireNonEmptyString(entry.name, `${label} name`)
  validateProviders(entry.providers, label)

  if (entry.defaultEnabled !== true && entry.defaultEnabled !== false) {
    throw new Error(`${label} defaultEnabled must be boolean`)
  }
  if (!isRecord(entry.config)) {
    throw new Error(`${label} config must be an object`)
  }

  const hasCommand =
    typeof entry.config.command === "string" && entry.config.command.trim().length > 0
  const hasUrl =
    typeof entry.config.url === "string" && entry.config.url.trim().length > 0
  if (!hasCommand && !hasUrl) {
    throw new Error(`${label} config must define a command or url`)
  }
}

export function validateOfficialContentManifest(
  manifest: unknown,
): OfficialContentManifest {
  if (!isRecord(manifest)) {
    throw new Error("official content manifest must be an object")
  }
  if (typeof manifest.version !== "number") {
    throw new Error("official content manifest version must be a number")
  }
  if (manifest.skills !== undefined && !Array.isArray(manifest.skills)) {
    throw new Error("official content manifest skills must be an array")
  }
  if (manifest.mcpServers !== undefined && !Array.isArray(manifest.mcpServers)) {
    throw new Error("official content manifest mcpServers must be an array")
  }

  manifest.skills?.forEach(validateOfficialSkillEntry)
  manifest.mcpServers?.forEach(validateOfficialMcpEntry)

  return manifest as OfficialContentManifest
}

export async function loadOfficialContentManifest(
  manifestPath: string,
): Promise<OfficialContentManifest> {
  return validateOfficialContentManifest(
    JSON.parse(await fs.readFile(manifestPath, "utf-8")),
  )
}

const DEFAULT_OFFICIAL_CONTENT: OfficialContentManifest = {
  version: 1,
  skills: [
    {
      id: "security-mining-record",
      name: "security-mining-record",
      displayName: "security-mining-record",
      providers: ["claude"],
      sourceDir: "security-mining-record",
      defaultEnabled: true,
      scope: "global",
    },
    {
      id: "vulnerability-research",
      name: "vulnerability-research",
      displayName: "vulnerability-research",
      providers: ["claude"],
      sourceDir: "vulnerability-research",
      defaultEnabled: true,
      scope: "global",
    },
  ],
  mcpServers: [
    {
      id: "chrome-devtools",
      name: "chrome-devtools",
      nativeName: "chrome-devtools",
      displayName: "Chrome DevTools",
      description:
        "Inspect, debug, and automate Chrome through the Chrome DevTools MCP server.",
      providers: ["claude"],
      defaultEnabled: true,
      config: {
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"],
        env: {
          CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "true",
        },
      },
    },
  ],
}

function supportsProvider(
  entry: { providers: ToolingProvider[] },
  provider: ToolingProvider,
): boolean {
  return entry.providers.includes(provider)
}

export class OfficialRegistry {
  private currentManifest: OfficialContentManifest

  constructor(manifest: OfficialContentManifest = DEFAULT_OFFICIAL_CONTENT) {
    this.currentManifest = validateOfficialContentManifest(manifest)
  }

  replaceManifest(manifest: OfficialContentManifest): void {
    this.currentManifest = validateOfficialContentManifest(manifest)
  }

  reset(): void {
    this.currentManifest = validateOfficialContentManifest(DEFAULT_OFFICIAL_CONTENT)
  }

  listSkills(provider: ToolingProvider): OfficialSkillEntry[] {
    return (this.currentManifest.skills || []).filter((entry) =>
      supportsProvider(entry, provider),
    )
  }

  listMcpServers(provider: ToolingProvider): OfficialMcpEntry[] {
    return (this.currentManifest.mcpServers || []).filter((entry) =>
      supportsProvider(entry, provider),
    )
  }

  getSkill(provider: ToolingProvider, name: string): OfficialSkillEntry | undefined {
    return this.listSkills(provider).find((entry) => entry.name === name)
  }

  getMcpServer(provider: ToolingProvider, name: string): OfficialMcpEntry | undefined {
    return this.listMcpServers(provider).find((entry) => entry.name === name)
  }

  isOfficialSkillName(provider: ToolingProvider, name: string): boolean {
    return !!this.getSkill(provider, name)
  }
}

export const officialRegistry = new OfficialRegistry()

export async function loadAndApplyOfficialContentManifest(
  manifestPath: string,
): Promise<OfficialContentManifest> {
  const manifest = await loadOfficialContentManifest(manifestPath)
  officialRegistry.replaceManifest(manifest)
  return manifest
}
