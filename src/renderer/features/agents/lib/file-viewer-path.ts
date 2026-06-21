type SecurityArtifactLocation = {
  filePath: string
  reportPath: string
  projectPath: string
} | null | undefined

function isInsidePath(filePath: string, parentPath: string | null | undefined): boolean {
  if (!parentPath) return false
  const normalizedParent = parentPath.endsWith("/") ? parentPath : `${parentPath}/`
  return filePath === parentPath || filePath.startsWith(normalizedParent)
}

export function resolveFileViewerProjectPath({
  fileViewerPath,
  worktreePath,
  originalProjectPath,
  securityArtifactLocation,
}: {
  fileViewerPath: string | null
  worktreePath: string | null | undefined
  originalProjectPath?: string | null
  securityArtifactLocation?: SecurityArtifactLocation
}): string | null {
  if (!fileViewerPath) return worktreePath || originalProjectPath || null
  if (!fileViewerPath.startsWith("/")) return worktreePath || originalProjectPath || null
  if (
    securityArtifactLocation &&
    (fileViewerPath === securityArtifactLocation.filePath ||
      fileViewerPath === securityArtifactLocation.reportPath)
  ) {
    return securityArtifactLocation.projectPath
  }
  if (isInsidePath(fileViewerPath, worktreePath)) return worktreePath || null
  if (isInsidePath(fileViewerPath, originalProjectPath)) return originalProjectPath || null
  return worktreePath || originalProjectPath || securityArtifactLocation?.projectPath || null
}

export function shouldAutoOpenSecurityArtifact({
  isSecurityRecord,
  isSecurityReport,
}: {
  isSecurityRecord: boolean
  isSecurityReport: boolean
}): boolean {
  return isSecurityRecord && !isSecurityReport
}
