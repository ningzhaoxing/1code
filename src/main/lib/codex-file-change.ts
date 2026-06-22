type AnyRecord = Record<string, any>

export type CodexToolInputSnapshot = {
  type: string
  input?: unknown
}

export type CodexFileChange = {
  filePath: string
  type: "tool-Write" | "tool-Edit"
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null
}

export function snapshotCodexToolInputChunk(
  chunk: unknown,
): { toolCallId: string; snapshot: CodexToolInputSnapshot } | null {
  if (!isRecord(chunk)) return null
  if (chunk.type !== "tool-input-available") return null
  if (typeof chunk.toolCallId !== "string" || chunk.toolCallId.length === 0) {
    return null
  }
  if (typeof chunk.toolName !== "string" || chunk.toolName.length === 0) {
    return null
  }

  return {
    toolCallId: chunk.toolCallId,
    snapshot: {
      type: `tool-${chunk.toolName}`,
      input: chunk.input,
    },
  }
}

export function getCodexCompletedFileChange(
  snapshot: CodexToolInputSnapshot | null | undefined,
): CodexFileChange | null {
  if (!snapshot) return null
  if (snapshot.type !== "tool-Write" && snapshot.type !== "tool-Edit") {
    return null
  }
  if (!isRecord(snapshot.input)) return null

  const filePath =
    typeof snapshot.input.file_path === "string"
      ? snapshot.input.file_path.trim()
      : ""
  if (!filePath) return null

  return {
    filePath,
    type: snapshot.type,
  }
}
