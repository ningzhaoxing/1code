# 1Code Security Mining PoC

这是基于 [1Code](https://1code.dev) 二开的安全漏洞挖掘 PoC 版本。目标是在 1Code 桌面端里跑通“Agent 漏洞挖掘 + 实时 Markdown 记录 + Markdown 报告导出”的最小闭环。

本仓库仍保留 1Code 原有的 Agent chat、右侧文件预览器、文件搜索、diff、MCP、skill、终端等能力；新增能力集中在漏洞挖掘过程文档化。

## PoC 新增能力

- **实时记录按钮**：聊天顶部新增“实时记录”，可直接打开当前漏洞挖掘会话的 `漏洞挖掘记录.md`。
- **自动打开右侧预览**：Agent 写入漏洞挖掘记录文件后，右侧 Markdown 预览器会自动打开并刷新。
- **每个会话独立产物目录**：当 chat 没有真实独立 worktree 时，会创建带 chat/subChat 短 ID 的产物目录，避免多个对话文件冲突。
- **默认项目 Skill 同步**：仓库保留 skill 安装源和 manifest，创建或打开项目时同步到项目级 Claude / Codex skill 目录。
- **Markdown 报告导出**：点击“导出报告”后，生成 `漏洞挖掘报告.md`，并在右侧 Markdown 预览器打开；右上角下载按钮可下载。
- **报告基于完整链路生成**：最终报告不是简单下载实时记录，而是汇总当前 subChat 的消息链路、工具调用摘要、实时记录内容和产物路径。

## 产物路径规则

真实独立 worktree 场景：

```text
<worktreePath>/漏洞挖掘记录.md
<worktreePath>/漏洞挖掘报告.md
```

没有真实独立 worktree、但能定位项目根目录时：

```text
<projectPath>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘记录.md
<projectPath>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘报告.md
```

项目根目录也不可用时：

```text
<app userData>/security-mining-records/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘记录.md
<app userData>/security-mining-records/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘报告.md
```

## 功能链路

1. 用户在 Agent chat 中发起漏洞挖掘任务。
2. 前端识别安全测试类 prompt，调用 `securityMiningRecord.ensure` 创建空白实时记录文件。
3. 前端把 `security-mining-record` skill 和实时记录文件路径交给模型执行侧。
4. Agent 按 skill 要求，把关键目标、边界、工具结论、发现、证据和用户纠偏写入 `漏洞挖掘记录.md`。
5. 记录文件产生变更后，1Code 自动打开右侧 Markdown 预览。
6. 用户点击“导出报告”，后端读取当前 subChat 消息、工具调用、实时记录内容，生成 `漏洞挖掘报告.md`。
7. 报告在右侧 Markdown 预览器打开，可直接下载。

## 关键代码位置

- 路径解析：`src/main/lib/security-mining-record/path.ts`
- Markdown 报告生成：`src/main/lib/security-mining-record/report.ts`
- tRPC 路由：`src/main/lib/trpc/routers/security-mining-record.ts`
- 实时记录触发与 Claude prompt/skill 注入：`src/renderer/features/agents/lib/ipc-chat-transport.ts`
- 聊天顶部按钮与右侧预览联动：`src/renderer/features/agents/main/active-chat.tsx`
- Markdown 下载按钮：`src/renderer/features/file-viewer/components/markdown-viewer.tsx`
- 默认项目 Skill 同步：`src/main/lib/agent-skills/default-project-skills.ts`、`skills/default-project-skills.json`
- Skill 管理与 Claude / Codex 创建入口：`src/main/lib/trpc/routers/skills.ts`、`src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`
- 漏洞挖掘 skill 包：`skills/security-mining-record/SKILL.md`
- 产品需求说明：`docs/security-mining-live-document-requirements.md`
- UI 原型：`docs/prototypes/security-mining-record-preview.html`

## 启动方式

### macOS

可以直接双击：

```text
start-1code.command
```

或在终端运行：

```bash
bun install
bun run claude:download
bun run codex:download
bun run dev
```

### Windows

可以运行：

```text
start-1code.bat
```

或在终端运行：

```bash
bun install
bun run claude:download
bun run codex:download
bun run dev
```

## Skill 安装

### 默认项目 Skill 同步

仓库中的 skill 文件只是安装源/模板，不是 1Code 运行时自动加载的位置：

```text
skills/security-mining-record/SKILL.md
```

默认随项目同步的 skill 由 manifest 管理：

```text
skills/default-project-skills.json
```

每次创建或打开 1Code 项目时，1Code 会把 manifest 中启用的 skill 同步到该项目目录下。当前 `security-mining-record` 只会同步到项目级目录：

```text
<project>/.claude/skills/security-mining-record/SKILL.md
<project>/.agents/skills/security-mining-record/SKILL.md
```

后续新增默认 skill 不需要改 TypeScript 业务代码：添加一个 skill 包目录，并在 `skills/default-project-skills.json` 里增加一条配置即可。

注意：1Code 只负责把默认 skill 包同步到项目级目录，不在源码中硬编码 skill 内容，也不写入 Claude / Codex 的用户全局 skill 目录。运行时仍由 Claude / Codex 各自读取项目级 skill。

## 验证命令

```bash
bun test src/main/lib/security-mining-record/path.test.ts src/main/lib/security-mining-record/report.test.ts src/main/lib/agent-skills/default-project-skills.test.ts src/main/lib/codex-permission.test.ts
bun run build
```

## 当前限制

- 这是 PoC 第一版，报告生成是确定性 Markdown 汇总，不额外调用模型润色。
- 最终报告是 `漏洞挖掘报告.md`，不是 Word/docx。
- 右侧实时文档预览复用 1Code 现有 Markdown 文件预览器。
- 实时记录内容不要求固定 JSON schema，由 skill 引导 Agent 写自然 Markdown。
- Claude / Codex 的 skill 发现和调用语义由各自 runtime 决定；1Code 只负责按项目目录同步默认 skill 包。

## 上游项目

本项目二开自 1Code：

- 官网：[https://1code.dev](https://1code.dev)
- 原能力包括：Claude Code / Codex、worktree、diff 预览、MCP、skills、插件、终端、文件预览、chat fork、plan mode 等。

## License

Apache License 2.0，见 [LICENSE](LICENSE)。
