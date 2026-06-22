type AnyRecord = Record<string, any>

export type CodexDiffLine = {
  type: "added" | "removed" | "context"
  content: string
}

export type CodexFileChangeSummary = {
  filePath: string
  changeType?: string
  additions: number
  deletions: number
  diffLines: CodexDiffLine[]
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split("\n").length
}

function isUnifiedDiffMetadataLine(line: string): boolean {
  return (
    line.startsWith("@@") ||
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("\\ No newline")
  )
}

export function calculateUnifiedDiffStats(
  unifiedDiff: string,
): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0

  for (const line of unifiedDiff.split("\n")) {
    if (isUnifiedDiffMetadataLine(line)) continue
    if (line.startsWith("+")) additions++
    else if (line.startsWith("-")) deletions++
  }

  return { additions, deletions }
}

export function unifiedDiffToDisplayLines(
  unifiedDiff: string,
): CodexDiffLine[] {
  const result: CodexDiffLine[] = []

  for (const line of unifiedDiff.split("\n")) {
    if (!line || isUnifiedDiffMetadataLine(line)) continue
    if (line.startsWith("+")) {
      result.push({ type: "added", content: line.slice(1) })
    } else if (line.startsWith("-")) {
      result.push({ type: "removed", content: line.slice(1) })
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.slice(1) })
    }
  }

  return result
}

function getChangesMap(value: unknown): AnyRecord | null {
  if (!isRecord(value)) return null

  const candidates = [
    value.changes,
    isRecord(value.input) ? value.input.changes : undefined,
    isRecord(value.output) ? value.output.changes : undefined,
    isRecord(value.result) ? value.result.changes : undefined,
  ]

  return candidates.find(isRecord) || null
}

export function extractCodexFileChanges(
  value: unknown,
): CodexFileChangeSummary[] {
  const changesByPath = new Map<string, CodexFileChangeSummary>()

  const changes = getChangesMap(value)
  if (!changes) return []

  for (const [filePath, rawChange] of Object.entries(changes)) {
    if (!filePath || !isRecord(rawChange)) continue

    const unifiedDiff =
      typeof rawChange.unified_diff === "string" ? rawChange.unified_diff : ""
    const content = typeof rawChange.content === "string" ? rawChange.content : ""
    const changeType =
      typeof rawChange.type === "string" ? rawChange.type : undefined

    const stats = unifiedDiff
      ? calculateUnifiedDiffStats(unifiedDiff)
      : {
          additions: changeType === "delete" ? 0 : countLines(content),
          deletions: 0,
        }
    const diffLines = unifiedDiff
      ? unifiedDiffToDisplayLines(unifiedDiff)
      : content
        ? content.split("\n").map((line) => ({
            type: "added" as const,
            content: line,
          }))
        : []

    const existing = changesByPath.get(filePath)
    if (existing) {
      existing.additions += stats.additions
      existing.deletions += stats.deletions
      existing.diffLines.push(...diffLines)
      continue
    }

    changesByPath.set(filePath, {
      filePath,
      changeType,
      additions: stats.additions,
      deletions: stats.deletions,
      diffLines,
    })
  }

  return Array.from(changesByPath.values())
}
