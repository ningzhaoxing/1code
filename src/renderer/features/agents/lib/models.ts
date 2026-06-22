export const CLAUDE_MODELS = [
  { id: "opus-4-7", name: "Opus", version: "4.7" },
  { id: "opus", name: "Opus", version: "4.6" },
  { id: "sonnet", name: "Sonnet", version: "4.6" },
  { id: "haiku", name: "Haiku", version: "4.5" },
]

export type CodexThinkingLevel = "low" | "medium" | "high" | "xhigh"
export type ClaudeThinkingLevel = Exclude<CodexThinkingLevel, "xhigh">

export const CLAUDE_THINKINGS: ClaudeThinkingLevel[] = [
  "low",
  "medium",
  "high",
]

const CLAUDE_MAX_THINKING_TOKENS: Record<ClaudeThinkingLevel, number> = {
  low: 4_000,
  medium: 32_000,
  high: 128_000,
}

export function normalizeClaudeThinkingLevel(
  thinking: CodexThinkingLevel,
): ClaudeThinkingLevel {
  if (thinking === "low" || thinking === "medium" || thinking === "high") {
    return thinking
  }

  return "high"
}

export function getClaudeMaxThinkingTokens(
  thinking: CodexThinkingLevel,
): number {
  return CLAUDE_MAX_THINKING_TOKENS[normalizeClaudeThinkingLevel(thinking)]
}

export const CODEX_MODELS = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.3-codex",
    name: "Codex 5.3",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.2-codex",
    name: "Codex 5.2",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.1-codex-max",
    name: "Codex 5.1 Max",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "Codex 5.1 Mini",
    thinkings: ["medium", "high"] as CodexThinkingLevel[],
  },
]

export function formatCodexThinkingLabel(thinking: CodexThinkingLevel): string {
  if (thinking === "xhigh") return "Extra High"
  return thinking.charAt(0).toUpperCase() + thinking.slice(1)
}
