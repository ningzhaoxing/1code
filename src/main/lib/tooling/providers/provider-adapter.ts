import type {
  CreateMcpInput,
  CreateSkillInput,
  ProviderListQuery,
  ProviderRuntimeContext,
  ProviderRuntimeInput,
  ToolingItemRef,
  ToolingProvider,
  UpdateMcpPatch,
  UpdateSkillPatch,
} from "../types"
import type { ProviderMcpRecord, ProviderSkillRecord } from "./provider-model"

export interface ProviderAdapter {
  provider: ToolingProvider

  listSkills(query: ProviderListQuery): Promise<ProviderSkillRecord[]>
  createSkill(input: CreateSkillInput): Promise<ProviderSkillRecord>
  updateSkill(itemRef: ToolingItemRef, patch: UpdateSkillPatch): Promise<void>
  deleteSkill(itemRef: ToolingItemRef): Promise<void>

  listMcpServers(query: ProviderListQuery): Promise<ProviderMcpRecord[]>
  createMcpServer(input: CreateMcpInput): Promise<ProviderMcpRecord>
  updateMcpServer(itemRef: ToolingItemRef, patch: UpdateMcpPatch): Promise<void>
  deleteMcpServer(itemRef: ToolingItemRef): Promise<void>
  setMcpEnabled(itemRef: ToolingItemRef, enabled: boolean): Promise<void>

  buildRuntimeContext?(
    input: ProviderRuntimeInput,
  ): Promise<ProviderRuntimeContext>
  refreshCaches?(): Promise<void>
}
