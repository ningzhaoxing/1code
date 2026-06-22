# 1Code 中 Claude 与 Codex 的 Skill / MCP 安装方式

本文整理在 1Code 里给 Claude Code 与 Codex 配置 Skill、MCP 的实际方式。重点先放在 1Code 产品内的安装入口；其次说明如果要让 1Code 里的 Codex 使用 Codex 原生 Skill，应按官方 Codex Skill 目录安装。

## 0. 本质：安装到运行时会读取的位置

Skill 和 MCP 不是简单“安装到 1Code 源码里”就会生效。1Code 只是桌面端编排层，真正生效取决于底层运行时在启动会话时读取了哪些本机目录或配置。

可以这样理解：

```text
用户在 1Code 里新增 Skill / MCP
  -> 1Code 写入对应 provider 的本机目录或配置
  -> 1Code 启动 Claude / Codex 会话
  -> Claude / Codex 运行时读取这些目录或配置
  -> 会话中出现 Skill 或 MCP tools
```

但 Claude 和 Codex 的位置不一样：

| 能力 | Claude Code 在 1Code 中的实际位置 | Codex 在 1Code 中的实际位置 |
| --- | --- | --- |
| Skill | 1Code UI 已支持，写入 `~/.claude/skills` 或项目 `.claude/skills` | 1Code UI 当前不支持 Codex Skill；应按 Codex 官方目录放到 `.agents/skills` 或 `$HOME/.agents/skills` |
| MCP | 1Code UI 已支持，写入 `~/.claude.json` 的 global/project MCP 配置 | 1Code UI 已支持，通过 bundled `codex mcp add ...` 写入当前 `CODEX_HOME` 对应的 Codex 配置 |

所以，用户说“本质是扫描用户本地电脑的某个目录”对 Skill 基本正确；对 MCP 更准确的说法是“读取本机配置文件，配置里再指向 MCP server 的命令或 URL”。1Code 的作用是把这些目录和配置写对，并在会话启动时把它们交给对应运行时。

## 1. Claude Code：在 1Code 中安装 Skill

### 1.1 通过 1Code UI 安装

入口：

```text
Settings -> Skills -> New Skill
```

选择 scope：

- `User`：写入 `~/.claude/skills/<skill-name>/SKILL.md`
- `Project`：写入当前项目的 `.claude/skills/<skill-name>/SKILL.md`

1Code 的 `skillsRouter` 当前就是这样扫描和创建 Skill：

- list 时读取 `~/.claude/skills` 与 `<cwd>/.claude/skills`
- create 时写入 `~/.claude/skills` 或 `<cwd>/.claude/skills`

代码依据：

- `src/main/lib/trpc/routers/skills.ts:115-151`
- `src/main/lib/trpc/routers/skills.ts:208-240`

### 1.2 手动安装

用户也可以不走 UI，直接在本机创建：

```bash
mkdir -p "$HOME/.claude/skills/my-skill"
$EDITOR "$HOME/.claude/skills/my-skill/SKILL.md"
```

最小 `SKILL.md`：

```markdown
---
name: my-skill
description: Use this when ...
---

Skill instructions for Claude Code to follow.
```

项目级：

```bash
mkdir -p .claude/skills/my-skill
$EDITOR .claude/skills/my-skill/SKILL.md
```

安装后，在 1Code 聊天输入框里通过 `@` 菜单选择 Skill，或直接插入：

```text
@[skill:my-skill]
```

### 1.3 为什么会在 Claude 会话里生效

1Code 的 Claude 路径有完整闭环：

1. 前端/后端会解析 `@[skill:...]`。
2. Claude router 把 mention 转成 “invoke/use skill” 这类 prompt 指令。
3. 启动 Claude SDK 会话时设置 `settingSources: ["project", "user"]`。
4. 1Code 给每个 subChat 准备隔离 config dir，并把 `~/.claude/skills` symlink 到隔离目录。

代码依据：

- mention 解析与 prompt 改写：`src/main/lib/trpc/routers/claude.ts:1054-1092`
- `~/.claude/skills` symlink：`src/main/lib/trpc/routers/claude.ts:1163-1236`
- `settingSources: ["project", "user"]`：`src/main/lib/trpc/routers/claude.ts:1751-1779`

## 2. Claude Code：在 1Code 中安装 MCP

### 2.1 通过 1Code UI 安装

入口：

```text
Settings -> MCP Servers -> New MCP Server -> Provider: Claude
```

支持：

- `Global`：写入 `~/.claude.json` 根级 `mcpServers`
- `Project`：写入 `~/.claude.json` 的 `projects[projectPath].mcpServers`
- stdio MCP：填写 command、args、env
- HTTP MCP：填写 URL、认证方式等

前端提交 Claude MCP 时会调用 `trpc.claude.addMcpServer`，并带上 `scope`：

- Codex provider 固定 global
- Claude provider 使用 UI 中选择的 `global` 或 `project`

代码依据：

