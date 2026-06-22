import { useEffect, useRef } from "react"

type DetailsClosedBy = "plan" | "terminal" | "diff" | "fileViewer" | null

interface UseRightPanelMutualExclusionParams {
  isDetailsSidebarOpen: boolean
  setIsDetailsSidebarOpen: (open: boolean) => void

  isPlanOpen: boolean
  setIsPlanSidebarOpen: (open: boolean) => void

  isTerminalSidebarOpen: boolean
  terminalDisplayMode: "side-peek" | "bottom"
  setIsTerminalSidebarOpen: (open: boolean) => void

  isDiffSidebarOpen: boolean
  diffDisplayMode: "side-peek" | "center-peek" | "full-page"
  setIsDiffSidebarOpen: (open: boolean) => void

  fileViewerSidePeekPath: string | null
  fileViewerDisplayMode: "side-peek" | "center-peek" | "full-page"
  setFileViewerPath: (filePath: string | null) => void
}

export function useRightPanelMutualExclusion({
  isDetailsSidebarOpen,
  setIsDetailsSidebarOpen,
  isPlanOpen,
  setIsPlanSidebarOpen,
  isTerminalSidebarOpen,
  terminalDisplayMode,
  setIsTerminalSidebarOpen,
  isDiffSidebarOpen,
  diffDisplayMode,
  setIsDiffSidebarOpen,
  fileViewerSidePeekPath,
  fileViewerDisplayMode,
  setFileViewerPath,
}: UseRightPanelMutualExclusionParams) {
  const autoClosedStateRef = useRef<{
    detailsClosedBy: DetailsClosedBy
    planClosedByDetails: boolean
    terminalClosedByDetails: boolean
    diffClosedByDetails: boolean
    fileViewerPathClosedByDetails: string | null
  }>({
    detailsClosedBy: null,
    planClosedByDetails: false,
    terminalClosedByDetails: false,
    diffClosedByDetails: false,
    fileViewerPathClosedByDetails: null,
  })

  const prevSidebarStatesRef = useRef({
    details: isDetailsSidebarOpen,
    plan: isPlanOpen,
    terminal: isTerminalSidebarOpen,
    fileViewer: Boolean(
      fileViewerSidePeekPath && fileViewerDisplayMode === "side-peek",
    ),
  })

  useEffect(() => {
    const prev = prevSidebarStatesRef.current
    const auto = autoClosedStateRef.current
    const isFileViewerSidePeekOpen = Boolean(
      fileViewerSidePeekPath && fileViewerDisplayMode === "side-peek",
    )

    const detailsJustOpened = isDetailsSidebarOpen && !prev.details
    const detailsJustClosed = !isDetailsSidebarOpen && prev.details
    const planJustOpened = isPlanOpen && !prev.plan
    const planJustClosed = !isPlanOpen && prev.plan
    const terminalJustOpened = isTerminalSidebarOpen && !prev.terminal
    const terminalJustClosed = !isTerminalSidebarOpen && prev.terminal
    const fileViewerJustOpened = isFileViewerSidePeekOpen && !prev.fileViewer
    const fileViewerJustClosed = !isFileViewerSidePeekOpen && prev.fileViewer

    const terminalConflictsWithDetails = terminalDisplayMode === "side-peek"

    if (detailsJustOpened) {
      if (isPlanOpen) {
        auto.planClosedByDetails = true
        setIsPlanSidebarOpen(false)
      }
      if (isTerminalSidebarOpen && terminalConflictsWithDetails) {
        auto.terminalClosedByDetails = true
        setIsTerminalSidebarOpen(false)
      }
      if (fileViewerSidePeekPath && isFileViewerSidePeekOpen) {
        auto.fileViewerPathClosedByDetails = fileViewerSidePeekPath
        setFileViewerPath(null)
      }
    } else if (detailsJustClosed) {
      const detailsWasClosedByPanel = auto.detailsClosedBy !== null

      if (!detailsWasClosedByPanel && auto.planClosedByDetails) {
        auto.planClosedByDetails = false
        setIsPlanSidebarOpen(true)
      }
      if (!detailsWasClosedByPanel && auto.terminalClosedByDetails) {
        auto.terminalClosedByDetails = false
        setIsTerminalSidebarOpen(true)
      }
      if (!detailsWasClosedByPanel && auto.fileViewerPathClosedByDetails) {
        const filePath = auto.fileViewerPathClosedByDetails
        auto.fileViewerPathClosedByDetails = null
        setFileViewerPath(filePath)
      }
    } else if (planJustOpened && isDetailsSidebarOpen) {
      auto.detailsClosedBy = "plan"
      setIsDetailsSidebarOpen(false)
    } else if (planJustClosed && auto.detailsClosedBy === "plan") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    } else if (
      terminalJustOpened &&
      isDetailsSidebarOpen &&
      terminalConflictsWithDetails
    ) {
      auto.detailsClosedBy = "terminal"
      setIsDetailsSidebarOpen(false)
    } else if (
      terminalJustClosed &&
      auto.detailsClosedBy === "terminal"
    ) {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    } else if (fileViewerJustOpened && isDetailsSidebarOpen) {
      auto.detailsClosedBy = "fileViewer"
      setIsDetailsSidebarOpen(false)
    } else if (
      fileViewerJustClosed &&
      auto.detailsClosedBy === "fileViewer"
    ) {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    }

    prevSidebarStatesRef.current = {
      details: isDetailsSidebarOpen,
      plan: isPlanOpen,
      terminal: isTerminalSidebarOpen,
      fileViewer: isFileViewerSidePeekOpen,
    }
  }, [
    isDetailsSidebarOpen,
    isPlanOpen,
    isTerminalSidebarOpen,
    terminalDisplayMode,
    fileViewerSidePeekPath,
    fileViewerDisplayMode,
    setIsDetailsSidebarOpen,
    setIsPlanSidebarOpen,
    setIsTerminalSidebarOpen,
    setFileViewerPath,
  ])

  const prevDiffStateRef = useRef<{
    isOpen: boolean
    mode: string
    detailsOpen: boolean
  }>({
    isOpen: isDiffSidebarOpen,
    mode: diffDisplayMode,
    detailsOpen: isDetailsSidebarOpen,
  })
  const isRestoringDiffRef = useRef(false)

  useEffect(() => {
    const prev = prevDiffStateRef.current
    const auto = autoClosedStateRef.current
    const isNowSidePeek = isDiffSidebarOpen && diffDisplayMode === "side-peek"
    const wasSidePeek = prev.isOpen && prev.mode === "side-peek"
    const detailsJustOpened = isDetailsSidebarOpen && !prev.detailsOpen
    const detailsJustClosed = !isDetailsSidebarOpen && prev.detailsOpen
    const diffSidePeekJustClosed = wasSidePeek && !isNowSidePeek

    if (isNowSidePeek && isDetailsSidebarOpen) {
      if (detailsJustOpened) {
        auto.diffClosedByDetails = true
        setIsDiffSidebarOpen(false)
      } else if (!prev.isOpen && !isRestoringDiffRef.current) {
        auto.detailsClosedBy = "diff"
        setIsDetailsSidebarOpen(false)
      } else if (prev.isOpen && prev.mode !== "side-peek") {
        auto.detailsClosedBy = "diff"
        setIsDetailsSidebarOpen(false)
      }
    } else if (diffSidePeekJustClosed && auto.detailsClosedBy === "diff") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    } else if (
      detailsJustClosed &&
      auto.detailsClosedBy === null &&
      auto.diffClosedByDetails
    ) {
      auto.diffClosedByDetails = false
      isRestoringDiffRef.current = true
      setIsDiffSidebarOpen(true)
      requestAnimationFrame(() => {
        isRestoringDiffRef.current = false
      })
    }

    prevDiffStateRef.current = {
      isOpen: isDiffSidebarOpen,
      mode: diffDisplayMode,
      detailsOpen: isDetailsSidebarOpen,
    }
  }, [
    isDiffSidebarOpen,
    diffDisplayMode,
    isDetailsSidebarOpen,
    setIsDetailsSidebarOpen,
    setIsDiffSidebarOpen,
  ])
}
