import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, test } from "node:test"
import {
  getOneCodeClaudeConfigPath,
  getOneCodeClaudeDirConfigPath,
  getOneCodeClaudeHome,
  getOneCodeClaudeMcpPath,
  getOneCodeClaudeSkillsDir,
} from "./claude-home"

describe("OneCode Claude user-scope paths", () => {
  test("resolves all Claude user-scope paths under ~/.1code/.claude", () => {
    const homeDir = "/home/user"
    const claudeHome = join(homeDir, ".1code", ".claude")

    assert.equal(getOneCodeClaudeHome(homeDir), claudeHome)
    assert.equal(getOneCodeClaudeSkillsDir(homeDir), join(claudeHome, "skills"))
    assert.equal(getOneCodeClaudeConfigPath(homeDir), join(claudeHome, ".claude.json"))
    assert.equal(getOneCodeClaudeDirConfigPath(homeDir), join(claudeHome, ".claude.json"))
    assert.equal(getOneCodeClaudeMcpPath(homeDir), join(claudeHome, "mcp.json"))
  })
})
