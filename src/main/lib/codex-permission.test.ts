import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk"
import {
  buildCodexPermissionUiRequest,
  createCancelledPermissionResponse,
  createDefaultAllowedPermissionResponse,
  createSelectedPermissionResponse,
  findCodexPermissionSettlementKey,
} from "./codex-permission"

describe("codex permission helpers", () => {
  test("builds a single-choice UI request from an ACP permission request", () => {
    const request: RequestPermissionRequest = {
      sessionId: "session-1",
      toolCall: {
        toolCallId: "tool-1",
        title: "Run command",
        rawInput: { cmd: "curl -I https://example.com" },
      },
      options: [
        {
          optionId: "allow_once",
          name: "Allow once",
          kind: "allow_once",
        },
        {
          optionId: "reject_once",
          name: "Reject once",
          kind: "reject_once",
        },
      ],
    }

    const uiRequest = buildCodexPermissionUiRequest(request)

    assert.equal(uiRequest.toolUseId, "tool-1")
    assert.deepEqual(uiRequest.questions, [
      {
        header: "Codex permission required",
        question: "Run command",
        multiSelect: false,
        options: [
          {
            label: "Allow once",
            description: "Allow this operation once.",
          },
          {
            label: "Reject once",
            description: "Reject this operation once.",
          },
        ],
      },
    ])
    assert.deepEqual(
      uiRequest.options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
      })),
      [
        { optionId: "allow_once", label: "Allow once" },
        { optionId: "reject_once", label: "Reject once" },
      ],
    )
  })

  test("creates selected and cancelled ACP permission responses", () => {
    assert.deepEqual(createSelectedPermissionResponse("allow_once"), {
      outcome: { outcome: "selected", optionId: "allow_once" },
    })
    assert.deepEqual(createCancelledPermissionResponse(), {
      outcome: { outcome: "cancelled" },
    })
  })

  test("creates a default allowed response without persisting approval", () => {
    const request: RequestPermissionRequest = {
      sessionId: "session-1",
      toolCall: {
        toolCallId: "tool-1",
        title: "Edit file",
        rawInput: { file_path: "/workspace/漏洞挖掘记录.md" },
      },
      options: [
        {
          optionId: "allow_always",
          name: "Always allow",
          kind: "allow_always",
        },
        {
          optionId: "allow_once",
          name: "Allow once",
          kind: "allow_once",
        },
        {
          optionId: "reject_once",
          name: "Reject once",
          kind: "reject_once",
        },
      ],
    }

    assert.deepEqual(createDefaultAllowedPermissionResponse(request), {
      outcome: { outcome: "selected", optionId: "allow_once" },
    })
  })

  test("finds the pending permission key with safe fallbacks", () => {
    const pending = [
      { key: "chat-a:tool-1", subChatId: "chat-a", toolUseId: "tool-1" },
    ]

    assert.equal(
      findCodexPermissionSettlementKey(pending, "chat-a", "tool-1"),
      "chat-a:tool-1",
    )
    assert.equal(
      findCodexPermissionSettlementKey(pending, "chat-a", "stale-tool-id"),
      "chat-a:tool-1",
    )
    assert.equal(
      findCodexPermissionSettlementKey(pending, "stale-chat-id", "tool-1"),
      "chat-a:tool-1",
    )
    assert.equal(
      findCodexPermissionSettlementKey(
        [
          ...pending,
          { key: "chat-a:tool-2", subChatId: "chat-a", toolUseId: "tool-2" },
        ],
        "chat-a",
        "stale-tool-id",
      ),
      null,
    )
  })
})
