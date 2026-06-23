## ADDED Requirements

### Requirement: Unified Tooling Catalog

The system SHALL expose a backend catalog that returns Skill and MCP items using a normalized model across provider, kind, source, scope, editability, enabled state, status, and location.

#### Scenario: List Claude Skill items

- **WHEN** the catalog is queried for Claude Skill items
- **THEN** it SHALL include 1Code Claude user-scope Skill items
- **AND** it SHALL include project Skill items when a project path is provided
- **AND** it SHALL include enabled plugin Skill items as read-only items.

#### Scenario: List Claude MCP items

- **WHEN** the catalog is queried for Claude MCP items
- **THEN** it SHALL include user-scope MCP servers
- **AND** it SHALL include project MCP servers when a project path is provided
- **AND** it SHALL include enabled plugin MCP servers as read-only items.

### Requirement: Unified Tooling Store

The system SHALL expose a backend store that routes Skill and MCP mutations through provider adapters instead of direct router-level filesystem/config writes.

#### Scenario: Create Claude Skill

- **WHEN** a caller creates a Claude user or project Skill through the store
- **THEN** the store SHALL delegate to the Claude provider adapter
- **AND** the adapter SHALL write the Skill to the correct Claude user or project location.

#### Scenario: Mutate Claude MCP server

- **WHEN** a caller creates, updates, deletes, or toggles a Claude user or project MCP server through the store
- **THEN** the store SHALL delegate to the Claude provider adapter
- **AND** the adapter SHALL write the server config to the correct Claude user or project config source.

### Requirement: Compatibility Router Delegation

Existing Skill and Claude MCP tRPC APIs SHALL remain compatible while delegating Claude writes to the new tooling store.

#### Scenario: Existing Skill API creates Claude user Skill

- **WHEN** the existing Skill API creates a Claude user Skill
- **THEN** it SHALL call the tooling store
- **AND** it SHALL return the legacy response shape expected by existing callers.

#### Scenario: Existing Claude MCP API creates project MCP

- **WHEN** the existing Claude MCP API creates a project-scoped MCP server
- **THEN** it SHALL call the tooling store
- **AND** the project-scoped server SHALL be written to the project `.mcp.json`.

### Requirement: Official Tooling Source

The system SHALL model official Skill and MCP entries as read-only tooling items whose enabled state is stored in 1Code preferences rather than provider-native user configuration.

#### Scenario: List official Claude Skill

- **WHEN** a Claude user-scope Skill name matches the official content manifest
- **THEN** the catalog SHALL return it with `source: "official"`
- **AND** it SHALL be read-only and non-deletable
- **AND** it SHALL be toggleable.

#### Scenario: Toggle official item

- **WHEN** a caller toggles an official Skill or MCP item
- **THEN** the store SHALL write the enabled state to official preferences
- **AND** it SHALL NOT edit the Skill body or provider-native MCP config.

#### Scenario: List official Claude MCP

- **WHEN** the catalog lists Claude MCP servers
- **THEN** enabled official MCP servers from the official content manifest SHALL be included as read-only toggleable items
- **AND** they SHALL NOT require entries in `~/.1code/.claude/.claude.json`.

#### Scenario: Probe official Claude MCP status for settings

- **WHEN** the MCP settings page builds its official Claude MCP group
- **THEN** enabled official MCP servers SHALL be probed through the same status/tool discovery path as other Claude MCP servers
- **AND** disabled official MCP servers SHALL remain visible as disabled without attempting a connection probe.

#### Scenario: Reject invalid official MCP manifest entries

- **WHEN** an official MCP manifest entry does not define a runnable `command` or `url`
- **THEN** the official content manifest loader SHALL reject the entry
- **AND** the invalid official MCP SHALL NOT be exposed through the catalog or runtime injection.

#### Scenario: Apply packaged official manifest to shared registry

- **WHEN** 1Code loads packaged `official-content.json` during startup
- **THEN** the shared official registry used by Catalog, Store, and runtime preparation SHALL be updated from that manifest
- **AND** future official Skill or MCP entries added to the packaged manifest SHALL not require duplicating the same data in code.

#### Scenario: Package Chrome DevTools official MCP

- **WHEN** 1Code ships its packaged official content manifest
- **THEN** the manifest SHALL include the Chrome DevTools MCP as a default-enabled Claude official MCP entry
- **AND** the entry SHALL define a runnable command-based config.

#### Scenario: Runtime excludes disabled official content

- **WHEN** an official Skill or MCP is disabled in preferences
- **THEN** Claude runtime context preparation SHALL exclude that item from runtime-visible Skill/MCP injection
- **AND** the physical official Skill file or manifest entry MAY remain present for upgrade reconciliation.

#### Scenario: Upgrade reconciles official Skill content

- **WHEN** 1Code starts with a new official content manifest
- **THEN** official Claude Skills SHALL be installed or updated from the packaged manifest into the 1Code Claude user-scope directory
- **AND** previously installed official Skills removed from the manifest SHALL be removed only when installed-state proves 1Code owns the unchanged target directory
- **AND** user enablement preferences SHALL remain stored separately from the installed content.
