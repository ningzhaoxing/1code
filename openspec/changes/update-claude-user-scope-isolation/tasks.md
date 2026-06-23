## 1. Implementation

- [x] 1.1 Add shared Claude user-scope path resolver for `~/.1code/.claude`.
- [x] 1.2 Switch Claude user Skill reads/writes to `~/.1code/.claude/skills`.
- [x] 1.3 Switch Claude user MCP config reads/writes to `~/.1code/.claude/.claude.json`.
- [x] 1.4 Switch runtime `CLAUDE_CONFIG_DIR` asset projection to source from `~/.1code/.claude`.
- [x] 1.5 Align related Claude user assets: commands, agents, plugins, settings, bundled skill install.
- [x] 1.6 Update visible settings labels for the new 1Code user-scope paths.
- [x] 1.7 Add focused regression tests for user-scope path resolution and Skill creation.

## 2. Verification

- [x] 2.1 Run focused Bun tests.
- [x] 2.2 Run whitespace diff validation.
- [ ] 2.3 Run OpenSpec strict validation. Blocked: `openspec` CLI is not available in this repo environment.
- [ ] 2.4 Run repository TypeScript check. Blocked: `npm run ts:check` references missing `tsgo`; fallback `tsc --noEmit` reports pre-existing unrelated project errors.
