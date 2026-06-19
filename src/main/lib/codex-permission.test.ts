import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk"
import {
  buildCodexPermissionUiRequest,
  createCancelledPermissionResponse,
  createSelectedPermissionResponse,
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
})
