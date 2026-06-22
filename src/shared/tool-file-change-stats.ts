import { extractCodexFileChanges } from "./codex-file-change-stats"

type AnyRecord = Record<string, unknown>

export type ToolChangedFileStat = {
  filePath: string
  additions: number
  deletions: number
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null
}

function isFileToolPart(part: AnyRecord): boolean {
  return part.type === "tool-Edit" || part.type === "tool-Write"
}

function isSessionFile(filePath: string): boolean {
  return (
    filePath.includes("claude-sessions") ||
    filePath.includes("Application Support")
  )
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split("\n").length
}

export function calculateToolChangedFileStats(
  parts: unknown[],
): ToolChangedFileStat[] {
  const fileStates = new Map<
    string,
    {
      originalContent: string | null
      currentContent: string
    }
  >()
  const codexFileStats = new Map<
    string,
    {
      additions: number
      deletions: number
    }
  >()

  for (const part of parts) {
    if (!isRecord(part) || !isFileToolPart(part)) continue

    const codexFileChanges = extractCodexFileChanges(part)
    if (codexFileChanges.length > 0) {
      for (const change of codexFileChanges) {
        const filePath = change.filePath
        if (!filePath || isSessionFile(filePath)) continue

        const existing = codexFileStats.get(filePath)
        if (existing) {
          existing.additions += change.additions
          existing.deletions += change.deletions
        } else {
          codexFileStats.set(filePath, {
            additions: change.additions,
            deletions: change.deletions,
          })
        }
      }
      continue
    }

    const input = isRecord(part.input) ? part.input : {}
    const filePath =
      typeof input.file_path === "string" ? input.file_path.trim() : ""
    if (!filePath || isSessionFile(filePath)) continue

    const oldString = typeof input.old_string === "string" ? input.old_string : ""
    const newString =
      typeof input.new_string === "string"
        ? input.new_string
        : typeof input.content === "string"
          ? input.content
          : ""

    const existing = fileStates.get(filePath)
    if (existing) {
      existing.currentContent = newString
    } else {
      fileStates.set(filePath, {
        originalContent: part.type === "tool-Write" ? null : oldString,
        currentContent: newString,
      })
    }
  }

  const result: ToolChangedFileStat[] = []

  for (const [filePath, state] of fileStates) {
    const original = state.originalContent || ""
    if (original === state.currentContent) continue

    const oldLines = countLines(original)
    const newLines = countLines(state.currentContent)
    result.push({
      filePath,
      additions: newLines,
      deletions: original ? oldLines : 0,
    })
  }

  for (const [filePath, stats] of codexFileStats) {
    result.push({
      filePath,
      additions: stats.additions,
      deletions: stats.deletions,
    })
  }

  return result
}
