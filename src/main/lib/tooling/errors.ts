export type ToolingErrorCode =
  | "ITEM_NOT_FOUND"
  | "READONLY_ITEM"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_SCOPE"
  | "INVALID_PROVIDER"
  | "NAME_CONFLICT"
  | "INVALID_NAME"
  | "INVALID_PATH"
  | "AUTH_REQUIRED"
  | "PROBE_FAILED"

export class ToolingError extends Error {
  constructor(
    public readonly code: ToolingErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ToolingError"
  }
}