- UI 分流：`src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx:303-324`
- Claude MCP add mutation：`src/main/lib/trpc/routers/claude.ts:2932-3010`
- 写入 `~/.claude.json`：`src/main/lib/claude-config.ts:20-22`
- global/project 写入逻辑：`src/main/lib/claude-config.ts:157-181`

### 2.2 Claude MCP 的读取来源

1Code 不只读一个位置。Claude MCP 会从这些来源合并：

- `~/.claude.json`
- `~/.claude/.claude.json`
- `~/.claude/mcp.json`
- 项目根目录 `.mcp.json`
- enabled Claude plugin 的 MCP 配置

执行 Claude 会话时，1Code 把过滤后的 MCP server 显式传给 Claude SDK 的 `mcpServers` option。

代码依据：

- MCP 来源注释：`src/main/lib/trpc/routers/claude.ts:1272-1273`
- 传给 Claude SDK：`src/main/lib/trpc/routers/claude.ts:1762-1766`

## 3. Codex：在 1Code 中安装 MCP

### 3.1 通过 1Code UI 安装

入口：

```text
Settings -> MCP Servers -> New MCP Server -> Provider: Codex
```

当前限制：

- 只支持 `global` scope。
- 不支持 1Code UI 中的 Codex project-scope MCP。

前端选择 Codex provider 时，会固定提交 `scope: "global"`：

```text
Provider: Codex
  -> trpc.codex.addMcpServer({ scope: "global", ... })
```

后端会组装并执行 bundled Codex CLI：

```bash
codex mcp add <name> --url <url>
codex mcp add <name> -- <command> <args...>
```

代码依据：

- UI 固定 Codex global：`src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx:306-314`
- Codex MCP 只支持 global：`src/main/lib/trpc/routers/codex.ts:1454-1474`
- 后端组装 `codex mcp add ...`：`src/main/lib/trpc/routers/codex.ts:1476-1493`

### 3.2 Codex MCP 实际写到哪里

1Code 不直接写 `~/.codex/config.toml`。它调用 bundled Codex CLI，并设置 `CODEX_HOME`。

默认：

```text
CODEX_HOME=~/.1code/codex
```

如果启动 1Code 的外部环境已经设置了 `CODEX_HOME`，1Code 会沿用该值；否则使用 `~/.1code/codex`。

代码依据：

- 默认 home：`src/main/lib/trpc/routers/codex.ts:141`
- 设置 `env.CODEX_HOME`：`src/main/lib/trpc/routers/codex.ts:268-287`
- bundled Codex CLI：`src/main/lib/trpc/routers/codex.ts:238-260`
- CLI 调用统一使用 `buildBaseCodexEnv()`：`src/main/lib/trpc/routers/codex.ts:383-400`

因此：

```text
1Code 中安装 Codex MCP
  -> bundled codex mcp add ...
  -> 写入当前 CODEX_HOME 对应的 Codex 配置
  -> 默认是 ~/.1code/codex
  -> 后续 1Code 再通过 bundled codex mcp list --json 读取
```

### 3.3 Codex MCP 如何进入会话

Codex 会话启动前，1Code 会执行：

```bash
codex mcp list --json
```

然后把结果转换成 ACP provider session 需要的 `mcpServers`：

```text
codex mcp list --json
  -> mcpServersForSession
  -> createACPProvider({ session: { cwd, mcpServers } })
  -> streamText({ tools: provider.tools })
```

代码依据：

- `codex mcp list --json`：`src/main/lib/trpc/routers/codex.ts:827-838`
- 转换为 session server：`src/main/lib/trpc/routers/codex.ts:862-895`
- 放入 snapshot：`src/main/lib/trpc/routers/codex.ts:933-955`
- 创建 ACP provider：`src/main/lib/trpc/routers/codex.ts:1257-1264`
- 交给 AI SDK tools：`src/main/lib/trpc/routers/codex.ts:1766-1775`

### 3.4 命令行安装到 1Code 使用的 Codex home

如果用户不走 1Code UI，而想手动安装给 1Code 的 Codex 用，需要显式使用 1Code 的 `CODEX_HOME`：

```bash
CODEX_HOME="$HOME/.1code/codex" codex mcp add context7 -- npx -y @upstash/context7-mcp
```

否则，用户终端里的 `codex mcp add ...` 通常会写入默认 `~/.codex`，1Code 默认看不到。

## 4. Codex：在 1Code 中使用 Skill

### 4.1 当前 1Code UI 不支持 Codex Skill 安装

这是最容易混淆的一点：1Code 的 `Settings -> Skills` 当前是 Claude Skill 管理入口，不是 Codex Skill 管理入口。

它会读写：

```text
~/.claude/skills
<cwd>/.claude/skills
enabled Claude plugin skills
```

它不会读写：

```text
$HOME/.agents/skills
<repo>/.agents/skills
CODEX_HOME/skills
~/.codex/skills
```

