import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { getClaudeResultCompletionIssue } from "./stream-completion"

describe("Claude stream completion helpers", () => {
  test("surfaces a successful empty result with only tool parts as incomplete", () => {
    const issue = getClaudeResultCompletionIssue({
      aborted: false,
      resultSubtype: "success",
      resultText: "",
      numTurns: 10,
      currentText: "",
      parts: [{ type: "tool-Bash", state: "result" }],
    })

    assert.match(issue ?? "", /Claude SDK returned an empty successful result/)
    assert.match(issue ?? "", /10 turns/)
  })

  test("does not flag a successful result when final text exists", () => {
    assert.equal(
      getClaudeResultCompletionIssue({
        aborted: false,
        resultSubtype: "success",
        resultText: "",
        currentText: "",
        parts: [{ type: "text", text: "任务已完成。" }],
      }),
      null,
    )
  })

  test("does not flag manually aborted streams", () => {
    assert.equal(
      getClaudeResultCompletionIssue({
        aborted: true,
        resultSubtype: "success",
        resultText: "",
        currentText: "",
        parts: [{ type: "tool-Bash", state: "result" }],
      }),
      null,
    )
  })
})
