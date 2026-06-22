type MessagePart = {
  type?: string
  text?: string
}

type ClaudeResultCompletionState = {
  aborted: boolean
  resultSubtype?: string
  resultText?: string
  numTurns?: number
  currentText: string
  parts: MessagePart[]
}

function hasVisibleText(parts: MessagePart[], currentText: string): boolean {
  if (currentText.trim()) return true
  return parts.some(
    (part) =>
      part.type === "text" &&
      typeof part.text === "string" &&
      part.text.trim().length > 0,
  )
}

export function getClaudeResultCompletionIssue(
  state: ClaudeResultCompletionState,
): string | null {
  if (state.aborted) return null
  if (state.resultSubtype !== "success") return null
  if (state.resultText?.trim()) return null
  if (hasVisibleText(state.parts, state.currentText)) return null

  const turnSuffix =
    typeof state.numTurns === "number" ? ` after ${state.numTurns} turns` : ""

  return `Claude SDK returned an empty successful result${turnSuffix}. The run likely ended before the agent produced a final answer; review the last tool calls and continue the task.`
}
