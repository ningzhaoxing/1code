# Change: Add Tooling Management Core

## Why

1Code needs a single backend model for Skill and MCP management before adding Codex support. The existing Claude implementation mixed listing, filesystem writes, MCP config writes, and provider-specific rules inside tRPC routers, which made provider expansion and source isolation hard to reason about.

## What Changes

- Add a `ToolingCatalog` read layer for normalized Skill/MCP listing.
- Add a `ToolingStore` write layer for create/update/delete/toggle operations.
- Add a Claude `ProviderAdapter` implementation that owns Claude Skill and MCP filesystem/config details.
- Add a unified `tooling` tRPC router while keeping existing Skill/MCP APIs compatible.
- Delegate existing Claude Skill and MCP write paths to the new tooling layer.

## Impact

- Affected specs: tooling-skill-mcp
- Affected code:
  - `src/main/lib/tooling/**`
  - `src/main/lib/trpc/routers/tooling.ts`
  - `src/main/lib/trpc/routers/skills.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/claude-config.ts`
