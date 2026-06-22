import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  normalizeCodexAcpStderrLine,
  parseCodexAcpTransportDiagnostic,
} from "./codex-transport-diagnostic"

describe("parseCodexAcpTransportDiagnostic", () => {
  test("classifies WebSocket fallback timeout stderr", () => {
    const diagnostic = parseCodexAcpTransportDiagnostic(
      "Falling back from WebSockets to HTTPS transport. request timed out\n",
    )

    assert.equal(diagnostic?.code, "websocket_fallback")
    assert.equal(diagnostic?.level, "warning")
    assert.match(diagnostic?.message || "", /HTTPS transport/)
  })

  test("classifies response stream disconnected turn errors", () => {
    const diagnostic = parseCodexAcpTransportDiagnostic(
      '2026-06-22T09:17:51.611416Z ERROR codex_acp::thread: Handled error during turn: Reconnecting... 4/5 Some(ResponseStreamDisconnected { http_status_code: None }) Some("request timed out")',
    )

    assert.equal(diagnostic?.code, "response_stream_disconnected")
    assert.match(diagnostic?.message || "", /request timed out/)
  })

  test("ignores unrelated stderr", () => {
    assert.equal(parseCodexAcpTransportDiagnostic("ordinary stderr line"), null)
  })
})

describe("normalizeCodexAcpStderrLine", () => {
  test("strips ANSI escape sequences", () => {
    assert.equal(
      normalizeCodexAcpStderrLine("\u001B[31mrequest timed out\u001B[0m\n"),
      "request timed out",
    )
  })
})
