import { access, cp, mkdir, readdir, readFile } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"

export type DefaultSkillInstallTarget =
  | "claude-user"
  | "claude-project"
  | "codex-user"
  | "codex-project"
  | "onecode-codex"

type DefaultSkillManifestEntry = {
  name: string
  source: string
  enabled?: boolean
  installOnProjectCreate?: boolean
  targets?: DefaultSkillInstallTarget[]
}

type DefaultSkillManifest = {
  skills?: DefaultSkillManifestEntry[]
}

export type SkillInstallResult = {
  skillName: string
  target: DefaultSkillInstallTarget
  targetPath: string
  ok: boolean
  error?: string
}

export type SyncDefaultProjectSkillsInput = {
  projectPath?: string | null
  manifestPath?: string
  appRoot?: string
  homeDir?: string
  codexHome?: string
}

export type SyncProjectInstalledSkillsInput = {
  sourceProjectPath: string
  worktreePath: string
}

const DEFAULT_SKILLS_MANIFEST_RELATIVE_PATH = join(
  "skills",
  "default-project-skills.json",
)

const DEFAULT_TARGETS: DefaultSkillInstallTarget[] = [
  "claude-project",
  "codex-project",
]

function getProcessResourcesPath(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
}

function getRootCandidates(appRoot?: string): string[] {
  const candidates = [
    appRoot,
    process.cwd(),
    getProcessResourcesPath(),
  ].filter((value): value is string => !!value && value.trim().length > 0)

  return [...new Set(candidates)]
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveReadablePath(
  pathOrRelativePath: string,
  appRoot?: string,
): Promise<string> {
  if (isAbsolute(pathOrRelativePath)) {
    return pathOrRelativePath
  }

  const candidates = getRootCandidates(appRoot).map((root) =>
    resolve(root, pathOrRelativePath),
  )

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return candidates[0] ?? resolve(pathOrRelativePath)
}

function assertSafeSkillName(name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes("..")) {
    throw new Error(`Invalid skill name: ${name}`)
  }
}

export function getOneCodeCodexHome(
  codexHome = process.env.CODEX_HOME,
  homeDir = homedir(),
): string {
  const normalized = codexHome?.trim()
  return normalized && normalized.length > 0
    ? normalized
    : join(homeDir, ".1code", "codex")
}

export function getSkillInstallTargetPath({
  skillName,
  target,
  projectPath,
  homeDir = homedir(),
  codexHome,
}: {
  skillName: string
  target: DefaultSkillInstallTarget
  projectPath?: string | null
  homeDir?: string
  codexHome?: string
}): string | null {
  assertSafeSkillName(skillName)

  switch (target) {
    case "claude-user":
      return join(homeDir, ".claude", "skills", skillName)
    case "claude-project":
      return projectPath ? join(projectPath, ".claude", "skills", skillName) : null
    case "codex-user":
      return join(homeDir, ".agents", "skills", skillName)
    case "codex-project":
      return projectPath ? join(projectPath, ".agents", "skills", skillName) : null
    case "onecode-codex":
      return join(getOneCodeCodexHome(codexHome, homeDir), "skills", skillName)
    default:
      return null
  }
}

async function readManifest(
  manifestPath: string,
  appRoot?: string,
): Promise<DefaultSkillManifest> {
  const resolvedManifestPath = await resolveReadablePath(manifestPath, appRoot)
  const raw = await readFile(resolvedManifestPath, "utf-8")
  return JSON.parse(raw) as DefaultSkillManifest
}

async function installSkillPackage({
  sourcePath,
  skillName,
  target,
  targetPath,
}: {
  sourcePath: string
  skillName: string
  target: DefaultSkillInstallTarget
  targetPath: string
}): Promise<SkillInstallResult> {
  try {
    await access(join(sourcePath, "SKILL.md"), constants.R_OK)
    await mkdir(dirname(targetPath), { recursive: true })
    await cp(sourcePath, targetPath, { recursive: true, force: true })

    return {
      skillName,
      target,
      targetPath,
      ok: true,
    }
  } catch (error) {
    return {
      skillName,
      target,
      targetPath,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function listInstalledSkillNames(skillsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const skillNames: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

      try {
        assertSafeSkillName(entry.name)
        await access(join(skillsDir, entry.name, "SKILL.md"), constants.R_OK)
        skillNames.push(entry.name)
      } catch {
        continue
      }
    }

    return skillNames.sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(
        `[project-skills] Failed to scan installed skills in ${skillsDir}:`,
        error instanceof Error ? error.message : error,
      )
    }
    return []
  }
}

export async function syncProjectInstalledSkillsToWorktree({
  sourceProjectPath,
  worktreePath,
}: SyncProjectInstalledSkillsInput): Promise<SkillInstallResult[]> {
  if (resolve(sourceProjectPath) === resolve(worktreePath)) {
    return []
  }

  const providers: Array<{
    target: Extract<DefaultSkillInstallTarget, "claude-project" | "codex-project">
    relativeSkillsDir: string
  }> = [
    {
      target: "claude-project",
      relativeSkillsDir: join(".claude", "skills"),
    },
    {
      target: "codex-project",
      relativeSkillsDir: join(".agents", "skills"),
    },
  ]

  const results: SkillInstallResult[] = []

  for (const provider of providers) {
    const sourceSkillsDir = join(sourceProjectPath, provider.relativeSkillsDir)
    const skillNames = await listInstalledSkillNames(sourceSkillsDir)

    for (const skillName of skillNames) {
      const targetPath = getSkillInstallTargetPath({
        skillName,
        target: provider.target,
        projectPath: worktreePath,
      })

      if (!targetPath) continue

      results.push(
        await installSkillPackage({
          sourcePath: join(sourceSkillsDir, skillName),
          skillName,
          target: provider.target,
          targetPath,
        }),
      )
    }
  }

  const failures = results.filter((result) => !result.ok)
  if (failures.length > 0) {
    console.warn("[project-skills] Some project skill syncs failed:", failures)
  }

  return results
}

export async function syncDefaultProjectSkills({
  projectPath,
  manifestPath = DEFAULT_SKILLS_MANIFEST_RELATIVE_PATH,
  appRoot,
  homeDir = homedir(),
  codexHome,
}: SyncDefaultProjectSkillsInput = {}): Promise<SkillInstallResult[]> {
  let manifest: DefaultSkillManifest

  try {
    manifest = await readManifest(manifestPath, appRoot)
  } catch (error) {
    console.warn(
      "[default-project-skills] Failed to read default skill manifest:",
      error instanceof Error ? error.message : error,
    )
    return []
  }

  const results: SkillInstallResult[] = []

  for (const skill of manifest.skills || []) {
    if (skill.enabled === false || skill.installOnProjectCreate === false) {
      continue
    }

    try {
      assertSafeSkillName(skill.name)
    } catch (error) {
      console.warn("[default-project-skills] Skipping invalid skill:", error)
      continue
    }

    const sourcePath = await resolveReadablePath(skill.source, appRoot)
    const targets = skill.targets && skill.targets.length > 0
      ? skill.targets
      : DEFAULT_TARGETS

    for (const target of targets) {
      const targetPath = getSkillInstallTargetPath({
        skillName: skill.name,
        target,
        projectPath,
        homeDir,
        codexHome,
      })

      if (!targetPath) continue

      results.push(
        await installSkillPackage({
          sourcePath,
          skillName: skill.name,
          target,
          targetPath,
        }),
      )
    }
  }

  const failures = results.filter((result) => !result.ok)
  if (failures.length > 0) {
    console.warn("[default-project-skills] Some skill installs failed:", failures)
  }

  return results
}
