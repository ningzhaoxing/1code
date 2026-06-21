"use client"

import { memo, useState, useMemo, useEffect } from "react"
import { ChevronRight } from "lucide-react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { getToolStatus, type McpToolInfo } from "./agent-tool-registry"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { cn } from "../../../lib/utils"
import { highlightCode } from "../../../lib/themes/shiki-theme-loader"
import { useCodeTheme } from "../../../lib/hooks/use-code-theme"
import { translateCurrentLocale } from "../../../lib/i18n"

interface AgentMcpToolCallProps {
  part: any
  mcpInfo: McpToolInfo
  chatStatus?: string
}

// Priority arg keys to show in subtitle
const PRIORITY_ARGS = ["query", "question", "email", "name", "id", "customer", "url", "issue", "body", "summary", "title"]

function getActiveTitle(info: McpToolInfo): string {
  return translateCurrentLocale("chat.tool.mcpRunning", { name: info.displayName })
}

function getCompletedTitle(info: McpToolInfo): string {
  return translateCurrentLocale("chat.tool.mcpCompleted", { name: info.displayName })
}

function getResultCount(output: any): string | null {
  if (!output) return null

  if (Array.isArray(output)) {
    const n = output.length
    return translateCurrentLocale("chat.tool.resultCount", {
      count: n,
      item: translateCurrentLocale(n === 1 ? "chat.tool.resultSingular" : "chat.tool.resultPlural"),
    })
  }

  if (typeof output === "object") {
    let longest: any[] | undefined
    for (const v of Object.values(output)) {
      if (Array.isArray(v) && (!longest || v.length > longest.length)) {
        longest = v
      }
    }
    if (longest) {
      const n = longest.length
      return translateCurrentLocale("chat.tool.resultCount", {
        count: n,
        item: translateCurrentLocale(n === 1 ? "chat.tool.resultSingular" : "chat.tool.resultPlural"),
      })
    }
  }

  return null
}

function formatMcpArgs(input: any): string {
  if (!input || typeof input !== "object") return ""
  const entries = Object.entries(input).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  )
  if (entries.length === 0) return ""

  // Show up to 2 key: value pairs, prioritizing important keys
  const sorted = [...entries].sort(([a], [b]) => {
    const ai = PRIORITY_ARGS.indexOf(a)
    const bi = PRIORITY_ARGS.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return 0
  })

  const parts: string[] = []
  for (const [key, value] of sorted) {
    if (parts.length >= 2) break
    const val = typeof value === "string" ? value : JSON.stringify(value)
    const display = val.length > 30 ? val.slice(0, 27) + "..." : val
    parts.push(`${key}: ${display}`)
  }
  return parts.join("  ")
}

/**
 * Unwrap MCP output from various wrapper formats.
 * MCP tool results arrive from the Claude API as content block arrays:
 *  - [{type:"text", text:"{\"key\":\"value\"}"}] (array of content blocks)
 *  - {type:"text", text:"..."} (single content block)
 *  - a raw JSON string
 *  - already-parsed object
 */
