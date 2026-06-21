export const SECURITY_MINING_PROMPT_PATTERN =
  /(security-mining-record|漏洞挖掘记录|漏洞挖掘报告|漏洞挖掘|漏洞扫描|渗透测试|安全测试|靶机|抓包|扫描器|dnslog|burp|nmap|sql\s*注入|xss|ssrf|rce|弱口令|越权|vulnerability|pentest|bug bounty|security testing|finding|evidence)/i

export function shouldUseSecurityMiningRecord(prompt: string): boolean {
  return SECURITY_MINING_PROMPT_PATTERN.test(prompt)
}

export function buildSecurityMiningRuntimePrompt(
  prompt: string,
  record: { filePath?: unknown; reportPath?: unknown } | null | undefined,
): string {
  if (
    typeof record?.filePath !== "string" ||
    record.filePath.length === 0 ||
    typeof record.reportPath !== "string" ||
    record.reportPath.length === 0
  ) {
    return prompt
  }

  return [
    prompt,
    "",
    "本次任务已启用 security-mining-record 产物协议。",
    `请持续维护实时记录文件：${record.filePath}`,
    `任务完成、用户要求导出/收束，或已有信息足以形成最终交付时，请生成最终 Markdown 报告：${record.reportPath}`,
    "如果当前环境可用，请遵循 security-mining-record skill；不要把聊天回复当作最终报告。",
  ].join("\n")
}

export function getSecurityMiningRecordPreviewState(
  record: { filePath?: unknown } | null | undefined,
): { displayMode: "side-peek"; filePath: string } | null {
  return typeof record?.filePath === "string" && record.filePath.length > 0
    ? { displayMode: "side-peek", filePath: record.filePath }
    : null
}
