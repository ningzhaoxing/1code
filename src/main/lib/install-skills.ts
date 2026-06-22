import { app } from "electron"
import { copyFileSync, existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"

/**
 * Skills bundled with the app that should be installed into the user's
 * ~/.claude/skills directory on startup. The record is written (overwritten)
 * on every launch so it stays current with the installed app version.
 *
 * Source layout:
 *   dev:      <appPath>/skills/<name>/SKILL.md   (app.getAppPath() = repo root)
 *   packaged: <resourcesPath>/skills/<name>/SKILL.md  (electron-builder extraResources)
 */
const BUNDLED_SKILLS = ["security-mining-record", "vulnerability-research"] as const

function resolveBundledSkillsRoot(): string {
  // In packaged builds the `skills` dir is shipped via electron-builder
  // extraResources (mapped to <resources>/skills). In dev it lives at the
  // repo root, which app.getAppPath() points to.
  return app.isPackaged
    ? join(process.resourcesPath, "skills")
    : join(app.getAppPath(), "skills")
}

/**
 * Copy bundled skills into ~/.claude/skills. Best-effort: any failure is
 * logged and swallowed so it can never block app startup.
 */
export function installBundledSkills(): void {
  try {
    const sourceRoot = resolveBundledSkillsRoot()
    const targetRoot = join(homedir(), ".claude", "skills")

    for (const skillName of BUNDLED_SKILLS) {
      try {
        const sourceFile = join(sourceRoot, skillName, "SKILL.md")
        if (!existsSync(sourceFile)) {
          console.warn(
            `[install-skills] Source SKILL.md not found, skipping: ${sourceFile}`,
          )
          continue
        }

        const targetFile = join(targetRoot, skillName, "SKILL.md")
        mkdirSync(dirname(targetFile), { recursive: true })
        // Overwrite to keep the skill in sync with the app version.
        copyFileSync(sourceFile, targetFile)
        console.log(`[install-skills] Installed skill: ${skillName}`)
      } catch (error) {
        // Per-skill failure must not abort the remaining skills or startup.
        console.error(
          `[install-skills] Failed to install skill "${skillName}":`,
          error,
        )
      }
    }
  } catch (error) {
    console.error("[install-skills] Failed to install bundled skills:", error)
  }
}
