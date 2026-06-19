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

export function createCancelledPermissionResponse(): RequestPermissionResponse {
  return {
    outcome: {
      outcome: "cancelled",
    },
  }
}
