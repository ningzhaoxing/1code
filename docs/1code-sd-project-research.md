# 1Code Security Mining PoC 项目调研

日期：2026-06-19

## 结论

这个项目不是从零做的安全平台，而是在 1Code 桌面端上做的漏洞挖掘 PoC。它复用 1Code 的 Agent chat、worktree、diff、文件预览、终端、MCP、skills、Claude Code 和 Codex 能力，新增的业务闭环是“Agent 执行漏洞挖掘 -> 持续写 Markdown 实时记录 -> 右侧自动预览 -> 导出 Markdown 报告”。

后续二开最小可行方向应该沿着现有 Agent 工作台继续扩展，不要急着另做独立安全大屏。现有代码已经把记录文件、报告文件、skill 注入、文件预览和报告导出串起来了。

## 本地运行状态

- 本地仓库：`/Users/liyuejia/Desktop/1code_sd`
- 开发服务：`bun run dev`
- Renderer URL：`http://localhost:5173/`
- 本地 dev userData：`/Users/liyuejia/Library/Application Support/1Code-Security-Mining-Dev`
- 已绕过本地 1Code 登录：`MAIN_VITE_BYPASS_AUTH=1`
- 已绕过 provider onboarding：`VITE_BYPASS_PROVIDER_ONBOARDING=1`
- 默认打开项目：`VITE_DEFAULT_PROJECT_PATH=/Users/liyuejia/Desktop/1code_sd`
- DevTools 默认关闭：`MAIN_VITE_DISABLE_DEVTOOLS=1`

## 产品能力

原 1Code 能力：

- Agent chat，多 subChat，多窗口。
- Claude Code 和 Codex 两类 provider。
- Plan / Agent 模式。
- worktree 隔离，分支选择，diff 预览，提交和 PR 相关能力。
- 文件搜索、文件预览、Markdown 预览、Monaco 源码查看。
- 终端、MCP、skills、commands、plugins。
- 本地 SQLite 保存 projects/chats/subChats/账号状态。

本 PoC 新增能力：

- 自动识别安全测试类 prompt。
- 自动创建 `漏洞挖掘记录.md`。
- 自动把 `@[skill:security-mining-record]`、记录文件路径和最终报告路径注入 Claude / Codex prompt。
- Agent 写入记录后，右侧 Markdown 预览自动打开并刷新。
- 顶部“实时记录”按钮可手动打开记录文件。
- 漏洞挖掘 skill 在任务完成后指导 Agent 写入 `漏洞挖掘报告.md`。
- 报告不是简单复制实时记录，而是基于完整执行链路、工具调用、审批/纠偏、证据文件和实时记录生成。

## 架构

```text
Electron main
  - auth / window / app lifecycle
  - SQLite + Drizzle
  - tRPC routers
  - Claude SDK / Codex ACP / MCP / git / file / terminal

preload
  - exposeElectronTRPC()
  - desktopApi bridge

renderer
  - React + Jotai + React Query + tRPC IPC client
  - Agent workspace UI
  - file viewer / markdown viewer / diff / terminal
```

关键目录：

- `src/main/index.ts`：主进程入口、auth callback、数据库初始化、窗口创建。
- `src/main/windows/main.ts`：窗口、IPC handler、tRPC handler、DevTools。
- `src/preload/index.ts`：tRPC IPC bridge 和桌面 API。
- `src/main/lib/trpc/routers/*`：主进程能力入口。
- `src/renderer/features/agents/*`：聊天工作台主体。
- `src/renderer/features/file-viewer/*`：右侧文件预览。
- `src/main/lib/db/schema/index.ts`：projects/chats/subChats/Claude 账号等表。

## 安全挖掘链路

