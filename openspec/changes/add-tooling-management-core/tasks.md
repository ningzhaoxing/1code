## 1. Implementation

- [x] 1.1 Add shared Tooling item types, ids, and errors.
- [x] 1.2 Implement `ToolingCatalog` read aggregation.
- [x] 1.3 Implement `ToolingStore` write routing.
- [x] 1.4 Implement Claude Skill store and adapter methods.
- [x] 1.5 Implement Claude MCP store and adapter methods.
- [x] 1.6 Add unified `tooling` tRPC router.
- [x] 1.7 Delegate existing Claude Skill/MCP write APIs to the new store.
- [x] 1.8 Implement official registry and preferences for Claude Skill/MCP.
- [x] 1.9 Classify official Claude Skills and list official Claude MCP from manifest.
- [x] 1.10 Route official enable/disable through tooling preferences.
- [x] 1.11 Exclude disabled official Claude Skill/MCP from runtime injection.
- [x] 1.12 Load packaged `official-content.json` for official Skill/MCP manifest data.
- [x] 1.13 Track `official-installed-state.json` for official Skill ownership and safe upgrades.
- [x] 1.14 Sync official Claude Skills on startup without overwriting user-owned or locally modified directories.
- [x] 1.15 Remove discontinued official Claude Skills only when installed-state proves unchanged 1Code ownership.
- [x] 1.16 Refresh Claude runtime Skill projection on each request so official toggles affect cached subChats.
- [x] 1.17 Split provider records from Catalog DTO projection so `ProviderAdapter` does not return UI `ToolingItem` objects.
- [x] 1.18 Implement `tooling.get`, `tooling.refreshStatus`, `tooling.startMcpAuth`, and documented `tooling.createMcp/updateMcp/deleteMcp` API surface.
- [x] 1.19 Wire Claude chat runtime preparation through `ClaudeAdapter.buildRuntimeContext()` for config dir projection, setting sources, and official MCP enablement.
- [x] 1.20 Validate official content manifests so official MCP entries must define a runnable command or URL before they can reach Catalog/runtime.
- [x] 1.21 Apply packaged `official-content.json` to the shared `officialRegistry` on startup so Catalog, Store, and runtime use the same manifest.
- [x] 1.22 Probe enabled official MCP servers for the settings page while preserving official display names and metadata.
- [x] 1.23 Add Chrome DevTools MCP as the first packaged official Claude MCP manifest entry.

## 2. Verification

- [x] 2.1 Add focused tests for unified Claude Skill creation/listing.
- [x] 2.2 Add focused tests for Claude project MCP create/update/delete.
- [x] 2.3 Add focused tests for official source classification, toggling, and runtime filtering.
- [x] 2.4 Add focused tests for official manifest loading, installed-state sync, safe upgrades, and discontinued official Skill removal.
- [x] 2.5 Add focused test for refreshing runtime Skill projection after symlink cache is populated.
- [x] 2.6 Add focused tests proving provider records stay UI-free and official classification happens in Catalog.
- [x] 2.7 Add focused router tests for `tooling.get`, `tooling.refreshStatus`, `tooling.startMcpAuth` validation, and documented MCP CRUD aliases.
- [x] 2.8 Add focused test for `ClaudeAdapter.buildRuntimeContext()` returning runtime config dir, setting sources, skill projection, and enabled official MCP servers.
- [x] 2.9 Add focused test that rejects official MCP manifest entries without a command or URL.
- [x] 2.10 Add focused test that applying packaged official content updates the shared registry used by Catalog/runtime.
- [x] 2.11 Add focused test that official MCP settings projection probes enabled servers and skips disabled servers.
- [x] 2.12 Add focused test that packaged official content includes the Chrome DevTools MCP entry.
- [x] 2.13 Run whitespace diff validation.
- [x] 2.14 Run focused Bun tests.
- [ ] 2.15 Run OpenSpec strict validation. Blocked: `openspec` CLI is not available in this repo environment.
- [ ] 2.16 Run repository TypeScript check. Blocked: `npm run ts:check` references missing `tsgo`; fallback `tsc --noEmit` is blocked by pre-existing repository-wide type errors. Changed-path fallback filtering for `src/main/lib/tooling`, `src/main/lib/install-skills.ts`, `src/main/lib/trpc/routers/tooling.ts`, and `src/main/lib/trpc/routers/claude.ts` now reports no errors.
