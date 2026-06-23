import * as fs from "fs/promises"
import * as path from "path"
import { isDirentDirectory } from "../../../fs/dirent"
import { createToolingItemId } from "../../ids"
import {
  officialRegistry as defaultOfficialRegistry,
  type OfficialRegistry,
} from "../../official-registry"
import {
  officialPreferencesStore as defaultOfficialPreferencesStore,
  type OfficialPreferencesStore,
} from "../../preferences"
import { parseSkillMd } from "../../skills/skill-md"

export type ProjectClaudeUserSkillsInput = {
  sourceDir: string
  targetDir: string
  registry?: OfficialRegistry
  preferences?: OfficialPreferencesStore
}

async function shouldProjectSkill(input: {
  skillMdPath: string
  fallbackName: string
  registry: OfficialRegistry
  preferences: OfficialPreferencesStore
}): Promise<boolean> {
  try {
    const parsed = parseSkillMd(await fs.readFile(input.skillMdPath, "utf-8"))
    const skillName = parsed.name || input.fallbackName
    const officialEntry = input.registry.getSkill("claude", skillName)
    if (!officialEntry) return true

    const itemId = createToolingItemId({
      kind: "skill",
      provider: "claude",
      source: "official",
      scope: "global",
      identity: officialEntry.name,
    })
    return input.preferences.getEnabled(itemId, officialEntry.defaultEnabled)
  } catch {
    return false
  }
}

export async function projectClaudeUserSkillsForRuntime(
  input: ProjectClaudeUserSkillsInput,
): Promise<boolean> {
  const registry = input.registry || defaultOfficialRegistry
  const preferences = input.preferences || defaultOfficialPreferencesStore
  const symlinkType = process.platform === "win32" ? "junction" : "dir"

  const sourceExists = await fs
    .stat(input.sourceDir)
    .then((stat) => stat.isDirectory())
    .catch(() => false)
  if (!sourceExists) {
    await fs.rm(input.targetDir, { recursive: true, force: true })
    return false
  }

  await fs.rm(input.targetDir, { recursive: true, force: true })
  await fs.mkdir(input.targetDir, { recursive: true })

  const entries = await fs.readdir(input.sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const isDirectory = await isDirentDirectory(input.sourceDir, entry)
    if (!isDirectory) continue
    if (
      entry.name.includes("..") ||
      entry.name.includes("/") ||
      entry.name.includes("\\")
    ) {
      continue
    }

    const sourceSkillDir = path.join(input.sourceDir, entry.name)
    const skillMdPath = path.join(sourceSkillDir, "SKILL.md")
    const shouldProject = await shouldProjectSkill({
      skillMdPath,
      fallbackName: entry.name,
      registry,
      preferences,
    })
    if (!shouldProject) continue

    await fs.symlink(sourceSkillDir, path.join(input.targetDir, entry.name), symlinkType)
  }

  return true
}