Codex chat transport 也只是把最终 prompt、cwd、projectPath、model、session、auth、images 发给后端；后端把 prompt 作为普通 user message 传给 `streamText`，没有像 Claude router 一样解析 `@[skill:...]` 并触发 Skill tool。

代码依据：

- Skill router 读写 Claude 路径：`src/main/lib/trpc/routers/skills.ts:115-151`
- Skill create 写 Claude 路径：`src/main/lib/trpc/routers/skills.ts:208-240`
- Codex 会话使用 prompt + provider tools：`src/main/lib/trpc/routers/codex.ts:1766-1775`
- 既有调研结论：`docs/codex-skill-mcp-reuse.md:1147-1336`

### 4.2 给 1Code 的 Codex 使用 Skill 的实际做法

虽然 1Code UI 不支持 Codex Skill 安装，但 Codex 官方支持 Skill。要让 1Code 中的 Codex 有机会使用某个 Skill，应把 Skill 放到 Codex 官方扫描的位置。

用户级安装，最省事：

```bash
mkdir -p "$HOME/.agents/skills/my-skill"
$EDITOR "$HOME/.agents/skills/my-skill/SKILL.md"
```

项目级安装：

```bash
mkdir -p .agents/skills/my-skill
$EDITOR .agents/skills/my-skill/SKILL.md
```

最小 `SKILL.md`：

```markdown
---
name: my-skill
description: Use this when the user wants ...
---

Skill instructions for Codex to follow.
```

然后在 1Code 里使用 Codex provider 新开会话，并在 prompt 里显式调用：

```text
$my-skill

请按这个 skill 执行下面的任务：...
```

如果 skill 没出现或没生效：

1. 重启 1Code。
2. 新建 Codex 会话。
3. 优先使用 `$HOME/.agents/skills`，避免 worktree 导致项目级 `.agents/skills` 不在当前 `cwd` 到 repo root 的扫描路径上。

### 4.3 Codex 官方 Skill 依据

OpenAI Codex manual 当前说明：

- Skill 是包含 `SKILL.md` 的目录。
- `SKILL.md` 必须包含 `name` 和 `description`。
- Codex 可以显式调用 Skill：CLI/IDE 中可用 `/skills` 或输入 `$` mention。
- Codex 可以基于 `description` 隐式选择 Skill。
- Codex 会从 repo、user、admin、system 位置读取 Skill。

官方发现位置：

```text
$CWD/.agents/skills
$CWD/../.agents/skills
$REPO_ROOT/.agents/skills
$HOME/.agents/skills
/etc/codex/skills
Codex system bundled skills
```

官方页面：

- `https://developers.openai.com/codex/skills.md`
- `https://developers.openai.com/codex/codex-manual.md`

本次核对的 manual 行号：

- Agent Skills 基本机制：`codex-manual.md:7396-7412`
- 显式/隐式调用：`codex-manual.md:7414-7421`
- 手动创建 Skill：`codex-manual.md:7423-7448`
- 保存位置：`codex-manual.md:7450-7468`
- curated skill 安装：`codex-manual.md:7485-7498`

## 5. 对照表

| Provider | 能力 | 1Code UI 是否支持安装 | 1Code 安装/读取位置 | 手动安装给 1Code 使用的方式 |
| --- | --- | --- | --- | --- |
| Claude | Skill | 支持 | `~/.claude/skills`、项目 `.claude/skills`、enabled Claude plugin skills | 写入 `~/.claude/skills/<name>/SKILL.md` 或项目 `.claude/skills/<name>/SKILL.md` |
| Claude | MCP | 支持 | `~/.claude.json`，并合并 `~/.claude/.claude.json`、`~/.claude/mcp.json`、项目 `.mcp.json`、plugin MCP | 编辑 `~/.claude.json` 或项目 `.mcp.json`，但推荐走 1Code UI |
| Codex | Skill | 当前不支持 | 1Code UI 不读写 Codex Skill；运行时按官方 Codex 机制扫描 `.agents/skills` 等位置 | 写入 `$HOME/.agents/skills/<name>/SKILL.md` 或 repo `.agents/skills/<name>/SKILL.md`，在 prompt 用 `$name` |
| Codex | MCP | 支持 | 当前 `CODEX_HOME`，默认 `~/.1code/codex` | 走 1Code UI；或 `CODEX_HOME="$HOME/.1code/codex" codex mcp add ...` |

## 6. 结论

1Code 当前已经把 Claude Skill、Claude MCP、Codex MCP 接到了产品 UI。

Codex Skill 还没有接到 1Code 的 Skill UI。用户如果要在“1Code 上使用 Codex”时使用 Skill，当前可行路径是按 Codex 官方目录安装到 `.agents/skills` 或 `$HOME/.agents/skills`，然后在 Codex prompt 中用 `$skill-name` 显式调用。后续如果要产品化，应新增一个 Codex Skill adapter，让 1Code 的 Skills 页面能够按 provider 区分安装位置、扫描目录和 mention 语法。
