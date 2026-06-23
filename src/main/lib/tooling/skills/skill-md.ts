import matter from "gray-matter"

export function normalizeSkillName(name: string): string {
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

export function parseSkillMd(rawContent: string): {
  name?: string
  description?: string
  content: string
} {
  try {
    const { data, content } = matter(rawContent)
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description:
        typeof data.description === "string" ? data.description : undefined,
      content: content.trim(),
    }
  } catch (err) {
    console.error("[tooling:skills] Failed to parse frontmatter:", err)
    return { content: rawContent.trim() }
  }
}

export function generateSkillMd(skill: {
  name: string
  description: string
  content: string
}): string {
  const frontmatter: string[] = []
  frontmatter.push(`name: ${skill.name}`)
  if (skill.description) {
    frontmatter.push(`description: ${skill.description}`)
  }
  return `---\n${frontmatter.join("\n")}\n---\n\n${skill.content}`
}
