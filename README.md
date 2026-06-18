# 1Code Security Mining PoC

这是基于 [1Code](https://1code.dev) 二开的安全漏洞挖掘 PoC 版本。目标是在 1Code 桌面端里跑通“Agent 漏洞挖掘 + 实时 Markdown 记录 + Markdown 报告导出”的最小闭环。

本仓库仍保留 1Code 原有的 Agent chat、右侧文件预览器、文件搜索、diff、MCP、skill、终端等能力；新增能力集中在漏洞挖掘过程文档化。

## PoC 新增能力

- **实时记录按钮**：聊天顶部新增“实时记录”，可直接打开当前漏洞挖掘会话的 `漏洞挖掘记录.md`。
- **自动打开右侧预览**：Agent 写入漏洞挖掘记录文件后，右侧 Markdown 预览器会自动打开并刷新。
- **每个会话独立产物目录**：当 chat 没有真实独立 worktree 时，会创建带 chat/subChat 短 ID 的产物目录，避免多个对话文件冲突。
- **外置漏洞挖掘 skill**：仓库只保留一份 skill 安装源，运行时以用户级 Claude skill 目录中的安装结果为准。
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
3. 前端把 `@[skill:security-mining-record]` 和实时记录文件路径注入给模型执行侧。
4. Agent 按 skill 要求，把关键目标、边界、工具结论、发现、证据和用户纠偏写入 `漏洞挖掘记录.md`。
5. Claude Write/Edit 工具产生文件变更事件后，1Code 自动打开右侧 Markdown 预览。
6. 用户点击“导出报告”，后端读取当前 subChat 消息、工具调用、实时记录内容，生成 `漏洞挖掘报告.md`。
7. 报告在右侧 Markdown 预览器打开，可直接下载。

## 关键代码位置

- 路径解析：`src/main/lib/security-mining-record/path.ts`
- Markdown 报告生成：`src/main/lib/security-mining-record/report.ts`
- tRPC 路由：`src/main/lib/trpc/routers/security-mining-record.ts`
- Claude prompt/skill 注入：`src/renderer/features/agents/lib/ipc-chat-transport.ts`
- 聊天顶部按钮与右侧预览联动：`src/renderer/features/agents/main/active-chat.tsx`
- Markdown 下载按钮：`src/renderer/features/file-viewer/components/markdown-viewer.tsx`
- 外置 skill 安装源：`skills/security-mining-record/SKILL.md`
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

### 安装本 PoC 的漏洞挖掘 Skill

仓库中的 skill 文件只是安装源/模板，不是 1Code 运行时自动加载的位置：

```text
skills/security-mining-record/SKILL.md
```

运行 Claude Code 路径验证本 PoC 时，必须先把上面的安装源复制到用户级 Claude skill 目录；否则 `security-mining-record` skill 规则不会生效：

```bash
mkdir -p "$HOME/.claude/skills/security-mining-record"
cp skills/security-mining-record/SKILL.md "$HOME/.claude/skills/security-mining-record/SKILL.md"
```

Windows 下对应目录通常是：

```text
%USERPROFILE%\.claude\skills\security-mining-record\SKILL.md
```

注意：`skills/security-mining-record/SKILL.md` 不会因为存在于源码仓库里就自动生效。1Code 当前 Claude 路径通过 `~/.claude/skills` 和项目 `.claude/skills` 加载 skill；本 PoC 的产品代码只注入 `@[skill:security-mining-record]` 和本次记录文件路径，不在源码中硬编码 skill 内容。因此没有完成用户级安装时，实时记录文件仍可打开，报告也可导出，但 Agent 不会按该 skill 的完整规则持续沉淀过程、证据和发现。

### 安装自己的 Skill

用户自己的 skill 不需要改 1Code 源码，直接安装到用户级 Claude skill 目录即可。推荐目录结构：

```text
~/.claude/skills/<skill-name>/SKILL.md
```

`<skill-name>` 建议使用小写英文、数字和连字符，例如 `security-mining-record`、`my-research-skill`。

macOS / Linux：

```bash
SKILL_NAME="my-research-skill"
mkdir -p "$HOME/.claude/skills/$SKILL_NAME"
$EDITOR "$HOME/.claude/skills/$SKILL_NAME/SKILL.md"
```

Windows PowerShell：

```powershell
$SkillName = "my-research-skill"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills\$SkillName"
notepad "$env:USERPROFILE\.claude\skills\$SkillName\SKILL.md"
```

`SKILL.md` 最小示例：

```markdown
---
name: my-research-skill
description: Guide the agent to collect evidence and maintain a concise research note.
---

When this skill is invoked:

1. Clarify the target and boundary before taking action.
2. Record important findings, evidence, and decisions in the requested file.
3. Keep the note concise and update it whenever new evidence changes the conclusion.
```

安装完成后，在 1Code 对话中通过 `@[skill:my-research-skill]` 引用；也可以在输入框的 `@` 菜单或 Settings 的 Skills 页面查看是否已被识别。若列表未立即刷新，重新打开 `@` 菜单或重新进入 Skills 页面即可。

## 验证命令

```bash
bun test src/main/lib/security-mining-record/path.test.ts src/main/lib/security-mining-record/report.test.ts
bun run build
```

## 当前限制

- 这是 PoC 第一版，报告生成是确定性 Markdown 汇总，不额外调用模型润色。
- 最终报告是 `漏洞挖掘报告.md`，不是 Word/docx。
- 右侧实时文档预览复用 1Code 现有 Markdown 文件预览器。
- 实时记录内容不要求固定 JSON schema，由 skill 引导 Agent 写自然 Markdown。
- Codex provider 的 skill 加载语义和 Claude Code 不完全一致；PoC 优先基于 1Code + Claude Code 路径验证。

## 上游项目

本项目二开自 1Code：

- 官网：[https://1code.dev](https://1code.dev)
- 原能力包括：Claude Code / Codex、worktree、diff 预览、MCP、skills、插件、终端、文件预览、chat fork、plan mode 等。

## License

Apache License 2.0，见 [LICENSE](LICENSE)。
