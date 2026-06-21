import type {
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk"

export type CodexPermissionQuestion = {
  question: string
  header: string
  options: Array<{ label: string; description: string }>
  multiSelect: boolean
}

export type CodexPermissionUiRequest = {
  toolUseId: string
  questions: CodexPermissionQuestion[]
  options: Array<PermissionOption & { label: string }>
}

export type CodexPendingPermissionRef = {
  key: string
  subChatId: string
  toolUseId: string
}

export function findCodexPermissionSettlementKey(
  pending: CodexPendingPermissionRef[],
  subChatId: string,
  toolUseId: string,
): string | null {
  const exact = pending.find(
    (entry) => entry.subChatId === subChatId && entry.toolUseId === toolUseId,
  )
  if (exact) return exact.key

  const sameSubChat = pending.filter((entry) => entry.subChatId === subChatId)
  if (sameSubChat.length === 1) return sameSubChat[0].key

  const sameToolUse = pending.filter((entry) => entry.toolUseId === toolUseId)
  if (sameToolUse.length === 1) return sameToolUse[0].key

  return null
}

function describePermissionOptionKind(kind: PermissionOption["kind"]): string {
  switch (kind) {
    case "allow_once":
      return "Allow this operation once."
    case "allow_always":
      return "Allow this operation and remember the choice."
    case "reject_once":
      return "Reject this operation once."
    case "reject_always":
      return "Reject this operation and remember the choice."
  }
}

export function buildCodexPermissionUiRequest(
  request: RequestPermissionRequest,
): CodexPermissionUiRequest {
  const toolCall = request.toolCall
  const title = toolCall.title?.trim() || toolCall.toolCallId
  const options = request.options.map((option) => ({
    ...option,
    label: option.name || option.optionId,
  }))

  return {
    toolUseId: toolCall.toolCallId,
    questions: [
      {
        header: "Codex permission required",
        question: title,
        multiSelect: false,
        options: options.map((option) => ({
          label: option.label,
          description: describePermissionOptionKind(option.kind),
        })),
      },
    ],
    options,
  }
}

export function createSelectedPermissionResponse(
  optionId: string,
): RequestPermissionResponse {
  return {
    outcome: {
      outcome: "selected",
      optionId,
    },
  }
}

export function createDefaultAllowedPermissionResponse(
  request: RequestPermissionRequest,
): RequestPermissionResponse {
  const allowOption =
    request.options.find((option) => option.kind === "allow_once") ??
    request.options.find((option) => option.kind === "allow_always") ??
    request.options[0]

  if (!allowOption) {
    return createCancelledPermissionResponse()
  }

  return createSelectedPermissionResponse(allowOption.optionId)
}

export function createCancelledPermissionResponse(): RequestPermissionResponse {
  return {
    outcome: {
      outcome: "cancelled",
    },
  }
}
