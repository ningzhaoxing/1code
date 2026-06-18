type SecurityMiningMessagePart = {
  type?: string
  text?: string
  toolName?: string
  input?: unknown
  result?: unknown
  output?: unknown
  state?: string
}

type SecurityMiningMessage = {
  role?: string
  parts?: SecurityMiningMessagePart[]
}

export type CreateSecurityMiningMarkdownReportInput = {
  chatName?: string | null
  projectPath?: string | null
  recordPath: string
  reportPath: string
  generatedAt?: Date
  recordContent?: string
  messages: SecurityMiningMessage[]
}

const MAX_TEXT_CHARS = 1200
const MAX_RECORD_CHARS = 20_000

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars).trimEnd()}\n\n...（已截断，完整内容见原始记录/聊天）`
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, "<br>")
}

function getRoleLabel(role?: string): string {
  if (role === "user") return "用户"
  if (role === "assistant") return "Agent"
  return role || "未知"
}

function getPartText(part: SecurityMiningMessagePart): string {
  if (part.type === "text" && part.text) return part.text
  return ""
}

function getToolName(part: SecurityMiningMessagePart): string {
  return part.toolName || part.type?.replace(/^tool-/, "") || "unknown"
}

function collectText(parts: SecurityMiningMessagePart[] | undefined): string {
  return (parts || [])
    .map(getPartText)
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function collectTools(messages: SecurityMiningMessage[]): Array<{
  index: number
  toolName: string
  state: string
  input: string
  output: string
}> {
  const tools: Array<{
    index: number
    toolName: string
    state: string
    input: string
    output: string
  }> = []

  for (const message of messages) {
    for (const part of message.parts || []) {
      if (!part.type?.startsWith("tool-")) continue
      tools.push({
        index: tools.length + 1,
        toolName: getToolName(part),
        state: part.state || "unknown",
        input: truncate(stringifyValue(part.input), 500),
        output: truncate(stringifyValue(part.result ?? part.output), 700),
      })
    }
  }

  return tools
}

function buildExecutionChain(messages: SecurityMiningMessage[]): string {
  const items = messages
    .map((message, index) => {
      const text = collectText(message.parts)
      const tools = (message.parts || [])
        .filter((part) => part.type?.startsWith("tool-"))
        .map((part) => getToolName(part))

      const details: string[] = []
      if (text) details.push(truncate(text, MAX_TEXT_CHARS))
      if (tools.length > 0) details.push(`工具调用：${tools.join("、")}`)

      if (details.length === 0) return null
      return `### ${index + 1}. ${getRoleLabel(message.role)}\n\n${details.join("\n\n")}`
    })
    .filter(Boolean)

  return items.length > 0 ? items.join("\n\n") : "暂无可用聊天链路。"
}

function buildToolTable(messages: SecurityMiningMessage[]): string {
  const tools = collectTools(messages)
  if (tools.length === 0) return "暂无工具调用记录。"

  const rows = tools.map((tool) => {
    return [
      String(tool.index),
      escapeTableCell(tool.toolName),
      escapeTableCell(tool.state),
      escapeTableCell(tool.input || "-"),
      escapeTableCell(tool.output || "-"),
    ].join(" | ")
  })

  return [
    "| # | 工具 | 状态 | 关键输入 | 关键输出 |",
    "|---|---|---|---|---|",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n")
}

function getFirstUserText(messages: SecurityMiningMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user")
  return collectText(firstUserMessage?.parts)
}

function getFinalAssistantText(messages: SecurityMiningMessage[]): string {
  const finalAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")
  return collectText(finalAssistantMessage?.parts)
}

export function createSecurityMiningMarkdownReport({
  chatName,
  projectPath,
  recordPath,
  reportPath,
  generatedAt = new Date(),
  recordContent = "",
  messages,
}: CreateSecurityMiningMarkdownReportInput): string {
  const taskText = getFirstUserText(messages)
  const finalText = getFinalAssistantText(messages)
  const normalizedRecordContent = recordContent.trim()

  return [
    "# 漏洞挖掘报告",
    "",
    "## 基本信息",
    "",
    `- 会话：${chatName || "未命名会话"}`,
    `- 生成时间：${generatedAt.toISOString()}`,
    `- 项目路径：${projectPath || "未知"}`,
    `- 实时记录：${recordPath}`,
    `- 报告文件：${reportPath}`,
    "",
    "## 任务概览",
    "",
    taskText ? truncate(taskText, MAX_TEXT_CHARS) : "未找到用户原始任务描述。",
    "",
    "## 完整执行链路",
    "",
    buildExecutionChain(messages),
    "",
    "## 工具与证据链",
    "",
    buildToolTable(messages),
    "",
    "## 实时记录内容",
    "",
    normalizedRecordContent
      ? truncate(normalizedRecordContent, MAX_RECORD_CHARS)
      : "实时记录文件为空或尚未写入内容。",
    "",
    "## 最终结论摘录",
    "",
    finalText ? truncate(finalText, MAX_TEXT_CHARS) : "暂无 Agent 最终结论。",
    "",
    "## 交付说明",
    "",
    "- 本报告由 1Code 基于当前 chat/subChat 的完整消息链路、工具调用记录和实时 Markdown 记录生成。",
    "- 报告不是实时记录文件的简单复制；实时记录只作为证据索引和过程沉淀之一。",
    "- 如需正式提交，请结合授权范围、复现截图、外部扫描器日志和人工复核结果再做定稿。",
    "",
  ].join("\n")
}
