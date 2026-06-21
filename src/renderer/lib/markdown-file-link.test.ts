import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  getLocalMarkdownFilePathFromHref,
  getLocalMarkdownFilePathFromLink,
} from "./markdown-file-link"

describe("getLocalMarkdownFilePathFromHref", () => {
  test("extracts local Markdown file paths", () => {
    assert.equal(
      getLocalMarkdownFilePathFromHref("/repo/漏洞挖掘记录.md"),
      "/repo/漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref("漏洞挖掘记录.md"),
      "漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref("file:///repo/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E8%AE%B0%E5%BD%95.md"),
      "/repo/漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref(
        "http://localhost:5173/Users/ningzhaoxing/Desktop/workspace/1code_preview/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E8%AE%B0%E5%BD%95.md",
      ),
      "/Users/ningzhaoxing/Desktop/workspace/1code_preview/漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref(
        "http://localhost:5173/Users/ningzhaoxing/Desktop/workspace/1code_preview/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E8%AE%B0%E5%BD%95.md:1",
      ),
      "/Users/ningzhaoxing/Desktop/workspace/1code_preview/漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref(
        "localhost:5173/Users/ningzhaoxing/Desktop/workspace/1code_preview/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E8%AE%B0%E5%BD%95.md:1",
      ),
      "/Users/ningzhaoxing/Desktop/workspace/1code_preview/漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref(
        "http://localhost:5173/@fs/Users/ningzhaoxing/Desktop/workspace/1code_preview/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E8%AE%B0%E5%BD%95.md",
      ),
      "/Users/ningzhaoxing/Desktop/workspace/1code_preview/漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref(
        "http://127.0.0.1:5173/C:/Users/me/project/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E6%8A%A5%E5%91%8A.md",
      ),
      "C:/Users/me/project/漏洞挖掘报告.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref(
        "http://localhost:5173/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E8%AE%B0%E5%BD%95.md",
      ),
      "漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref(
        "http://localhost:5173/%E6%BC%8F%E6%B4%9E%E6%8C%96%E6%8E%98%E6%8A%A5%E5%91%8A.md/",
      ),
      "漏洞挖掘报告.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromHref("漏洞挖掘记录.md:12"),
      "漏洞挖掘记录.md",
    )
  })

  test("ignores external links and non-Markdown paths", () => {
    assert.equal(getLocalMarkdownFilePathFromHref("https://example.com/report.md"), null)
    assert.equal(getLocalMarkdownFilePathFromHref("http://example.com/report.md"), null)
    assert.equal(getLocalMarkdownFilePathFromHref("mailto:security@example.com"), null)
    assert.equal(getLocalMarkdownFilePathFromHref("/repo/evidence.png"), null)
  })

  test("uses link text when a local Markdown filename was parsed as a URL host", () => {
    assert.equal(
      getLocalMarkdownFilePathFromLink({
        href: "http://xn--6kq63ex6r2tdusa807bngdkq3f.md/",
        text: "漏洞挖掘记录.md",
      }),
      "漏洞挖掘记录.md",
    )
    assert.equal(
      getLocalMarkdownFilePathFromLink({
        href: "https://example.com/report.md",
        text: "漏洞挖掘报告.md",
      }),
      null,
    )
  })
})
