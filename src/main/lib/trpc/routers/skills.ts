import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { isDirentDirectory } from "../../fs/dirent"
import { getEnabledPlugins } from "./claude-settings"
import { getOneCodeCodexHome } from "../../agent-skills/default-project-skills"

export interface FileSkill {
  name: string
  description: string
  source: "user" | "project" | "plugin"
  provider: "claude" | "codex"
  pluginName?: string
  path: string
  content: string
}

const skillProviderSchema = z.enum(["claude", "codex"])
const skillListProviderSchema = z.enum(["claude", "codex", "all"])

type SkillProvider = z.infer<typeof skillProviderSchema>
type SkillListProvider = z.infer<typeof skillListProviderSchema>

function normalizeSkillName(name: string): string {
  const safeName = name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  if (!safeName) {
    throw new Error("Skill name must contain at least one letter or number")
  }

  return safeName
}

function getCodexUserSkillsDir(): string {
  return path.join(getOneCodeCodexHome(), "skills")
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillMd(rawContent: string): { name?: string; description?: string; content: string } {
  try {
    const { data, content } = matter(rawContent)
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      content: content.trim(),
    }
  } catch (err) {
    console.error("[skills] Failed to parse frontmatter:", err)
    return { content: rawContent.trim() }
  }
}

/**
 * Scan a directory for SKILL.md files
 */
async function scanSkillsDirectory(
  dir: string,
  source: "user" | "project" | "plugin",
  provider: SkillProvider,
  basePath?: string, // For project skills, the cwd to make paths relative to
): Promise<FileSkill[]> {
  const skills: FileSkill[] = []

  try {
    // Check if directory exists
    try {
      await fs.access(dir)
    } catch {
      return skills
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      // Check if entry is a directory (follows symlinks)
      const isDir = await isDirentDirectory(dir, entry)
      if (!isDir) continue

      // Validate entry name for security (prevent path traversal)
      if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
        console.warn(`[skills] Skipping invalid directory name: ${entry.name}`)
        continue
      }

      const skillMdPath = path.join(dir, entry.name, "SKILL.md")

      try {
        await fs.access(skillMdPath)
        const content = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(content)

        // For project skills, show relative path; for user skills, show ~/... path
        let displayPath: string
        if (source === "project" && basePath) {
          displayPath = path.relative(basePath, skillMdPath)
        } else {
          // For user skills, show a home-relative path.
          const homeDir = os.homedir()
          displayPath = skillMdPath.startsWith(homeDir)
            ? "~" + skillMdPath.slice(homeDir.length)
            : skillMdPath
        }

        skills.push({
          name: parsed.name || entry.name,
          description: parsed.description || "",
          source,
          provider,
          path: displayPath,
          content: parsed.content,
        })
      } catch (err) {
        // Skill directory doesn't have SKILL.md or read failed - skip it
      }
    }
  } catch (err) {
    console.error(`[skills] Failed to scan directory ${dir}:`, err)
  }

  return skills
}

// Shared procedure for listing skills
const listSkillsProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
        provider: skillListProviderSchema.optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const provider: SkillListProvider = input?.provider ?? "claude"
    const shouldListClaude = provider === "claude" || provider === "all"
    const shouldListCodex = provider === "codex" || provider === "all"

    const skillPromises: Array<Promise<FileSkill[]>> = []

    if (shouldListClaude) {
      skillPromises.push(
        scanSkillsDirectory(
          path.join(os.homedir(), ".claude", "skills"),
          "user",
          "claude",
        ),
      )

      if (input?.cwd) {
        skillPromises.push(
          scanSkillsDirectory(
            path.join(input.cwd, ".claude", "skills"),
            "project",
            "claude",
            input.cwd,
          ),
        )
      }
    }

    if (shouldListCodex) {
      skillPromises.push(
        scanSkillsDirectory(getCodexUserSkillsDir(), "user", "codex"),
      )

      if (input?.cwd) {
        skillPromises.push(
          scanSkillsDirectory(
            path.join(input.cwd, ".agents", "skills"),
            "project",
            "codex",
            input.cwd,
          ),
        )
      }
    }

    // Discover plugin skills
    if (shouldListClaude) {
      const [enabledPluginSources, installedPlugins] = await Promise.all([
        getEnabledPlugins(),
        discoverInstalledPlugins(),
      ])
      const enabledPlugins = installedPlugins.filter(
        (p) => enabledPluginSources.includes(p.source),
      )
      const pluginSkillsPromises = enabledPlugins.map(async (plugin) => {
        const paths = getPluginComponentPaths(plugin)
        try {
          const skills = await scanSkillsDirectory(paths.skills, "plugin", "claude")
          return skills.map((skill) => ({ ...skill, pluginName: plugin.source }))
        } catch {
          return []
        }
      })
      skillPromises.push(...pluginSkillsPromises)
    }

    // Scan all directories in parallel
    const skillArrays = await Promise.all(skillPromises)
    return skillArrays.flat()
  })

