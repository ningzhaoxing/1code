import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  resolveFileViewerProjectPath,
  shouldAutoOpenSecurityArtifact,
} from "./file-viewer-path"

describe("resolveFileViewerProjectPath", () => {
  test("uses the security artifact project path for known generated files", () => {
    assert.equal(
      resolveFileViewerProjectPath({
        fileViewerPath: "/repo/artifacts/漏洞挖掘记录.md",
        worktreePath: "/repo/worktree",
        originalProjectPath: "/repo/project",
        securityArtifactLocation: {
          filePath: "/repo/artifacts/漏洞挖掘记录.md",
          reportPath: "/repo/artifacts/漏洞挖掘报告.md",
          projectPath: "/repo/artifacts",
        },
      }),
      "/repo/artifacts",
    )
  })

  test("uses the original project path for absolute links outside the worktree", () => {
    assert.equal(
      resolveFileViewerProjectPath({
        fileViewerPath: "/repo/project/漏洞挖掘记录.md",
        worktreePath: "/repo/worktree",
        originalProjectPath: "/repo/project",
      }),
      "/repo/project",
    )
  })
})

describe("shouldAutoOpenSecurityArtifact", () => {
  test("auto-opens the live vulnerability record but not the final report", () => {
    assert.equal(
      shouldAutoOpenSecurityArtifact({
        isSecurityRecord: true,
        isSecurityReport: false,
      }),
      true,
    )
    assert.equal(
      shouldAutoOpenSecurityArtifact({
        isSecurityRecord: false,
        isSecurityReport: true,
      }),
      false,
    )
  })
})