1. 用户在 Agent 输入安全测试类任务。
2. `security-mining-record.ts` 用关键词识别安全场景。
3. 前端调用 `securityMiningRecord.ensure`。
4. 主进程根据 chat/subChat/worktree/project/userData 解析产物目录。
5. 前端把原 prompt 改写为：原任务 + `@[skill:security-mining-record]` + 记录文件绝对路径 + 最终报告绝对路径。
6. Claude Code 或 Codex 执行任务并按 skill 持续写 `漏洞挖掘记录.md`。
7. Agent 写文件触发 file-changed 事件。
8. `active-chat.tsx` 识别记录文件路径，打开右侧 Markdown viewer。
9. 任务完成后，skill 指导 Agent 基于完整链路和实时记录写出 `漏洞挖掘报告.md`。
10. `active-chat.tsx` 识别报告文件后打开右侧 Markdown viewer，并显示顶部报告入口。

关键代码：

- `src/main/lib/security-mining-record/path.ts`
- `src/main/lib/security-mining-record/report.ts`
- `src/main/lib/trpc/routers/security-mining-record.ts`
- `src/renderer/features/agents/lib/ipc-chat-transport.ts`
- `src/renderer/features/agents/main/active-chat.tsx`
- `src/renderer/features/file-viewer/components/markdown-viewer.tsx`
- `skills/security-mining-record/SKILL.md`

## 产物路径规则

有真实独立 worktree：

```text
<worktreePath>/漏洞挖掘记录.md
<worktreePath>/漏洞挖掘报告.md
```

没有独立 worktree，但有项目根目录：

```text
<projectPath>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘记录.md
<projectPath>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘报告.md
```

项目根目录不可用：

```text
<userData>/security-mining-records/漏洞挖掘-<chatId短ID>-<subChatId短ID>/
```

## Claude Code 路径

Claude 路径不是直接跑用户 PATH 里的 `claude`。项目用 `@anthropic-ai/claude-agent-sdk`，并指定 bundled Claude binary：

```text
resources/bin/darwin-arm64/claude
```

1Code 会为 subChat 建隔离 Claude config，但用户级 `~/.claude/skills` 会被复用。本 PoC 的 Claude skill 安装到：

```text
~/.claude/skills/security-mining-record/SKILL.md
```

本地为兼容已有 Claude Code 登录态，后端在没有 1Code 内部 OAuth token 时会 fallback 到系统 Claude Code token。

## Codex 路径

Codex 普通聊天不直接 spawn `codex`，而是：

```text
@mcpc-tech/acp-ai-provider
  -> @zed-industries/codex-acp
  -> Vercel AI SDK streamText
```

bundled Codex CLI 主要用于登录状态和 MCP 配置。项目默认 `CODEX_HOME=~/.1code/codex`，本地已把它链接到现有 Codex 配置：

```text
~/.1code/codex/auth.json -> ~/.codex/auth.json
~/.1code/codex/config.toml -> ~/.codex/config.toml
```

本 PoC 的 Codex skill 默认同步到用户级目录，不写入项目级 `.agents/skills`：

```text
~/.agents/skills/security-mining-record/SKILL.md
~/.1code/codex/skills/security-mining-record/SKILL.md
```

当前 `resources/bin/darwin-arm64/codex` 链接到桌面 Codex app 的 CLI：

```text
/Applications/Codex.app/Contents/Resources/codex
```

## 当前限制

- 安全场景识别是关键词匹配，不是明确任务类型。
- 实时记录是自然 Markdown，没有 Finding schema。
- 报告生成是确定性汇总，不调用模型二次润色。
- Codex skill 语义不如 Claude 路径完整；PoC 优先验证 Claude Code。
- 本地 dev 登录绕过只适合开发环境，不应进入生产包。
- MCP warmup 会读取用户现有 MCP 配置，缺 jar 或缺 Java 的 MCP 会报错，但不影响主应用启动。

## 二开建议

短期优先做三件事：

1. 把“安全挖掘任务”从关键词识别改成显式模式或按钮，避免误触发。
2. 给 `漏洞挖掘记录.md` 增加可选 Finding 约定，但不要一开始强制 JSON schema。
3. 把报告导出升级为“记录 + 聊天链路 + 证据文件索引 + 模型润色”的可控流程。

不建议一开始做独立安全大屏。当前信息源还没结构化，先把 Agent 执行和证据沉淀跑稳定更重要。
