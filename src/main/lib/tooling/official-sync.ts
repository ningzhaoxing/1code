import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { isDirentDirectory } from "../fs/dirent"
import { getOneCodeClaudeSkillsDir } from "./claude-home"
import { createToolingItemId } from "./ids"
import {
  officialInstalledStateStore,
  type OfficialInstalledStateStore,
} from "./official-installed-state"
import {
  officialRegistry,
  type OfficialRegistry,
  type OfficialSkillEntry,
} from "./official-registry"

export type OfficialSyncAction =
  | "installed"
  | "updated"
  | "adopted"
  | "skipped-conflict"
  | "skipped-modified"
  | "missing-source"
  | "removed"
  | "failed"

export type OfficialSkillSyncResult = {
  itemId: string
  name: string
  action: OfficialSyncAction
  targetPath: string
  ok: boolean
  error?: string
}

export type SyncOfficialClaudeSkillsInput = {
  registry?: OfficialRegistry
  installedState?: OfficialInstalledStateStore
  sourceRoot: string
  targetRoot?: string
  allowAdoptExistingOfficialContent?: boolean
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function fingerprintDirectory(dirPath: string): Promise<string> {
  const hash = createHash("sha256")

  async function walk(currentPath: string, relativePath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const childPath = path.join(currentPath, entry.name)
      const childRelativePath = path.join(relativePath, entry.name)
      const isDirectory = await isDirentDirectory(currentPath, entry)

      if (isDirectory) {
        hash.update(`dir:${childRelativePath}\n`)
        await walk(childPath, childRelativePath)
        continue
      }

      if (!entry.isFile()) continue
      hash.update(`file:${childRelativePath}\n`)
      hash.update(await fs.readFile(childPath))
      hash.update("\n")
    }
  }

  await walk(dirPath, "")
  return hash.digest("hex")
}

function getOfficialSkillItemId(entry: OfficialSkillEntry): string {
  return createToolingItemId({
    kind: "skill",
    provider: "claude",
    source: "official",
    scope: "global",
    identity: entry.name,
  })
}

function resolveSourceDir(sourceRoot: string, entry: OfficialSkillEntry): string {
  return path.isAbsolute(entry.sourceDir)
    ? entry.sourceDir
    : path.join(sourceRoot, entry.sourceDir)
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return !!relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
}

async function copySkillDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(targetDir), { recursive: true })
  await fs.cp(sourceDir, targetDir, { recursive: true, force: true })
}

async function syncOfficialSkill(input: {
  entry: OfficialSkillEntry
  sourceRoot: string
  targetRoot: string
  installedState: OfficialInstalledStateStore
  allowAdoptExistingOfficialContent: boolean
}): Promise<OfficialSkillSyncResult> {
  const itemId = getOfficialSkillItemId(input.entry)
  const sourceDir = resolveSourceDir(input.sourceRoot, input.entry)
  const targetDir = path.join(input.targetRoot, input.entry.name)

  try {
    const sourceSkillMd = path.join(sourceDir, "SKILL.md")
    if (!(await pathExists(sourceSkillMd))) {
      return {
        itemId,
        name: input.entry.name,
        action: "missing-source",
        targetPath: targetDir,
        ok: false,
        error: `Missing SKILL.md: ${sourceSkillMd}`,
      }
    }

    const sourceFingerprint = await fingerprintDirectory(sourceDir)
    const targetExists = await pathExists(targetDir)
    const stateEntry = await input.installedState.get(itemId)
    let action: OfficialSyncAction = targetExists ? "updated" : "installed"

    if (targetExists) {
      const targetFingerprint = await fingerprintDirectory(targetDir)

      if (!stateEntry) {
        if (!input.allowAdoptExistingOfficialContent) {
          return {
            itemId,
            name: input.entry.name,
            action: "skipped-conflict",
            targetPath: targetDir,
            ok: false,
          }
        }

        if (targetFingerprint !== sourceFingerprint) {
          return {
            itemId,
            name: input.entry.name,
            action: "skipped-conflict",
            targetPath: targetDir,
            ok: false,
          }
        }

        action = "adopted"
      } else if (targetFingerprint !== stateEntry.fingerprint) {
        return {
          itemId,
          name: input.entry.name,
          action: "skipped-modified",
          targetPath: targetDir,
          ok: false,
        }
      }
    }

    if (action !== "adopted") {
      await copySkillDirectory(sourceDir, targetDir)
    }

    const now = new Date().toISOString()
    await input.installedState.set(itemId, {
      itemId,
      kind: "skill",
      provider: "claude",
      source: "official",
      name: input.entry.name,
      targetPath: targetDir,
      fingerprint: sourceFingerprint,
      version: input.entry.version,
      installedAt: now,
      updatedAt: now,
    })

    return {
      itemId,
      name: input.entry.name,
      action,
      targetPath: targetDir,
      ok: true,
    }
  } catch (error) {
    return {
      itemId,
      name: input.entry.name,
      action: "failed",
      targetPath: targetDir,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function syncOfficialClaudeSkills(
  input: SyncOfficialClaudeSkillsInput,
): Promise<OfficialSkillSyncResult[]> {
  const registry = input.registry || officialRegistry
  const installedState = input.installedState || officialInstalledStateStore
  const targetRoot = input.targetRoot || getOneCodeClaudeSkillsDir()
  const allowAdoptExistingOfficialContent =
    input.allowAdoptExistingOfficialContent ?? false

  const results: OfficialSkillSyncResult[] = []
  const currentEntries = registry.listSkills("claude")
  const currentItemIds = new Set(currentEntries.map(getOfficialSkillItemId))

  for (const entry of currentEntries) {
    results.push(
      await syncOfficialSkill({
        entry,
        sourceRoot: input.sourceRoot,
        targetRoot,
        installedState,
        allowAdoptExistingOfficialContent,
      }),
    )
  }

  const installedDoc = await installedState.read()
  for (const [itemId, entry] of Object.entries(installedDoc.items || {})) {
    if (currentItemIds.has(itemId)) continue
    if (entry.kind !== "skill" || entry.provider !== "claude") continue
    if (!isPathInside(targetRoot, entry.targetPath)) continue

    try {
      const targetExists = await pathExists(entry.targetPath)
      if (targetExists) {
        const targetFingerprint = await fingerprintDirectory(entry.targetPath)
        if (targetFingerprint !== entry.fingerprint) {
          results.push({
            itemId,
            name: entry.name,
            action: "skipped-modified",
            targetPath: entry.targetPath,
            ok: false,
          })
          continue
        }

        await fs.rm(entry.targetPath, { recursive: true, force: true })
      }

      await installedState.remove(itemId)
      results.push({
        itemId,
        name: entry.name,
        action: "removed",
        targetPath: entry.targetPath,
        ok: true,
      })
    } catch (error) {
      results.push({
        itemId,
        name: entry.name,
        action: "failed",
        targetPath: entry.targetPath,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
