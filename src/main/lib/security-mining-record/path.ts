import { join, resolve, sep } from "node:path"

export const SECURITY_MINING_RECORD_SKILL_NAME = "security-mining-record"
export const SECURITY_MINING_RECORD_FILENAME = "漏洞挖掘记录.md"
export const SECURITY_MINING_REPORT_FILENAME = "漏洞挖掘报告.md"
const SECURITY_MINING_ARTIFACT_DIR_PREFIX = "漏洞挖掘"
const SECURITY_MINING_RECORD_ID_LENGTH = 8

export type SecurityMiningRecordStorage = "worktree" | "project" | "userData"

export type SecurityMiningRecordLocation = {
  artifactDir: string
  filePath: string
  projectPath: string
  relativePath: string
  reportPath: string
  reportRelativePath: string
  storage: SecurityMiningRecordStorage
}

export type ResolveSecurityMiningRecordLocationInput = {
  chatId: string
  subChatId: string
  worktreePath?: string | null
  projectPath?: string | null
  userDataPath: string
}

function normalizeOptionalPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")

  return sanitized || "unknown"
}

function shortId(value: string): string {
  return sanitizePathSegment(value).slice(0, SECURITY_MINING_RECORD_ID_LENGTH)
}

export function getSecurityMiningArtifactDirectoryName({
  chatId,
  subChatId,
}: {
  chatId: string
  subChatId: string
}): string {
  return `${SECURITY_MINING_ARTIFACT_DIR_PREFIX}-${shortId(chatId)}-${shortId(subChatId)}`
}

function isDistinctWorktreePath(
  worktreePath: string | null,
  projectPath: string | null,
): worktreePath is string {
  if (!worktreePath) return false
  if (!projectPath) return true
  return resolve(worktreePath) !== resolve(projectPath)
}

function buildLocation(
  artifactDir: string,
  storage: SecurityMiningRecordStorage,
): SecurityMiningRecordLocation {
  return {
    artifactDir,
    filePath: join(artifactDir, SECURITY_MINING_RECORD_FILENAME),
    projectPath: artifactDir,
    relativePath: SECURITY_MINING_RECORD_FILENAME,
    reportPath: join(artifactDir, SECURITY_MINING_REPORT_FILENAME),
    reportRelativePath: SECURITY_MINING_REPORT_FILENAME,
    storage,
  }
}

export function resolveSecurityMiningRecordLocation({
  chatId,
  subChatId,
  worktreePath,
  projectPath,
  userDataPath,
}: ResolveSecurityMiningRecordLocationInput): SecurityMiningRecordLocation {
  const artifactDirectoryName = getSecurityMiningArtifactDirectoryName({
    chatId,
    subChatId,
  })
  const normalizedWorktreePath = normalizeOptionalPath(worktreePath)
  const normalizedProjectPath = normalizeOptionalPath(projectPath)

  if (isDistinctWorktreePath(normalizedWorktreePath, normalizedProjectPath)) {
    return buildLocation(normalizedWorktreePath, "worktree")
  }

  if (normalizedProjectPath) {
    return buildLocation(
      join(normalizedProjectPath, artifactDirectoryName),
      "project",
    )
  }

  return buildLocation(
    join(userDataPath, "security-mining-records", artifactDirectoryName),
    "userData",
  )
}

export function isPathInside(targetPath: string, allowedParent: string): boolean {
  const resolvedTarget = resolve(targetPath)
  const resolvedParent = resolve(allowedParent)
  return (
    resolvedTarget === resolvedParent ||
    resolvedTarget.startsWith(resolvedParent.endsWith(sep) ? resolvedParent : `${resolvedParent}${sep}`)
  )
}

export function createSecurityMiningRecordTemplate(): string {
  return ""
}
