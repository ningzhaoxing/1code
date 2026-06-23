import type { ToolingKind, ToolingProvider, ToolingScope, ToolingSource } from "./types"

export type ParsedToolingItemId = {
  kind: ToolingKind
  provider: ToolingProvider
  source: ToolingSource
  scope: ToolingScope
  identity: string
}

function encodePart(value: string): string {
  return encodeURIComponent(value)
}

function decodePart(value: string): string {
  return decodeURIComponent(value)
}

export function createToolingItemId(input: ParsedToolingItemId): string {
  return [
    input.kind,
    input.provider,
    input.source,
    input.scope,
    encodePart(input.identity),
  ].join(":")
}

export function parseToolingItemId(id: string): ParsedToolingItemId | null {
  const parts = id.split(":")
  if (parts.length !== 5) return null
  const [kind, provider, source, scope, identity] = parts
  if (kind !== "skill" && kind !== "mcp") return null
  if (provider !== "claude" && provider !== "codex") return null
  if (
    source !== "official" &&
    source !== "user" &&
    source !== "project" &&
    source !== "plugin"
  ) {
    return null
  }
  if (scope !== "global" && scope !== "project" && scope !== "plugin") {
    return null
  }
  return {
    kind,
    provider,
    source,
    scope,
    identity: decodePart(identity),
  }
}
