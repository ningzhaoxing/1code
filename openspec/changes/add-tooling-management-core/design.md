# Tooling Management Core Design

## Context

The first implementation target is Claude. Codex is intentionally left as a later adapter so the unified model can be validated against the existing Claude behavior first.

## Decisions

- Files and config remain the source of truth. The first phase does not add a database index for all Skill/MCP items.
- The three abstractions are three isolated domain models, not one shared `ToolingItem` domain object:
  - `ToolingCatalog` owns the read-side projection model for normalized listing, filtering, diagnostics, and UI/API DTO output.
  - `ToolingStore` owns the write-side command model for mutation routing, editable-source checks, and official enablement preferences.
  - `ProviderAdapter` owns the provider-native model for Claude/Codex storage records, config formats, and runtime preparation.
- Shared types are limited to primitives, boundary DTOs, stable IDs, and port contracts. `ToolingItem` is only a Catalog/API read DTO; Store must operate on commands or target refs, and ProviderAdapter must return provider-native records or runtime plans.
- Model files should stay isolated by bounded context: Catalog entities must not be used as Store mutation input, Store commands must not leak into ProviderAdapter implementations, and Provider records must not be returned directly to UI/API callers.
- Official manifest, preferences, and installed-state files are 1Code management support data. Catalog may classify with them, Store may persist toggles through them, and ProviderAdapter may read effective enablement during runtime preparation, but they are not the core entity model of any one layer.
- Existing tRPC routers stay as compatibility APIs, but Claude writes delegate into `ToolingStore`.
- Claude project MCP creation writes to project `.mcp.json`; legacy private project MCP entries remain readable and editable.

## Non-Goals

- No full Codex adapter in this change.
- No frontend settings-page migration to the new `tooling` router in this change.
- No automatic migration from the user's standalone Claude Code directories.
