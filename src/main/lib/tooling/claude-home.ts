import { homedir } from "node:os"
import { join } from "node:path"

function getDefaultHomeDir(): string {
  const envHome = process.env.HOME?.trim()
  return envHome && envHome.length > 0 ? envHome : homedir()
}

export function getOneCodeClaudeHome(homeDir = getDefaultHomeDir()): string {
  return join(homeDir, ".1code", ".claude")
}

export function getOneCodeClaudeSkillsDir(homeDir = getDefaultHomeDir()): string {
  return join(getOneCodeClaudeHome(homeDir), "skills")
}

export function getOneCodeClaudeCommandsDir(homeDir = getDefaultHomeDir()): string {
  return join(getOneCodeClaudeHome(homeDir), "commands")
}

export function getOneCodeClaudeAgentsDir(homeDir = getDefaultHomeDir()): string {
  return join(getOneCodeClaudeHome(homeDir), "agents")
}

export function getOneCodeClaudePluginsDir(homeDir = getDefaultHomeDir()): string {
  return join(getOneCodeClaudeHome(homeDir), "plugins")
}

export function getOneCodeClaudeSettingsPath(homeDir = getDefaultHomeDir()): string {
  return join(getOneCodeClaudeHome(homeDir), "settings.json")
}

export function getOneCodeClaudeConfigPath(homeDir = getDefaultHomeDir()): string {
  return join(getOneCodeClaudeHome(homeDir), ".claude.json")
}

export function getOneCodeClaudeDirConfigPath(homeDir = getDefaultHomeDir()): string {
  return getOneCodeClaudeConfigPath(homeDir)
}

export function getOneCodeClaudeMcpPath(homeDir = getDefaultHomeDir()): string {
  return join(getOneCodeClaudeHome(homeDir), "mcp.json")
}