function unwrapMcpOutput(output: any): any {
  if (!output) return output

  // Unwrap array of content blocks: [{type:"text", text:"..."}]
  // Concatenate all text blocks into one string, then parse
  if (Array.isArray(output)) {
    const textParts: string[] = []
    for (const block of output) {
      if (block?.type === "text" && typeof block?.text === "string") {
        textParts.push(block.text)
      }
    }
    if (textParts.length > 0) {
      const combined = textParts.join("")
      try {
        return JSON.parse(combined)
      } catch {
        return combined
      }
    }
    return output
  }

  // Unwrap single content block: {type:"text", text:"..."}
  if (output?.type === "text" && typeof output?.text === "string") {
    const text = output.text
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  // Unwrap raw JSON string
  if (typeof output === "string") {
    try {
      return JSON.parse(output)
    } catch {
      return output
    }
  }

  return output
}

/**
 * Format MCP output as pretty-printed JSON for display.
 */
function formatOutputForDisplay(output: any): string {
  const unwrapped = unwrapMcpOutput(output)
  if (typeof unwrapped === "string") {
    return unwrapped.length > 3000 ? unwrapped.slice(0, 3000) + "\n..." : unwrapped
  }
  const text = JSON.stringify(unwrapped, null, 2)
  return text.length > 3000 ? text.slice(0, 3000) + "\n..." : text
}

/** Highlighted JSON code block using shiki */
function HighlightedJson({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const themeId = useCodeTheme()

  useEffect(() => {
    let cancelled = false
    highlightCode(code, "json", themeId)
      .then((result) => {
        if (!cancelled) setHtml(result)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [code, themeId])

  if (html) {
    return (
      <pre
        className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words [&>pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <pre className="text-[10px] text-muted-foreground/60 whitespace-pre-wrap break-words font-mono leading-relaxed">
      {code}
    </pre>
  )
}

export const AgentMcpToolCall = memo(function AgentMcpToolCall({
  part,
  mcpInfo,
  chatStatus,
}: AgentMcpToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { isPending, isError, isSuccess, isInterrupted } = getToolStatus(part, chatStatus)

  const unwrappedOutput = useMemo(() => unwrapMcpOutput(part.output), [part.output])

  const title = useMemo(() => {
    if (part.state === "input-streaming") return translateCurrentLocale("chat.tool.mcpPreparing", { name: mcpInfo.displayName })
    if (isPending) return getActiveTitle(mcpInfo)
    return getCompletedTitle(mcpInfo)
  }, [part.state, isPending, mcpInfo])

  const resultCount = useMemo(() => {
    if (isPending) return null
    return getResultCount(unwrappedOutput)
  }, [isPending, unwrappedOutput])

  const subtitle = useMemo(() => {
    if (part.state === "input-streaming") return ""
    return formatMcpArgs(part.input)
  }, [part.input, part.state])

  const displayOutput = useMemo(() => {
    if (!part.output) return null
    return formatOutputForDisplay(part.output)
  }, [part.output])

  const hasExpandableContent = (
    (part.input && Object.keys(part.input).length > 0) ||
    !!part.output
  ) && !isPending

  if (isInterrupted && !part.output) {
    return (
      <AgentToolInterrupted
        toolName={mcpInfo.displayName}
        subtitle={translateCurrentLocale("chat.tool.mcpVia", { server: mcpInfo.serverName })}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div
        onClick={() => hasExpandableContent && setIsExpanded(!isExpanded)}
        className={cn(
          "group flex items-start gap-1.5 py-0.5 px-2",
          hasExpandableContent && "cursor-pointer",
        )}
      >
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            {/* Operator status chip from existing state */}
            {isPending ? (
              <span
                aria-hidden
                className="inline-block w-1 h-1 rounded-[1px] bg-tool-running animate-pulse flex-shrink-0"
              />
            ) : isError ? (
              <span className="font-mono text-[10px] leading-none tracking-wide text-tool-fail flex-shrink-0">
                FAIL
              </span>
            ) : isSuccess ? (
              <span
                aria-hidden
                className="font-mono text-[10px] leading-none text-tool-success/70 flex-shrink-0"
              >
                ✓
              </span>
            ) : (
              <span
                aria-hidden
                className="inline-block w-1 h-1 rounded-[1px] bg-current text-muted-foreground/40 flex-shrink-0"
              />
            )}
            <span className="font-mono font-medium whitespace-nowrap flex-shrink-0">
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  {title}
                </TextShimmer>
              ) : (
                title
              )}
            </span>

            {/* Subtitle: key arg value */}
            {subtitle && (
              <span className="text-muted-foreground/60 font-normal truncate min-w-0">
                {subtitle}
              </span>
            )}

            {/* Result count — more muted than args */}
            {resultCount && (
              <span className="text-muted-foreground/40 font-normal whitespace-nowrap flex-shrink-0">
                {resultCount}
              </span>
            )}

            {/* Expand chevron */}
            {hasExpandableContent && (
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out flex-shrink-0",
                  isExpanded && "rotate-90",
                  !isExpanded && "opacity-0 group-hover:opacity-100",
                )}
              />
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && hasExpandableContent && (
        <div className="mx-2 mb-1 rounded-md border border-border bg-muted/30 overflow-hidden">
          {/* Arguments */}
          {part.input && Object.keys(part.input).length > 0 && (
            <div className="px-2.5 py-1.5 space-y-0.5">
              {Object.entries(part.input)
                .filter(([, v]) => v !== undefined && v !== null && v !== "")
                .map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-1.5 text-[10px]">
                    <span className="text-muted-foreground/50 font-mono flex-shrink-0">
                      {key}:
                    </span>
                    <span className="text-muted-foreground/70 font-mono truncate">
                      {typeof value === "string"
                        ? value.length > 120 ? value.slice(0, 117) + "..." : value
                        : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Result */}
          {displayOutput && (
            <div className={cn(
              "px-2.5 py-1.5 max-h-[200px] overflow-y-auto",
              part.input && Object.keys(part.input).length > 0 && "border-t border-border",
            )}>
              <HighlightedJson code={displayOutput} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
