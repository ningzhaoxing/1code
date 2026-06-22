export const CODEX_TRANSPORT_DIAGNOSTIC_PART_TYPE =
  "data-codex-transport-diagnostic" as const

export type CodexTransportDiagnosticCode =
  | "websocket_fallback"
  | "response_stream_disconnected"
  | "request_timeout"
  | "reconnecting"
  | "turn_error"

export type CodexTransportDiagnosticLevel = "info" | "warning" | "error"

export type CodexTransportDiagnosticData = {
  level: CodexTransportDiagnosticLevel
  code: CodexTransportDiagnosticCode
  title: string
  message: string
  raw: string
  timestamp: string
}

export type ParsedCodexTransportDiagnostic = Omit<
  CodexTransportDiagnosticData,
  "timestamp"
>

export type CodexTransportDiagnosticPart = {
  type: typeof CODEX_TRANSPORT_DIAGNOSTIC_PART_TYPE
  id: string
  data: CodexTransportDiagnosticData
}

const ANSI_ESCAPE_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC_REGEX = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g

export function normalizeCodexAcpStderrLine(line: string): string {
  return line.replace(ANSI_OSC_REGEX, "").replace(ANSI_ESCAPE_REGEX, "").trim()
}

export function getCodexTransportDiagnosticKey(
  diagnostic: ParsedCodexTransportDiagnostic,
): string {
  return `${diagnostic.code}:${diagnostic.raw}`
}

export function parseCodexAcpTransportDiagnostic(
  line: string,
): ParsedCodexTransportDiagnostic | null {
  const raw = normalizeCodexAcpStderrLine(line)
  if (!raw) return null

  const lower = raw.toLowerCase()

  if (raw.includes("Falling back from WebSockets to HTTPS transport")) {
    return {
      level: "warning",
      code: "websocket_fallback",
      title: "Codex transport fallback",
      message: lower.includes("request timed out")
        ? "WebSocket request timed out; using HTTPS transport."
        : "WebSocket transport is unavailable; using HTTPS transport.",
      raw,
    }
  }

  if (
    raw.includes("ResponseStreamDisconnected") ||
    (lower.includes("handled error during turn") &&
      lower.includes("response stream"))
  ) {
    return {
      level: "warning",
      code: "response_stream_disconnected",
      title: "Codex stream disconnected",
      message: lower.includes("request timed out")
        ? "Codex lost the response stream while retrying. Detail: request timed out."
        : "Codex lost the response stream while retrying.",
      raw,
    }
  }

  if (lower.includes("request timed out")) {
    return {
      level: "warning",
      code: "request_timeout",
      title: "Codex request timed out",
      message: "Codex ACP reported a timeout while waiting for the response stream.",
      raw,
    }
  }

  if (lower.includes("reconnecting...")) {
    return {
      level: "info",
      code: "reconnecting",
      title: "Codex is reconnecting",
      message: "Codex ACP is retrying the response stream.",
      raw,
    }
  }

  if (lower.includes("handled error during turn")) {
    return {
      level: "warning",
      code: "turn_error",
      title: "Codex turn warning",
      message: "Codex ACP reported a recoverable turn error.",
      raw,
    }
  }

  return null
}
