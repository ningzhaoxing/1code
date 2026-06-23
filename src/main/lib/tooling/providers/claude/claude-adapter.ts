import * as path from "node:path"
import { ToolingError } from "../../errors"
import type { OfficialRegistry } from "../../official-registry"
import type { OfficialPreferencesStore } from "../../preferences"
import type {
  CreateMcpInput,
  CreateSkillInput,
  ProviderListQuery,
  ProviderRuntimeContext,
  ProviderRuntimeInput,
  ToolingItemRef,
  UpdateMcpPatch,
  UpdateSkillPatch,
} from "../../types"
import type { ProviderAdapter } from "../provider-adapter"
import type { ProviderMcpRecord, ProviderSkillRecord } from "../provider-model"
import { ClaudeMcpStore } from "./claude-mcp-store"
import {
  prepareClaudeConfigAssets,
  type ClaudeConfigAssetSources,
} from "./claude-config-assets"
import { ClaudeSkillStore } from "./claude-skill-store"

type ClaudeAdapterRuntimeOptions = {
  registry?: OfficialRegistry
  preferences?: OfficialPreferencesStore
  assetSources?: ClaudeConfigAssetSources
  userDataDir?: string
  symlinkCache?: Set<string>
}

export class ClaudeAdapter implements ProviderAdapter {
  provider = "claude" as const

  private readonly skillStore: ClaudeSkillStore
  private readonly mcpStore: ClaudeMcpStore
  private readonly runtimeOptions: ClaudeAdapterRuntimeOptions

  constructor(
    skillStore?: ClaudeSkillStore,
    mcpStore?: ClaudeMcpStore,
    runtimeOptions: ClaudeAdapterRuntimeOptions = {},
  ) {
    this.runtimeOptions = runtimeOptions
    this.skillStore =
      skillStore ||
      new ClaudeSkillStore(runtimeOptions.registry, runtimeOptions.preferences)
    this.mcpStore =
      mcpStore ||
      new ClaudeMcpStore(runtimeOptions.registry, runtimeOptions.preferences)
  }

  listSkills(query: ProviderListQuery): Promise<ProviderSkillRecord[]> {
    return this.skillStore.listSkills(query)
  }

  createSkill(input: CreateSkillInput): Promise<ProviderSkillRecord> {
    return this.skillStore.createSkill(input)
  }

  updateSkill(itemRef: ToolingItemRef, patch: UpdateSkillPatch): Promise<void> {
    return this.skillStore.updateSkill(itemRef, patch)
  }

  deleteSkill(itemRef: ToolingItemRef): Promise<void> {
    return this.skillStore.deleteSkill(itemRef)
  }

  updateSkillByPath(input: {
    skillPath: string
    projectPath?: string | null
    patch: UpdateSkillPatch
  }): Promise<void> {
    return this.skillStore.updateSkillByPath(input)
  }

  deleteSkillByPath(input: {
    skillPath: string
    projectPath?: string | null
  }): Promise<void> {
    return this.skillStore.deleteSkillByPath(input)
  }

  listMcpServers(query: ProviderListQuery): Promise<ProviderMcpRecord[]> {
    return this.mcpStore.listMcpServers(query)
  }

  createMcpServer(input: CreateMcpInput): Promise<ProviderMcpRecord> {
    return this.mcpStore.createMcpServer(input)
  }

  updateMcpServer(itemRef: ToolingItemRef, patch: UpdateMcpPatch): Promise<void> {
    return this.mcpStore.updateMcpServer(itemRef, patch)
  }

  deleteMcpServer(itemRef: ToolingItemRef): Promise<void> {
    return this.mcpStore.deleteMcpServer(itemRef)
  }

  setMcpEnabled(itemRef: ToolingItemRef, enabled: boolean): Promise<void> {
    return this.mcpStore.setMcpEnabled(itemRef, enabled)
  }

  itemRefFromMcpScope(input: {
    scope: "global" | "project"
    name: string
    projectPath?: string | null
  }): ToolingItemRef {
    return this.mcpStore.itemRefFromScope(input.scope, input.name, input.projectPath)
  }

  async buildRuntimeContext(input: ProviderRuntimeInput): Promise<ProviderRuntimeContext> {
    const sessionKey = input.isUsingOllama ? input.chatId : input.subChatId
    if (!sessionKey) {
      throw new ToolingError("INVALID_PATH", "Claude runtime session key is required")
    }

    const userDataDir = input.userDataDir || this.runtimeOptions.userDataDir
    if (!userDataDir) {
      throw new ToolingError("INVALID_PATH", "Claude runtime userDataDir is required")
    }

    const isolatedConfigDir = path.join(userDataDir, "claude-sessions", sessionKey)
    const symlinkCache =
      input.symlinkCache || this.runtimeOptions.symlinkCache || new Set<string>()

    await prepareClaudeConfigAssets({
      isolatedConfigDir,
      cacheKey: sessionKey,
      symlinkCache,
      sources: this.runtimeOptions.assetSources,
      registry: this.runtimeOptions.registry,
      preferences: this.runtimeOptions.preferences,
    })

    const mcpServers = await this.mcpStore.getEnabledOfficialMcpServers()

    return {
      env: {
        CLAUDE_CONFIG_DIR: isolatedConfigDir,
      },
      sdkOptions: {
        // Keep the current Claude router behavior: project sources avoid the
        // SDK stream-json hang observed with user-level settings/plugins.
        settingSources: ["project"],
        ...(Object.keys(mcpServers).length > 0 && { mcpServers }),
      },
    }
  }
}
