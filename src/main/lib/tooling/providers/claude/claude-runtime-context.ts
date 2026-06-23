import * as fs from "fs/promises"
import * as path from "path"
import { isDirentDirectory } from "../../../fs/dirent"
import { createToolingItemId } from "../../ids"
import {
  officialRegistry as defaultOfficialRegistry,
  type OfficialSkillEntry,
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

function isSafeSkillDirectoryName(name: string): boolean {
  return (
    !!name &&
    !name.includes("..") &&
    !name.includes("/") &&
    !name.includes("\\")
  )
}

function officialSkillItemId(entry: OfficialSkillEntry): string {
  return createToolingItemId({
    kind: "skill",
    provider: "claude",
    source: "official",
    scope: "global",
    identity: entry.name,
  })
}

async function officialSkillEnabled(
  entry: OfficialSkillEntry,
  preferences: OfficialPreferencesStore,
): Promise<boolean> {
  return preferences.getEnabled(officialSkillItemId(entry), entry.defaultEnabled)
}

function resolveOfficialSkillSourceDir(sourceRoot: string, entry: OfficialSkillEntry): string {
  return path.isAbsolute(entry.sourceDir)
    ? entry.sourceDir
    : path.join(sourceRoot, entry.sourceDir)
}

async function hasSkillMd(skillDir: string): Promise<boolean> {
  return fs
    .stat(path.join(skillDir, "SKILL.md"))
    .then((stat) => stat.isFile())
    .catch(() => false)
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

    return officialSkillEnabled(officialEntry, input.preferences)
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
    if (!isSafeSkillDirectoryName(entry.name)) continue

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

export async function projectOfficialClaudeSkillsIntoProject(
  input: ProjectClaudeUserSkillsInput,
): Promise<boolean> {
  const registry = input.registry || defaultOfficialRegistry
  const preferences = input.preferences || defaultOfficialPreferencesStore
  const symlinkType = process.platform === "win32" ? "junction" : "dir"
  let complete = true

  await fs.mkdir(input.targetDir, { recursive: true })

  for (const entry of registry.listSkills("claude")) {
    if (!isSafeSkillDirectoryName(entry.name)) {
      complete = false
      continue
    }

    const targetSkillDir = path.join(input.targetDir, entry.name)
    const enabled = await officialSkillEnabled(entry, preferences)
    if (!enabled) {
      await fs.rm(targetSkillDir, { recursive: true, force: true })
      continue
    }

    const sourceSkillDir = resolveOfficialSkillSourceDir(input.sourceDir, entry)
    if (!(await hasSkillMd(sourceSkillDir))) {
      await fs.rm(targetSkillDir, { recursive: true, force: true })
      complete = false
      continue
    }

    await fs.rm(targetSkillDir, { recursive: true, force: true })
    await fs.symlink(sourceSkillDir, targetSkillDir, symlinkType)
  }

  return complete
}
