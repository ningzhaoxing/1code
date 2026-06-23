## ADDED Requirements

### Requirement: Claude User-Scope Isolation

The system SHALL store and read 1Code-managed Claude user-scope Skill/MCP assets under `~/.1code/.claude` instead of the user's standalone Claude Code `~/.claude*` paths.

#### Scenario: User Skill creation

- **WHEN** a user creates a Claude user-scope Skill from 1Code
- **THEN** the Skill SHALL be written under `~/.1code/.claude/skills`
- **AND** the Skill SHALL NOT be written under `~/.claude/skills`

#### Scenario: User MCP creation

- **WHEN** a user creates or updates a Claude global MCP server from 1Code
- **THEN** the MCP config SHALL be written to `~/.1code/.claude/.claude.json`
- **AND** the MCP config SHALL NOT be written to the standalone Claude Code `~/.claude.json`

#### Scenario: Claude runtime projection

- **WHEN** 1Code starts a Claude runtime session
- **THEN** user-scope Claude assets SHALL be projected from `~/.1code/.claude` into the session `CLAUDE_CONFIG_DIR`
- **AND** project-level assets SHALL continue to be resolved from the project directory.

### Requirement: Merge Priority Preservation

The system SHALL preserve the existing Claude runtime merge priority while changing only the user-scope source path.

#### Scenario: Same MCP server name exists in user and project scopes

- **WHEN** a project-level MCP server and a user-level MCP server share the same name
- **THEN** the project-level MCP server SHALL override the user-level server for that project.
