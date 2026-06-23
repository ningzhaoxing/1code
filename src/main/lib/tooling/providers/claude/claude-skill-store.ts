import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { isDirentDirectory } from "../../../fs/dirent"
import {
  discoverInstalledPlugins,
  getPluginComponentPaths,
} from "../../../plugins"
import { getEnabledPlugins } from "../../../trpc/routers/claude-settings"
import { getOneCodeClaudeSkillsDir } from "../../claude-home"
import { ToolingError } from "../../errors"
import { parseToolingItemId } from "../../ids"
import type { OfficialRegistry } from "../../official-registry"
import type { OfficialPreferencesStore } from "../../preferences"
import { generateSkillMd, normalizeSkillName, parseSkillMd } from "../../skills/skill-md"
import type { ProviderSkillRecord } from "../provider-model"
import type {
  CreateSkillInput,
  ProviderListQuery,
  ToolingItemRef,
  UpdateSkillPatch,
} from "../../types"

function parseJsonIdentity(identity: string): Record<string, string> {
  try {
    const parsed = JSON.parse(identity)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

type ClaudeSkillSource = "official" | "user" | "project" | "plugin"

function displayPathFor(skillMdPath: string, source: ClaudeSkillSource, basePath?: string): string {
  if (source === "project" && basePath) {
    return path.relative(basePath, skillMdPath)
  }

  const homeDir = os.homedir()
  return skillMdPath.startsWith(homeDir)
    ? "~" + skillMdPath.slice(homeDir.length)
    : skillMdPath
}

function createSkillRecord(input: {
  name: string
  description: string
  source: ClaudeSkillSource
  skillMdPath: string
  displayPath: string
  content?: string
  projectPath?: string | null
  pluginName?: string
  enabled?: boolean
  displayName?: string
}): ProviderSkillRecord {
  const scope =
    input.source === "project"
      ? "project"
      : input.source === "plugin"
        ? "plugin"
        : "global"
  const enabled = input.enabled ?? true

  return {
    provider: "claude",
    source: input.source,
    scope,
    nativeName: input.name,
    displayName: input.displayName || input.name,
    description: input.description,
    projectPath: input.projectPath ?? null,
    pluginName: input.pluginName,
    nativePath: input.skillMdPath,
    displayPath: input.displayPath,
    body: input.content,
    frontmatter: {
      name: input.name,
      description: input.description,
    },
    enabled,
    status: enabled ? "available" : "disabled",
  }
}

async function scanSkillsDirectory(input: {
  dir: string
  source: ClaudeSkillSource
  basePath?: string
  projectPath?: string | null
  pluginName?: string
  includeContent?: boolean
}): Promise<ProviderSkillRecord[]> {
  const skills: ProviderSkillRecord[] = []

  try {
    await fs.access(input.dir)
  } catch {
    return skills
  }

  try {
    const entries = await fs.readdir(input.dir, { withFileTypes: true })
    for (const entry of entries) {
      const isDir = await isDirentDirectory(input.dir, entry)
      if (!isDir) continue
      if (
        entry.name.includes("..") ||
        entry.name.includes("/") ||
        entry.name.includes("\\")
      ) {
        console.warn(`[tooling:skills] Skipping invalid directory name: ${entry.name}`)
        continue
      }

      const skillMdPath = path.join(input.dir, entry.name, "SKILL.md")
      try {
        await fs.access(skillMdPath)
        const rawContent = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(rawContent)
        const parsedName = parsed.name || entry.name
        const record = createSkillRecord({
          name: parsedName,
          description: parsed.description || "",
          source: input.source,
          skillMdPath,
          displayPath: displayPathFor(skillMdPath, input.source, input.basePath),
          content: input.includeContent ? parsed.content : undefined,
          projectPath: input.projectPath,
          pluginName: input.pluginName,
        })
        skills.push(
          record,
        )
      } catch {
        // Not a complete skill directory.
      }
    }
  } catch (error) {
    console.error(`[tooling:skills] Failed to scan directory ${input.dir}:`, error)
  }

  return skills
}

export class ClaudeSkillStore {
  constructor(
    _officialRegistry?: OfficialRegistry,
    _officialPreferences?: OfficialPreferencesStore,
  ) {}

  async listSkills(query: ProviderListQuery): Promise<ProviderSkillRecord[]> {
    const promises: Array<Promise<ProviderSkillRecord[]>> = [
      scanSkillsDirectory({
        dir: getOneCodeClaudeSkillsDir(),
        source: "user",
        includeContent: query.includeContent,
      }),
    ]

    if (query.projectPath) {
      promises.push(
        scanSkillsDirectory({
          dir: path.join(query.projectPath, ".claude", "skills"),
          source: "project",
          basePath: query.projectPath,
          projectPath: query.projectPath,
          includeContent: query.includeContent,
        }),
      )
    }

    const [enabledPluginSources, installedPlugins] = await Promise.all([
      getEnabledPlugins(),
      discoverInstalledPlugins(),
    ])
    const enabledPlugins = installedPlugins.filter((plugin) =>
      enabledPluginSources.includes(plugin.source),
    )
    promises.push(
      ...enabledPlugins.map(async (plugin) => {
        const paths = getPluginComponentPaths(plugin)
        return scanSkillsDirectory({
          dir: paths.skills,
          source: "plugin",
          pluginName: plugin.source,
          includeContent: query.includeContent,
        })
      }),
    )

    return (await Promise.all(promises)).flat()
  }

  async createSkill(input: CreateSkillInput): Promise<ProviderSkillRecord> {
    const safeName = normalizeSkillName(input.name)
    const source = input.source
    const targetRoot =
      source === "project"
        ? this.requireProjectSkillsDir(input.projectPath)
        : getOneCodeClaudeSkillsDir()
    const skillDir = path.join(targetRoot, safeName)
    const skillMdPath = path.join(skillDir, "SKILL.md")

    try {
      await fs.access(skillMdPath)
      throw new ToolingError("NAME_CONFLICT", `Skill "${safeName}" already exists`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }

    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(
      skillMdPath,
      generateSkillMd({
        name: safeName,
        description: input.description,
        content: input.content,
      }),
      "utf-8",
    )

    return createSkillRecord({
      name: safeName,
      description: input.description,
      source,
      skillMdPath,
      displayPath: displayPathFor(skillMdPath, source, input.projectPath ?? undefined),
      content: input.content,
      projectPath: input.projectPath ?? null,
    })
  }

  async updateSkill(itemRef: ToolingItemRef, patch: UpdateSkillPatch): Promise<void> {
    const skillMdPath = this.resolveEditableSkillPath(itemRef)
    await fs.access(skillMdPath)
    await fs.writeFile(
      skillMdPath,
      generateSkillMd({
        name: patch.name,
        description: patch.description,
        content: patch.content,
      }),
      "utf-8",
    )
  }

  async deleteSkill(itemRef: ToolingItemRef): Promise<void> {
    const skillMdPath = this.resolveEditableSkillPath(itemRef)
    const skillDir = path.dirname(skillMdPath)
    await fs.access(skillDir)
    await fs.rm(skillDir, { recursive: true })
  }

  async updateSkillByPath(input: {
    skillPath: string
    projectPath?: string | null
    patch: UpdateSkillPatch
  }): Promise<void> {
    const skillMdPath = this.resolveLegacyEditableSkillPath({
      skillPath: input.skillPath,
      projectPath: input.projectPath,
    })
    await fs.access(skillMdPath)
    await fs.writeFile(
      skillMdPath,
      generateSkillMd({
        name: input.patch.name,
        description: input.patch.description,
        content: input.patch.content,
      }),
      "utf-8",
    )
  }

  async deleteSkillByPath(input: {
    skillPath: string
    projectPath?: string | null
  }): Promise<void> {
    const skillMdPath = this.resolveLegacyEditableSkillPath({
      skillPath: input.skillPath,
      projectPath: input.projectPath,
    })
    const skillDir = path.dirname(skillMdPath)
    await fs.access(skillDir)
    await fs.rm(skillDir, { recursive: true })
  }

  resolveLegacyEditableSkillPath(input: {
    skillPath: string
    projectPath?: string | null
  }): string {
    if (input.skillPath.includes("..")) {
      throw new ToolingError("INVALID_PATH", "Invalid skill path")
    }
    const absolutePath =
      input.projectPath &&
      !input.skillPath.startsWith("~") &&
      !path.isAbsolute(input.skillPath)
        ? path.join(input.projectPath, input.skillPath)
        : this.resolveHomePath(input.skillPath)

    this.assertEditableSkillPath(absolutePath, input.projectPath)
    return absolutePath
  }

  private resolveEditableSkillPath(itemRef: ToolingItemRef): string {
    const parsed = parseToolingItemId(itemRef.id)
    if (!parsed || parsed.kind !== "skill" || parsed.provider !== "claude") {
      throw new ToolingError("INVALID_PROVIDER", "Invalid Claude skill item id")
    }
    if (parsed.source === "plugin" || parsed.source === "official") {
      throw new ToolingError("READONLY_ITEM", "This skill source is readonly")
    }

    if (parsed.source === "user") {
      return path.join(getOneCodeClaudeSkillsDir(), parsed.identity, "SKILL.md")
    }

    const identity = parseJsonIdentity(parsed.identity)
    if (!identity.projectPath || !identity.name) {
      throw new ToolingError("INVALID_PATH", "Invalid project skill identity")
    }
    return path.join(identity.projectPath, ".claude", "skills", identity.name, "SKILL.md")
  }

  private requireProjectSkillsDir(projectPath?: string | null): string {
    if (!projectPath) {
      throw new ToolingError("INVALID_SCOPE", "Project path required for project skills")
    }
    return path.join(projectPath, ".claude", "skills")
  }

  private resolveHomePath(displayPath: string): string {
    if (displayPath.startsWith("~")) {
      return path.join(os.homedir(), displayPath.slice(1))
    }
    return displayPath
  }

  private assertEditableSkillPath(skillPath: string, projectPath?: string | null): void {
    const userRoot = getOneCodeClaudeSkillsDir()
    const projectRoot = projectPath
      ? path.join(projectPath, ".claude", "skills")
      : null

    if (
      skillPath.startsWith(userRoot + path.sep) ||
      (projectRoot && skillPath.startsWith(projectRoot + path.sep))
    ) {
      return
    }

    throw new ToolingError("READONLY_ITEM", "Skill path is outside editable sources")
  }
}
