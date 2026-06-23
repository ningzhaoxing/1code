import type { ProviderAdapter } from "./providers/provider-adapter"
import { ClaudeAdapter } from "./providers/claude/claude-adapter"
import type { ToolingProvider } from "./types"

export function createDefaultToolingAdapters(): ProviderAdapter[] {
  return [new ClaudeAdapter()]
}

export function createDefaultToolingAdapterMap(): Map<ToolingProvider, ProviderAdapter> {
  return new Map(createDefaultToolingAdapters().map((adapter) => [adapter.provider, adapter]))
}

