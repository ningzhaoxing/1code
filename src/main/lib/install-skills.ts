import { app } from "electron"
import { join } from "path"
import {
  loadAndApplyOfficialContentManifest,
  officialRegistry,
  type OfficialRegistry,
} from "./tooling/official-registry"
import { syncOfficialClaudeSkills } from "./tooling/official-sync"

/**
 * Skills bundled with the app that should be installed into the user's
 * 1Code Claude skills directory on startup. The record is written (overwritten)
 * on every launch so it stays current with the installed app version.
 *
 * Source layout:
 *   dev:      <appPath>/skills/<name>/SKILL.md   (app.getAppPath() = repo root)
 *   packaged: <resourcesPath>/skills/<name>/SKILL.md  (electron-builder extraResources)
 */
function resolveBundledSkillsRoot(): string {
  // In packaged builds the `skills` dir is shipped via electron-builder
  // extraResources (mapped to <resources>/skills). In dev it lives at the
  // repo root, which app.getAppPath() points to.
  return app.isPackaged
    ? join(process.resourcesPath, "skills")
    : join(app.getAppPath(), "skills")
}

/**
 * Sync bundled official skills into ~/.1code/.claude/skills. Best-effort: any
 * failure is logged and swallowed so it can never block app startup.
 */
export async function installBundledSkills(): Promise<void> {
  try {
    const sourceRoot = resolveBundledSkillsRoot()
    let registry: OfficialRegistry | undefined

    try {
      await loadAndApplyOfficialContentManifest(join(sourceRoot, "official-content.json"))
      registry = officialRegistry
    } catch (error) {
      console.warn(
        "[install-skills] Failed to load official-content.json, using fallback manifest:",
        error instanceof Error ? error.message : error,
      )
    }

    const results = await syncOfficialClaudeSkills({
      sourceRoot,
      registry,
      allowAdoptExistingOfficialContent: true,
    })

    for (const result of results) {
      if (result.ok) {
        console.log(
          `[install-skills] ${result.action} official skill: ${result.name}`,
        )
      } else {
        console.warn(
          `[install-skills] ${result.action} official skill "${result.name}": ${result.error || result.targetPath}`,
        )
      }
    }
  } catch (error) {
    console.error("[install-skills] Failed to install bundled skills:", error)
  }
}
