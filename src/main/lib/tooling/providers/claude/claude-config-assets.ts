import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  getOneCodeClaudeAgentsDir,
  getOneCodeClaudeCommandsDir,
  getOneCodeClaudeConfigPath,
  getOneCodeClaudePluginsDir,
  getOneCodeClaudeSettingsPath,
  getOneCodeClaudeSkillsDir,
} from "../../claude-home"
import type { OfficialRegistry } from "../../official-registry"
import type { OfficialPreferencesStore } from "../../preferences"
import {
  projectClaudeUserSkillsForRuntime,
  projectOfficialClaudeSkillsIntoProject,
} from "./claude-runtime-context"

export type ClaudeConfigAssetSources = {
  skillsDir: string
  commandsDir: string
  agentsDir: string
  pluginsDir: string
  settingsPath: string
  claudeJsonPath: string
}

export type PrepareClaudeConfigAssetsInput = {
  isolatedConfigDir: string
  projectSkillsDir?: string
  cacheKey: string
  symlinkCache: Set<string>
  sources?: ClaudeConfigAssetSources
  registry?: OfficialRegistry
  preferences?: OfficialPreferencesStore
}

export type PrepareClaudeConfigAssetsResult = {
  complete: boolean
  hadErrors: boolean
}

function getDefaultSources(): ClaudeConfigAssetSources {
  return {
    skillsDir: getOneCodeClaudeSkillsDir(),
    commandsDir: getOneCodeClaudeCommandsDir(),
    agentsDir: getOneCodeClaudeAgentsDir(),
    pluginsDir: getOneCodeClaudePluginsDir(),
    settingsPath: getOneCodeClaudeSettingsPath(),
    claudeJsonPath: getOneCodeClaudeConfigPath(),
  }
}

async function ensureSymlink(input: {
  sourcePath: string
  targetPath: string
  label: string
  targetKind: "dir" | "file"
  symlinkType: "dir" | "junction"
}): Promise<PrepareClaudeConfigAssetsResult> {
  try {
    const sourceExists = await fs
      .stat(input.sourcePath)
      .then(() => true)
      .catch(() => false)
    const targetExists = await fs
      .lstat(input.targetPath)
      .then(() => true)
      .catch(() => false)

    if (sourceExists && !targetExists) {
      if (input.targetKind === "dir") {
        await fs.symlink(input.sourcePath, input.targetPath, input.symlinkType)
      } else {
        await fs.symlink(input.sourcePath, input.targetPath)
      }
    }

    return {
      // Keep rechecking on next request when source is not created yet.
      complete: sourceExists || targetExists,
      hadErrors: false,
    }
  } catch (error) {
    console.warn(
      `[claude] Failed to symlink ${input.label}:`,
      error instanceof Error ? error.message : error,
    )
    return { complete: false, hadErrors: true }
  }
}

export async function prepareClaudeConfigAssets(
  input: PrepareClaudeConfigAssetsInput,
): Promise<PrepareClaudeConfigAssetsResult> {
  const sources = input.sources || getDefaultSources()
  const symlinkType = process.platform === "win32" ? "junction" : "dir"
  let complete = true
  let hadErrors = false

  await fs.mkdir(input.isolatedConfigDir, { recursive: true })

  try {
    const skillsProjected = await projectClaudeUserSkillsForRuntime({
      sourceDir: sources.skillsDir,
      targetDir: path.join(input.isolatedConfigDir, "skills"),
      registry: input.registry,
      preferences: input.preferences,
    })
    if (!skillsProjected) complete = false
  } catch (error) {
    complete = false
    hadErrors = true
    console.warn(
      "[claude] Failed to project skills directory:",
      error instanceof Error ? error.message : error,
    )
  }

  if (input.projectSkillsDir) {
    try {
      const projectSkillsProjected = await projectOfficialClaudeSkillsIntoProject({
        sourceDir: sources.skillsDir,
        targetDir: input.projectSkillsDir,
        registry: input.registry,
        preferences: input.preferences,
      })
      if (!projectSkillsProjected) complete = false
    } catch (error) {
      complete = false
      hadErrors = true
      console.warn(
        "[claude] Failed to project official skills into project directory:",
        error instanceof Error ? error.message : error,
      )
    }
  }

  if (!input.symlinkCache.has(input.cacheKey)) {
    const staticAssets: Array<{
      sourcePath: string
      targetPath: string
      label: string
      targetKind: "dir" | "file"
    }> = [
      {
        sourcePath: sources.commandsDir,
        targetPath: path.join(input.isolatedConfigDir, "commands"),
        label: "commands directory",
        targetKind: "dir",
      },
      {
        sourcePath: sources.agentsDir,
        targetPath: path.join(input.isolatedConfigDir, "agents"),
        label: "agents directory",
        targetKind: "dir",
      },
      {
        sourcePath: sources.pluginsDir,
        targetPath: path.join(input.isolatedConfigDir, "plugins"),
        label: "plugins directory",
        targetKind: "dir",
      },
      {
        sourcePath: sources.settingsPath,
        targetPath: path.join(input.isolatedConfigDir, "settings.json"),
        label: "settings.json",
        targetKind: "file",
      },
      {
        sourcePath: sources.claudeJsonPath,
        targetPath: path.join(input.isolatedConfigDir, ".claude.json"),
        label: ".claude.json",
        targetKind: "file",
      },
    ]

    for (const asset of staticAssets) {
      const result = await ensureSymlink({ ...asset, symlinkType })
      if (!result.complete) complete = false
      if (result.hadErrors) hadErrors = true
    }

    if (complete) {
      input.symlinkCache.add(input.cacheKey)
    } else if (hadErrors) {
      console.warn("[claude] Symlink setup incomplete, will retry on next request")
    }
  }

  return { complete, hadErrors }
}
