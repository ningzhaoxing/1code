import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  normalizeCodexStreamChunk,
  normalizeCodexToolPart,
} from "./codex-tool-normalizer"
import { CODEX_TRANSPORT_DIAGNOSTIC_PART_TYPE } from "./codex-transport-diagnostic"

describe("normalizeCodexStreamChunk", () => {
  test("normalizes Codex ACP proxy Run chunks to Claude-style Bash input", () => {
    const chunk = normalizeCodexStreamChunk({
      type: "tool-input-available",
      toolCallId: "run-1",
      toolName: "acp.acp_provider_agent_dynamic_tool",
      input: {
        toolName: "Run curl -I https://example.com",
        args: {
          command: ["/bin/zsh", "-lc", "curl -I https://example.com"],
        },
      },
    }) as any

    assert.equal(chunk.toolName, "Bash")
    assert.equal(chunk.title, "curl -I https://example.com")
    assert.equal(chunk.input.command, "curl -I https://example.com")
  })

  test("normalizes command-titled Codex shell chunks to Claude-style Bash input", () => {
    const chunk = normalizeCodexStreamChunk({
      type: "tool-input-available",
      toolCallId: "run-2",
      toolName: "curl -sS -I https://example.com",
      input: {
        command: ["/bin/zsh", "-lc", "curl -sS -I https://example.com"],
      },
    }) as any

    assert.equal(chunk.toolName, "Bash")
    assert.equal(chunk.title, "curl -sS -I https://example.com")
    assert.equal(chunk.input.command, "curl -sS -I https://example.com")
  })

  test("normalizes Codex Write chunks to Claude-style Write tool input", () => {
    const chunk = normalizeCodexStreamChunk({
      type: "tool-input-available",
      toolCallId: "write-1",
      toolName: "Write 漏洞挖掘记录.md",
      input: {
        args: {
          path: "/workspace/漏洞挖掘记录.md",
          content: "记录内容",
        },
      },
    }) as any

    assert.equal(chunk.toolName, "Write")
    assert.equal(chunk.input.file_path, "/workspace/漏洞挖掘记录.md")
    assert.equal(chunk.input.content, "记录内容")
  })

  test("normalizes Codex Edit chunks to Claude-style Edit tool input", () => {
    const chunk = normalizeCodexStreamChunk({
      type: "tool-input-available",
      toolCallId: "edit-1",
      toolName: "Edit /workspace/漏洞挖掘报告.md",
      input: {
        args: {
          old_string: "旧内容",
          new_string: "新内容",
        },
      },
    }) as any

    assert.equal(chunk.toolName, "Edit")
    assert.equal(chunk.input.file_path, "/workspace/漏洞挖掘报告.md")
    assert.equal(chunk.input.old_string, "旧内容")
    assert.equal(chunk.input.new_string, "新内容")
  })

  test("passes Codex transport diagnostic data chunks through unchanged", () => {
    const diagnosticChunk = {
      type: CODEX_TRANSPORT_DIAGNOSTIC_PART_TYPE,
      id: "codex-transport-test",
      data: {
        level: "warning",
        code: "websocket_fallback",
        title: "Codex transport fallback",
        message: "WebSocket request timed out; using HTTPS transport.",
        raw: "Falling back from WebSockets to HTTPS transport. request timed out",
        timestamp: "2026-06-22T09:17:51.611Z",
      },
    }

    assert.equal(normalizeCodexStreamChunk(diagnosticChunk), diagnosticChunk)
  })
})

describe("normalizeCodexToolPart", () => {
  test("normalizes persisted Codex ACP proxy parts to Claude-style Bash parts", () => {
    const part = normalizeCodexToolPart({
      type: "tool-acp.acp_provider_agent_dynamic_tool",
      toolCallId: "run-1",
      toolName: "acp.acp_provider_agent_dynamic_tool",
      state: "output-available",
      input: {
        toolName: "Run curl -I https://example.com",
        args: {
          command: ["/bin/zsh", "-lc", "curl -I https://example.com"],
        },
      },
      output: {
        exitCode: 0,
        stdout: "HTTP/2 200",
      },
    }) as any

    assert.equal(part.type, "tool-Bash")
    assert.equal(part.input.command, "curl -I https://example.com")
    assert.equal(part.output.stdout, "HTTP/2 200")
  })

  test("normalizes persisted command-titled Codex shell parts to Claude-style Bash parts", () => {
    const part = normalizeCodexToolPart({
      type: "tool-curl -sS -I https://example.com",
      toolCallId: "run-2",
      state: "result",
      input: {
        command: ["/bin/zsh", "-lc", "curl -sS -I https://example.com"],
      },
      output: {
        stdout: "HTTP/2 200",
        stderr: "",
        exit_code: 0,
      },
    }) as any

    assert.equal(part.type, "tool-Bash")
    assert.equal(part.input.command, "curl -sS -I https://example.com")
    assert.equal(part.output.stdout, "HTTP/2 200")
  })
})
