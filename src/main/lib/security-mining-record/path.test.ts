import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { join } from "node:path"
import {
  SECURITY_MINING_RECORD_FILENAME,
  SECURITY_MINING_REPORT_FILENAME,
  createSecurityMiningRecordTemplate,
  getSecurityMiningArtifactDirectoryName,
  isPathInside,
  resolveSecurityMiningRecordLocation,
} from "./path"

describe("resolveSecurityMiningRecordLocation", () => {
  test("prefers the current worktree path", () => {
    const result = resolveSecurityMiningRecordLocation({
      chatId: "chat-1",
      subChatId: "sub-1",
      worktreePath: "/repo/worktree",
      projectPath: "/repo/project",
      userDataPath: "/app/user-data",
    })

    assert.deepEqual(result, {
      artifactDir: "/repo/worktree",
      filePath: join("/repo/worktree", SECURITY_MINING_RECORD_FILENAME),
      projectPath: "/repo/worktree",
      relativePath: SECURITY_MINING_RECORD_FILENAME,
      reportPath: join("/repo/worktree", SECURITY_MINING_REPORT_FILENAME),
      reportRelativePath: SECURITY_MINING_REPORT_FILENAME,
      storage: "worktree",
    })
  })

  test("falls back to a chat-specific project artifact directory when the worktree path is missing", () => {
    const result = resolveSecurityMiningRecordLocation({
      chatId: "chat-1",
      subChatId: "sub-1",
      worktreePath: null,
      projectPath: "/repo/project",
      userDataPath: "/app/user-data",
    })
    const expectedArtifactDir = join("/repo/project", "漏洞挖掘-chat-1-sub-1")

    assert.deepEqual(result, {
      artifactDir: expectedArtifactDir,
      filePath: join(expectedArtifactDir, SECURITY_MINING_RECORD_FILENAME),
      projectPath: expectedArtifactDir,
      relativePath: SECURITY_MINING_RECORD_FILENAME,
      reportPath: join(expectedArtifactDir, SECURITY_MINING_REPORT_FILENAME),
      reportRelativePath: SECURITY_MINING_REPORT_FILENAME,
      storage: "project",
    })
  })

  test("uses a chat-specific project artifact directory when worktree path is only the project path fallback", () => {
    const result = resolveSecurityMiningRecordLocation({
      chatId: "chat-1",
      subChatId: "sub-1",
      worktreePath: "/repo/project",
      projectPath: "/repo/project",
      userDataPath: "/app/user-data",
    })
    const expectedArtifactDir = join("/repo/project", "漏洞挖掘-chat-1-sub-1")

    assert.equal(result.artifactDir, expectedArtifactDir)
    assert.equal(result.filePath, join(expectedArtifactDir, SECURITY_MINING_RECORD_FILENAME))
    assert.equal(result.reportPath, join(expectedArtifactDir, SECURITY_MINING_REPORT_FILENAME))
    assert.equal(result.storage, "project")
  })

  test("falls back to a 1Code userData directory when no project path is available", () => {
    const result = resolveSecurityMiningRecordLocation({
      chatId: "chat-1",
      subChatId: "sub-1",
      worktreePath: "",
      projectPath: undefined,
      userDataPath: "/app/user-data",
    })

    const expectedProjectPath = join(
      "/app/user-data",
      "security-mining-records",
      "漏洞挖掘-chat-1-sub-1",
    )
    assert.deepEqual(result, {
      artifactDir: expectedProjectPath,
      filePath: join(expectedProjectPath, SECURITY_MINING_RECORD_FILENAME),
      projectPath: expectedProjectPath,
      relativePath: SECURITY_MINING_RECORD_FILENAME,
      reportPath: join(expectedProjectPath, SECURITY_MINING_REPORT_FILENAME),
      reportRelativePath: SECURITY_MINING_REPORT_FILENAME,
      storage: "userData",
    })
  })

  test("sanitizes fallback directory segments", () => {
    const result = resolveSecurityMiningRecordLocation({
      chatId: "../chat:1",
      subChatId: "sub/1",
      userDataPath: "/app/user-data",
    })

    assert.equal(
      result.projectPath,
      join("/app/user-data", "security-mining-records", "漏洞挖掘-chat-1-sub-1"),
    )
    assert.equal(result.storage, "userData")
  })
})

describe("security mining record helpers", () => {
  test("uses Markdown for the final report artifact", () => {
    assert.equal(SECURITY_MINING_REPORT_FILENAME, "漏洞挖掘报告.md")
  })

  test("detects whether a path is inside an allowed parent directory", () => {
    assert.equal(isPathInside("/repo/project/漏洞挖掘-chat-1-sub-1/漏洞挖掘记录.md", "/repo/project"), true)
    assert.equal(isPathInside("/repo/project", "/repo/project"), true)
    assert.equal(isPathInside("/repo/project-other/漏洞挖掘-chat-1-sub-1/漏洞挖掘记录.md", "/repo/project"), false)
  })

  test("creates an empty initial Markdown file for agent-maintained notes", () => {
    const template = createSecurityMiningRecordTemplate()

    assert.equal(template, "")
  })

  test("creates an artifact directory name with stable chat and sub-chat id suffixes", () => {
    assert.equal(
      getSecurityMiningArtifactDirectoryName({
        chatId: "chat_1234567890abcdef",
        subChatId: "../sub:abcdef9876543210",
      }),
      "漏洞挖掘-chat_123-sub-abcd",
    )
  })
})
