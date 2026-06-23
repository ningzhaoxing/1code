import * as os from "os"
import * as path from "path"
import { createDefaultToolingAdapterMap } from "./adapters"
import { getOneCodeClaudeSkillsDir } from "./claude-home"
import { ToolingError } from "./errors"
import { parseToolingItemId } from "./ids"
import {
  officialRegistry as defaultOfficialRegistry,
  type OfficialRegistry,
} from "./official-registry"
import {
  officialPreferencesStore as defaultOfficialPreferencesStore,
  type OfficialPreferencesStore,
} from "./preferences"
import type { ClaudeAdapter } from "./providers/claude/claude-adapter"
import type { ProviderAdapter } from "./providers/provider-adapter"
import type { ProviderMcpRecord, ProviderSkillRecord } from "./providers/provider-model"
import { normalizeSkillName } from "./skills/skill-md"
import type {
  CreateMcpInput,
  CreateSkillInput,
  ToolingItemRef,
  ToolingProvider,
  UpdateMcpPatch,
  UpdateSkillPatch,
} from "./types"

export class ToolingStore {
  constructor(
    private readonly adapters: Map<ToolingProvider, ProviderAdapter> =
      createDefaultToolingAdapterMap(),
    private readonly officialPreferences: OfficialPreferencesStore =
      defaultOfficialPreferencesStore,
    private readonly officialRegistry: OfficialRegistry = defaultOfficialRegistry,
  ) {}

  async createSkill(input: CreateSkillInput): Promise<ProviderSkillRecord> {
    const provider = input.provider ?? "claude"
    if (
      provider === "claude" &&
      input.source === "user" &&
      this.officialRegistry.isOfficialSkillName("claude", normalizeSkillName(input.name))
    ) {
      throw new ToolingError(
        "NAME_CONFLICT",
        `Skill "${normalizeSkillName(input.name)}" is a reserved official skill name`,
      )
    }

    return this.requireProvider(provider).createSkill(input)
  }

  updateSkill(itemId: string, patch: UpdateSkillPatch): Promise<void> {
    return this.requireProviderFromItemId(itemId).updateSkill({ id: itemId }, patch)
  }

  deleteSkill(itemId: string): Promise<void> {
    return this.requireProviderFromItemId(itemId).deleteSkill({ id: itemId })
  }

  updateClaudeSkillByPath(input: {
    skillPath: string
    projectPath?: string | null
    patch: UpdateSkillPatch
  }): Promise<void> {
    this.assertNotOfficialClaudeUserSkillPath(input.skillPath)
    return this.requireClaudeProvider().updateSkillByPath(input)
  }

  deleteClaudeSkillByPath(input: {
    skillPath: string
    projectPath?: string | null
  }): Promise<void> {
    this.assertNotOfficialClaudeUserSkillPath(input.skillPath)
    return this.requireClaudeProvider().deleteSkillByPath(input)
  }

  createMcpServer(input: CreateMcpInput): Promise<ProviderMcpRecord> {
    return this.requireProvider(input.provider ?? "claude").createMcpServer(input)
  }

  updateMcpServer(itemId: string, patch: UpdateMcpPatch): Promise<void> {
    return this.requireProviderFromItemId(itemId).updateMcpServer({ id: itemId }, patch)
  }

  deleteMcpServer(itemId: string): Promise<void> {
    return this.requireProviderFromItemId(itemId).deleteMcpServer({ id: itemId })
  }

  async setEnabled(itemId: string, enabled: boolean): Promise<void> {
    const parsed = parseToolingItemId(itemId)
    if (!parsed) {
      throw new ToolingError("INVALID_PATH", "Invalid tooling item id")
    }

    if (parsed.source === "official") {
      this.assertKnownOfficialItem(parsed)
      await this.officialPreferences.setEnabled(itemId, enabled)
      return
    }

    if (parsed.kind === "mcp") {
      return this.requireProvider(parsed.provider).setMcpEnabled({ id: itemId }, enabled)
    }

    throw new ToolingError("UNSUPPORTED_OPERATION", "Only official skills can be toggled")
  }

  setMcpEnabled(itemId: string, enabled: boolean): Promise<void> {
    return this.setEnabled(itemId, enabled)
  }

  claudeMcpItemRefFromScope(input: {
    scope: "global" | "project"
    name: string
    projectPath?: string | null
  }): ToolingItemRef {
    return this.requireClaudeProvider().itemRefFromMcpScope(input)
  }

  private requireProvider(provider: ToolingProvider): ProviderAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      throw new ToolingError("INVALID_PROVIDER", `Provider "${provider}" is not supported`)
    }
    return adapter
  }

  private requireProviderFromItemId(itemId: string): ProviderAdapter {
    const parsed = parseToolingItemId(itemId)
    if (!parsed) {
      throw new ToolingError("INVALID_PATH", "Invalid tooling item id")
    }
    return this.requireProvider(parsed.provider)
  }

  private requireClaudeProvider(): ClaudeAdapter {
    return this.requireProvider("claude") as ClaudeAdapter
  }

  private assertKnownOfficialItem(parsed: NonNullable<ReturnType<typeof parseToolingItemId>>): void {
    if (parsed.provider === "claude" && parsed.kind === "skill") {
      if (this.officialRegistry.getSkill("claude", parsed.identity)) return
    }
    if (parsed.provider === "claude" && parsed.kind === "mcp") {
      if (this.officialRegistry.getMcpServer("claude", parsed.identity)) return
    }
    throw new ToolingError("ITEM_NOT_FOUND", "Official tooling item not found")
  }

  private assertNotOfficialClaudeUserSkillPath(skillPath: string): void {
    const absolutePath = skillPath.startsWith("~")
      ? path.join(os.homedir(), skillPath.slice(1))
      : skillPath
    const userRoot = getOneCodeClaudeSkillsDir()
    if (!absolutePath.startsWith(userRoot + path.sep)) return

    const skillName = path.basename(path.dirname(absolutePath))
    if (this.officialRegistry.isOfficialSkillName("claude", skillName)) {
      throw new ToolingError("READONLY_ITEM", "This skill source is readonly")
    }
  }
}

export const toolingStore = new ToolingStore()