/**
 * Generate SKILL.md content from name, description, and body
 */
function generateSkillMd(skill: { name: string; description: string; content: string }): string {
  const frontmatter: string[] = []
  frontmatter.push(`name: ${skill.name}`)
  if (skill.description) {
    frontmatter.push(`description: ${skill.description}`)
  }
  return `---\n${frontmatter.join("\n")}\n---\n\n${skill.content}`
}

/**
 * Resolve the absolute filesystem path of a skill given its display path
 */
function resolveSkillPath(displayPath: string): string {
  if (displayPath.startsWith("~")) {
    return path.join(os.homedir(), displayPath.slice(1))
  }
  return displayPath
}

export const skillsRouter = router({
  /**
   * List all skills from filesystem
   * - Claude user skills: ~/.claude/skills/
   * - Claude project skills: .claude/skills/ (relative to cwd)
   * - Codex user skills: ~/.agents/skills/
   * - Codex project skills: .agents/skills/ (relative to cwd)
   */
  list: listSkillsProcedure,

  /**
   * Alias for list - used by @ mention
   */
  listEnabled: listSkillsProcedure,

  /**
   * Create a new skill
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        content: z.string(),
        source: z.enum(["user", "project"]),
        provider: skillProviderSchema.optional(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const provider = input.provider ?? "claude"
      const safeName = normalizeSkillName(input.name)

      let targetDir: string
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project skills")
        }
        targetDir = path.join(
          input.cwd,
          provider === "codex" ? ".agents" : ".claude",
          "skills",
        )
      } else {
        targetDir =
          provider === "codex"
            ? getCodexUserSkillsDir()
            : path.join(os.homedir(), ".claude", "skills")
      }

      const skillDir = path.join(targetDir, safeName)
      const skillMdPath = path.join(skillDir, "SKILL.md")

      // Check if already exists
      try {
        await fs.access(skillMdPath)
        throw new Error(`Skill "${safeName}" already exists`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err
        }
      }

      // Create directory and write SKILL.md
      await fs.mkdir(skillDir, { recursive: true })

      const fileContent = generateSkillMd({
        name: safeName,
        description: input.description,
        content: input.content,
      })

      await fs.writeFile(skillMdPath, fileContent, "utf-8")

      return {
        name: safeName,
        path: skillMdPath,
        source: input.source,
        provider,
      }
    }),

  /**
   * Update a skill's SKILL.md content
   */
  update: publicProcedure
    .input(
      z.object({
        path: z.string(),
        name: z.string(),
        description: z.string(),
        content: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const absolutePath = input.cwd && !input.path.startsWith("~") && !input.path.startsWith("/")
        ? path.join(input.cwd, input.path)
        : resolveSkillPath(input.path)

      // Verify file exists before writing
      await fs.access(absolutePath)

      const fileContent = generateSkillMd({
        name: input.name,
        description: input.description,
        content: input.content,
      })

      await fs.writeFile(absolutePath, fileContent, "utf-8")

      return { success: true }
    }),

  /**
   * Delete a skill directory
   */
  delete: publicProcedure
    .input(
      z.object({
        path: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.path.includes("..")) {
        throw new Error("Invalid path")
      }

      const absolutePath = input.cwd && !input.path.startsWith("~") && !input.path.startsWith("/")
        ? path.join(input.cwd, input.path)
        : resolveSkillPath(input.path)

      // Skills are directories containing SKILL.md — delete the parent directory
      const skillDir = path.dirname(absolutePath)
      await fs.access(skillDir)
      await fs.rm(skillDir, { recursive: true })

      return { success: true }
    }),
})
