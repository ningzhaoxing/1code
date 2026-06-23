# Change: Isolate Claude User-Scope Tooling Under 1Code Home

## Why

1Code previously reused the local Claude Code user-scope directories and MCP config. That made 1Code-managed Skill/MCP state visible to the user's standalone Claude Code installation, and vice versa.

## What Changes

- Move Claude user-scope Skill/MCP storage to `~/.1code/.claude`.
- Keep project-level Skill/MCP paths and merge priority unchanged.
- Project runtime continues to use per-session `CLAUDE_CONFIG_DIR`, but user-scope assets are projected from `~/.1code/.claude`.
- Keep real `~/.claude*` as an auth compatibility source only, not as the default Skill/MCP source.

## Impact

- Affected specs: tooling-skill-mcp
- Affected code:
  - `src/main/lib/tooling/claude-home.ts`
  - `src/main/lib/trpc/routers/skills.ts`
  - `src/main/lib/claude-config.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - Claude commands, agents, plugins, settings path helpers
