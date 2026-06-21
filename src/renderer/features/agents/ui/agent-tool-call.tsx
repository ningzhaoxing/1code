"use client"

import { memo } from "react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"

interface AgentToolCallProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  tooltipContent?: string
  isPending: boolean
  isError: boolean
  isSuccess?: boolean
  isNested?: boolean
  onClick?: () => void
}

export const AgentToolCall = memo(
  function AgentToolCall({
    icon: _Icon,
    title,
    subtitle,
    tooltipContent,
    isPending,
    isError,
    isSuccess,
    isNested,
    onClick,
  }: AgentToolCallProps) {
    // Ensure title and subtitle are strings (copied from canvas)
    const titleStr = String(title)
    const subtitleStr = subtitle ? String(subtitle) : undefined

    // Operator-console status chip from already-known state.
    // Pending shows a running shimmer dot; error shows FAIL; success a subtle tick.
    // Kept compact to preserve the dense one-liner density.
    const statusChip = isPending ? (
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
    )

    // Render subtitle with optional tooltip
    const clickableClass = onClick
      ? " cursor-pointer hover:text-muted-foreground transition-colors"
      : ""

    const subtitleElement = subtitleStr ? (
      tooltipContent ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`text-muted-foreground/60 font-normal truncate min-w-0${clickableClass}`}
              dangerouslySetInnerHTML={{ __html: subtitleStr }}
              onClick={onClick}
            />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="px-2 py-1.5 max-w-none flex items-center justify-center"
          >
            <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
              {tooltipContent}
            </span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span
          className={`text-muted-foreground/60 font-normal truncate min-w-0${clickableClass}`}
          dangerouslySetInnerHTML={{ __html: subtitleStr }}
          onClick={onClick}
        />
      )
    ) : null

    return (
      <div
        className={`flex items-start gap-1.5 py-0.5 ${
          isNested ? "px-2.5" : "rounded-md px-2"
        }`}
      >
        {/* Icon container - commented out like canvas, uncomment to show icons */}
        {/* <div className="flex-shrink-0 flex text-muted-foreground items-start pt-[1px]">
          <_Icon className="w-3.5 h-3.5" />
        </div> */}

        {/* Content container - matches canvas exactly */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            {statusChip}
            <span className="font-mono font-medium whitespace-nowrap flex-shrink-0">
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  {titleStr}
                </TextShimmer>
              ) : (
                titleStr
              )}
            </span>
            {subtitleElement}
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization (copied from canvas)
    return (
      prevProps.title === nextProps.title &&
      prevProps.subtitle === nextProps.subtitle &&
      prevProps.tooltipContent === nextProps.tooltipContent &&
      prevProps.isPending === nextProps.isPending &&
      prevProps.isError === nextProps.isError &&
      prevProps.isSuccess === nextProps.isSuccess &&
      prevProps.isNested === nextProps.isNested &&
      prevProps.onClick === nextProps.onClick
    )
  },
)
