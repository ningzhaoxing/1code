# 1Code 项目导览：主要功能与业务流转

日期：2026-06-22

## 0. 阅读定位

这份文档按“先产品定位，再架构分层，再主要功能，最后业务流转”的顺序写，目标是帮助后续二开时快速建立全局地图。

当前仓库不是纯上游 1Code，而是一个基于 1Code 的安全漏洞挖掘 PoC 版本。它保留上游的 Agent chat、Claude Code / Codex、worktree、diff、MCP、skills、插件、终端和文件预览等能力，同时新增“漏洞挖掘实时 Markdown 记录 + Markdown 报告导出”的闭环。

## 1. 一句话理解这个项目

1Code 是一个本地优先的 Electron 桌面端 Agent 编程工作台。用户选择一个本地项目，创建一个 chat/workspace，1Code 可以为这个 chat 创建独立 git worktree，然后把用户消息发送给 Claude Code 或 Codex 运行时；运行时的文本、工具调用、文件修改、审批问题、diff、终端和产物文件会回流到桌面端 UI。

本 PoC 的新增业务目标是：当用户发起授权漏洞挖掘任务时，Agent 在执行过程中持续写入 `漏洞挖掘记录.md`，任务收束时生成 `漏洞挖掘报告.md`，1Code 自动在右侧 Markdown 预览器中打开和刷新这些产物。

## 2. 总体架构

### 2.1 三层 Electron 架构

```text
Renderer React UI
  - App / onboarding / layout / active chat / file viewer / terminal / diff
  - 通过 trpc-electron 和 desktopApi 调主进程

Preload IPC bridge
  - exposeElectronTRPC()
  - contextBridge 暴露 desktopApi 和 webUtils

Main Electron process
  - app 生命周期、窗口、鉴权、菜单、更新、协议
  - SQLite + Drizzle
  - tRPC routers
  - 文件系统、git、terminal、Claude SDK、Codex ACP
```

关键入口：

- `src/main/index.ts`：主进程启动、协议、鉴权、数据库初始化、主窗口、自动更新。
- `src/main/windows/main.ts`：窗口创建、原生 IPC、tRPC IPC handler、窗口关闭/刷新时的 active stream 保护。
- `src/preload/index.ts`：暴露 tRPC IPC bridge 和 `window.desktopApi`。
- `src/renderer/App.tsx`：前端根组件，决定 onboarding / 项目选择 / 主工作台展示。
- `src/renderer/features/layout/agents-layout.tsx`：主工作台布局，侧边栏、设置、全局队列、快捷键、窗口状态。
- `src/renderer/features/agents/main/active-chat.tsx`：核心聊天页面，承接消息流、队列、审批、文件预览、diff、terminal、安全挖掘产物。

### 2.2 通信与状态

```text
React component
  -> trpc hooks / trpcClient
  -> trpc-electron ipcLink
  -> main process AppRouter
  -> SQLite / filesystem / git / Claude / Codex
  -> subscription chunks / Electron events
  -> React UI state and persisted messages
```

主要通信入口：

- `src/main/lib/trpc/routers/index.ts` 聚合所有 tRPC router。
- `src/renderer/lib/trpc.ts` 创建 typed React hooks 和 vanilla `trpcClient`。
- `src/renderer/lib/mock-api.ts` 名字仍叫 mock，但桌面端实际包装真实 tRPC，并做消息格式兼容转换。

前端状态大致分三类：

- Jotai：当前项目、当前 chat/subChat、面板开关、模型选择、provider 设置等 UI 状态。
- Zustand：sub-chat tab、消息队列、运行时 Chat 实例、streaming 状态等跨组件状态。
- React Query：tRPC server state 缓存，例如项目、chat、diff、文件内容。

## 3. 核心数据模型

数据库使用 SQLite + Drizzle，数据库文件位于 `{userData}/data/agents.db`。启动时 `initDatabase()` 会打开 SQLite、启用 WAL 和外键，并运行 migrations。

主业务表在 `src/main/lib/db/schema/index.ts`：

```text
projects
  id, name, path
  gitRemoteUrl, gitProvider, gitOwner, gitRepo
  iconPath

chats
  id, name, projectId
  worktreePath, branch, baseBranch
  prUrl, prNumber
  archivedAt

sub_chats
  id, name, chatId
  sessionId
  streamId
  mode: plan | agent
  messages: JSON string
```

理解业务时可以把它们翻译成产品概念：

```text
Project = 用户打开的本地仓库
Chat = 一个 workspace，一般对应一个任务和一个 worktree
SubChat = workspace 内的一个 Agent 会话 tab，可 fork、切换 provider、保存独立 session/messages
```

`sub_chats.messages` 是最重要的持久化字段。用户消息、助手文本、工具调用 parts、tool result、metadata、sessionId 都会被写进这里。UI 再通过 `mock-api.ts` 转换成 AI SDK 和组件期望的结构。

## 4. 主要功能模块

### 4.1 项目与仓库管理

核心文件：

- `src/main/lib/trpc/routers/projects.ts`
- `src/main/lib/trpc/routers/chats.ts`
- `src/main/lib/git/*`

能力：

- 打开本地目录或从 GitHub clone 项目。
- 读取 git remote 信息，保存到 `projects`。
- 创建 chat/workspace，并按配置选择 worktree 模式或 local 模式。
- archive / restore / delete chat。
- 创建 PR、合并 PR、读取 diff、stage/unstage、commit/push 等变更面板能力。

关键点：

- `projects.openFolder` 和 `projects.create` 在项目创建或打开时会调用 `syncDefaultProjectSkills()`。
- `chats.create` 先快速写入 chat 和初始 subChat，再创建 worktree；worktree 失败时回退到项目目录并通知前端。
- worktree 默认放在 `~/.21st/worktrees/<projectSlug>/<generatedFolder>`。

### 4.2 Agent Chat

核心文件：

- `src/renderer/features/agents/main/new-chat-form.tsx`
- `src/renderer/features/agents/main/active-chat.tsx`
- `src/renderer/features/agents/lib/ipc-chat-transport.ts`
- `src/renderer/features/agents/lib/acp-chat-transport.ts`
- `src/main/lib/trpc/routers/claude.ts`
- `src/main/lib/trpc/routers/codex.ts`

能力：

- 新建 chat 时选择 provider、model、plan/agent 模式、worktree/local 模式、base branch。
- 已进入 chat 后，每个 subChat 维护独立 `Chat` 实例和 transport。
- Claude 使用 `IPCChatTransport -> trpc.claude.chat`。
- Codex 使用 `ACPChatTransport -> trpc.codex.chat`。
- 远程 sandbox 场景使用 `RemoteChatTransport`，桌面本地路径主要走 Claude/Codex 两条本地 runtime。

### 4.3 Claude Code 集成

核心文件：

- `src/main/lib/trpc/routers/claude.ts`
- `src/main/lib/claude/*`
- `src/main/lib/claude/stream-completion.ts`

能力：

- 使用 `@anthropic-ai/claude-agent-sdk` 动态导入 `query()`。
- 根据 subChat 创建隔离的 `CLAUDE_CONFIG_DIR`，避免不同 chat 共享同一个 Claude session。
- 从用户 Claude 目录 symlink skills、commands、agents、plugins、settings。
- 合并全局、项目、`.mcp.json`、plugin MCP 配置后传给 SDK。
- plan 模式限制高风险工具，agent 模式使用 bypass permissions。
- `AskUserQuestion` 工具会通过 tRPC chunk 回到 UI 等待用户回答。
- Write/Edit 工具完成后通过 Electron `file-changed` 事件通知前端刷新 diff 和文件预览。
- 流结束后持久化 assistant message、sessionId、streamId，并处理空成功结果 `EMPTY_CLAUDE_RESULT`。

### 4.4 Codex ACP 集成

核心文件：

- `src/main/lib/trpc/routers/codex.ts`
- `src/renderer/features/agents/lib/acp-chat-transport.ts`
- `src/main/lib/codex-permission.ts`
- `src/main/lib/codex-file-change.ts`

能力：

- 使用 `@mcpc-tech/acp-ai-provider` 包装 `codex-acp`。
- `CODEX_HOME` 默认落到 `~/.1code/codex`。
- model 通过 ACP 启动参数传入，例如 `-c model="gpt-5.5"` 和 `-c model_reasoning_effort="high"`。
- provider session 按 subChat 缓存，cwd/model/auth/MCP 指纹变化时重建。
- Codex MCP 通过 Codex CLI 配置解析，再转换成 ACP session 可用的 MCP server 列表。
- Codex tool parts 会被 normalize，方便 UI 复用 Claude tool renderer。
- Codex 文件改动通过工具输入快照识别，然后同样发 `file-changed` 事件。
- 当前 PoC 中 Codex permission handler 默认允许请求，用于让漏洞挖掘不中断；UI approval bridge 仍保留。

### 4.4.1 Codex SDK / ACP / 1Code 时间线对比

这个问题要拆成三条线看：OpenAI 官方 Codex SDK、ACP 协议及其相关包、1Code 本地实际接入。仅从时间线看，不能简单说“1Code 开发时还没有 Codex SDK”，至少 TypeScript 版 Codex SDK 不是这样。

| 时间 | 对象 | 证据 | 说明 |
| --- | --- | --- | --- |
| 2025-09-17 | ACP 协议/仓库 release | GitHub release 页面至少可见 `v0.4.0`，并提到 TypeScript library 改动；`v0.4.1` 在 2025-09-22 加入 unstable model selection。 | ACP 作为协议在 1Code 接入前已经有公开 release。 |
| 2025-10-01 | OpenAI Codex SDK, TypeScript | npm registry: `@openai/codex-sdk` created=`2025-10-01T15:25:12.061Z`，首个 alpha 版本 `0.43.0-alpha.8`。 | TS 版官方 SDK 早于 1Code 的 Codex ACP 接入。 |
| 2025-10-03 | OpenAI Codex SDK, TypeScript | npm registry: `@openai/codex-sdk@0.44.0` published=`2025-10-03T17:02:55.618Z`。 | 说明 2025-10 初已经有非 alpha 后续版本，但不能仅凭 registry 证明当时文档成熟度。 |
| 2025-10-10 | ACP TypeScript SDK | npm registry: `@agentclientprotocol/sdk` created=`2025-10-10T13:18:06.550Z`，首版 `0.4.5`。 | ACP 官方 TS SDK 比 OpenAI Codex TS SDK 晚约 9 天。 |
| 2025-10-20 | ACP -> AI SDK provider | npm registry: `@mcpc-tech/acp-ai-provider` created=`2025-10-20T10:25:44.507Z`，首版 `0.1.9`。 | 这是 1Code 后来用来把 ACP agent 包装成 Vercel AI SDK provider 的关键包。 |
| 2025-10-21 | Codex ACP adapter | npm registry: `@zed-industries/codex-acp` created=`2025-10-21T12:19:03.414Z`，首版 `0.3.1`。 | 这是 1Code 当前普通 Codex chat 使用的 ACP agent 二进制来源。 |
| 2026-01-14 | 1Code 项目初始提交 | `f0c51dc Initial commit: 1Code v0.0.10`。 | 1Code 本身晚于 OpenAI TS SDK 和 ACP 相关 npm 包。 |
| 2026-02-15 | 1Code 接入 Codex ACP | `64fe2c6 Release v0.0.62` 新增 `src/main/lib/trpc/routers/codex.ts`，并在 `package.json` 加入 `@mcpc-tech/acp-ai-provider@^0.2.4`、`@zed-industries/codex-acp@^0.9.2`、`codex:download`。 | 这是本仓库可确认的 Codex ACP 集成起点。 |
| 2026-05-28 | OpenAI Codex SDK, Python | PyPI: `openai-codex@0.1.0b1` uploaded=`2026-05-28T02:55:54.497859Z`。 | 如果讨论 Python SDK，那么它确实晚于 1Code 的 Codex ACP 接入。 |

当前官方文档里的 Codex SDK 定位是“programmatically control local Codex agents”：TS SDK 用 `@openai/codex-sdk` 控制本地 Codex，Python SDK 则通过 JSON-RPC 控制本地 Codex app-server，并带 pinned Codex CLI runtime。ACP 的定位不同，它标准化的是“编辑器/IDE 与 coding agent 之间的通信”，本地 agent 典型形态是 editor 子进程，通过 JSON-RPC over stdio 通信。

因此，这里的历史判断更准确地说：

- 不能说 1Code 接入 Codex ACP 时完全没有 Codex SDK。TS 版 `@openai/codex-sdk` 在 npm 上已经存在。
- 可以说 1Code 接入时，官方 Codex SDK 很可能还没有现在这样的文档成熟度和功能叙述；这一点不能仅凭 registry 证明，只能作为合理推断。
- ACP 及 `codex-acp` 在 2025-10 已经形成一条可直接嵌入 editor/app 的集成链路：ACP protocol -> ACP TS SDK -> `codex-acp` agent -> `acp-ai-provider` -> Vercel AI SDK `streamText()`。
- 1Code 选择 ACP 更像是选了“编辑器/桌面 app 集成协议 + AI SDK provider”路线，而不是因为官方 TS SDK 不存在。
- 如果今天重新评估，官方 Codex SDK 已经值得作为迁移候选；但它不是 drop-in replacement，因为当前代码把 Codex 流、tool parts、session、permission、MCP、file change 都围绕 ACP provider 和 AI SDK stream 组织。

### 4.5 文件预览、diff 和终端

核心文件：

- `src/main/lib/trpc/routers/files.ts`
- `src/renderer/features/file-viewer/*`
- `src/renderer/features/changes/*`
- `src/main/lib/git/*`
- `src/renderer/features/terminal/*`
- `src/main/lib/trpc/routers/terminal.ts`

能力：

- 文件搜索：扫描项目目录，忽略 `.git`、`node_modules`、构建目录等。
- 文件读取：`readTextFile` 限制 2 MB，并识别二进制；图片走 base64。
- 文件监听：`files.watchChanges` 监听项目目录变化，Markdown Viewer 和安全挖掘产物预览会自动 refetch。
- Markdown Viewer：预览/源码切换、复制、下载、在外部编辑器打开。
- diff：桌面端优先用 `chats.getParsedDiff` 读取本地 worktree diff。
- terminal：local 模式按项目路径共享 terminal scope，worktree 模式按 workspace 隔离 terminal scope。

### 4.6 Skills、Agents、MCP、Plugins

核心文件：

- `src/main/lib/agent-skills/default-project-skills.ts`
- `skills/default-project-skills.json`
- `src/main/lib/trpc/routers/skills.ts`
- `src/main/lib/trpc/routers/agents.ts`
- `src/main/lib/trpc/routers/claude-settings.ts`
- `src/main/lib/plugins/*`

当前代码实际行为：

- 默认 skill manifest 当前配置为 `claude-project` 和 `codex-project`。
- `claude-project` 安装到 `<projectPath>/.claude/skills/<skillName>`。
- `codex-project` 安装到 `<projectPath>/.agents/skills/<skillName>`。
- 创建 worktree 时，会先把项目已有 `.claude/skills` 和 `.agents/skills` 复制到 worktree，再对 worktree 执行默认 skill 同步。

注意：

- README 里仍有“用户级 Skill 同步”的表述，但当前 manifest 和代码路径显示实际默认同步目标是项目级。后续如果要改回用户级，应同时修改 manifest、README 和相关测试。
- Claude 运行时通过 `settingSources: ["project", "user"]` 加载 project/user skills。
- Codex 的 skill 读取语义由 Codex runtime 决定，1Code 当前主要负责把 skill 包同步到 `.agents/skills` 或 `~/.1code/codex/skills` 这类目标目录。

## 5. 关键业务流转

### 5.1 应用启动和进入工作台

```text
app.whenReady()
  -> registerProtocol()
  -> initAuthManager()
  -> initAnalytics()
  -> initDatabase()
  -> createMainWindow()
  -> createIPCHandler(createAppRouter(getWindow))
  -> renderer AppContent 判断 onboarding / repo select / AgentsLayout
```

业务解释：

1. 主进程先设置 dev/prod 的 userData 路径，保证开发版和正式版数据隔离。
2. 注册 deep link 协议，处理 21st auth 和 MCP OAuth callback。
3. 初始化 AuthManager，并把 token 写入 Electron persistent session cookie。
4. 初始化 SQLite 数据库和 migrations。
5. 创建 BrowserWindow，并挂载 tRPC IPC handler。
6. 前端 `AppContent` 读取 provider onboarding 状态、CLI 配置、Codex/Claude 集成状态和项目列表。
7. 如果缺 provider 配置，进入 onboarding；如果缺项目，进入 SelectRepo；否则进入 `AgentsLayout`。

### 5.2 打开项目和同步默认 skill

```text
用户选择目录
  -> projects.openFolder / projects.create
  -> getGitRemoteInfo(projectPath)
  -> upsert projects
  -> syncDefaultProjectSkills({ projectPath })
  -> renderer 保存 selectedProject
```

业务解释：

1. 项目路径是业务主锚点，后续 chat/worktree/MCP/skills/file search 都依赖它。
2. 项目创建时会读取 git remote，用于 UI 和 PR/GitHub 相关功能。
3. 默认 skill 同步在项目打开/创建时发生，当前由 `skills/default-project-skills.json` 决定安装目标。
4. 如果是 dev 环境设置了 `VITE_DEFAULT_PROJECT_PATH`，`App.tsx` 可以自动创建或选择默认项目。

### 5.3 新建 chat/workspace

```text
NewChatForm.handleSend()
  -> 组装 initialMessageParts
  -> trpc.chats.create({
       projectId,
       model,
       mode,
       useWorktree,
       baseBranch,
       branchType
     })
  -> insert chats
  -> insert sub_chats with first user message
  -> createWorktreeForChat() 或使用 project.path
  -> 返回 chat + subChat
  -> UI 选中 chat/subChat
```

业务解释：

1. chat 创建是“快速入库 + 后台准备环境”的思路，不阻塞用户太久。
2. 如果选择 worktree，系统会基于 base branch 创建新分支和 worktree。
3. 如果项目不是 git repo，或用户选择 local mode，则直接把 `worktreePath` 设置为项目路径。
4. worktree 创建失败时不会让 chat 创建失败，而是回退项目路径并通过 `worktree:setup-failed` 事件提示用户。
5. 创建 worktree 后会执行 skill 同步和 worktree setup commands，setup 结果异步通知。

### 5.4 已有 chat 内发送消息

```text
ChatInputArea
  -> ChatViewInner.handleSend()
  -> 读取 editor 文本、图片、文件、引用文本、diff 引用、pasted text
  -> 展开自定义 slash command
  -> 如果正在 streaming，写入 message queue
  -> 否则 sendMessage({ role: "user", parts })
  -> AI SDK Chat 调用当前 subChat 的 transport
```

业务解释：

1. 用户输入不是直接发纯文本，而是转换成 AI SDK message parts。
2. 图片保留 base64，文件和 pasted text 会变成 mention 或隐藏 `file-content` part。
3. 选中文本、diff 片段、聊天历史等会被编码进 mention token，让 runtime 侧能拿到上下文。
4. 如果当前 subChat 正在 streaming，新消息进入队列；全局 `QueueProcessor` 会在 stream ready 后继续发送。
5. 首条消息会触发自动重命名 chat/subChat。
6. UI 会乐观更新 chat/subChat 时间戳，让侧边栏排序立即变化。

### 5.5 Claude 消息流

```text
IPCChatTransport.sendMessages()
  -> 提取 prompt / images / sessionId / mode / model
  -> 可选：漏洞挖掘 prompt 注入
  -> trpc.claude.chat.subscribe()
  -> claudeRouter:
       load existing subChat messages
       persist user message + streamId
       build env and isolated CLAUDE_CONFIG_DIR
       merge MCP servers
       query Claude SDK
       transform SDK messages to UI chunks
       accumulate assistant parts
       emit file-changed on Write/Edit
       persist assistant message + sessionId
       emit finish
```

业务解释：

1. Claude route 先把用户消息写入 DB，再启动 SDK，这样 reload 后也能看到用户请求。
2. `CLAUDE_CONFIG_DIR` 按 subChat 隔离，减少同项目多 chat 的 session 污染。
3. 用户级 Claude assets 用 symlink 复用，做到“隔离 session，但复用 skills/commands/agents/plugins/settings”。
4. MCP servers 从全局、项目、`.mcp.json` 和插件来源合并，项目配置优先级更高。
5. plan 模式限制编辑类和危险工具；agent 模式给 Claude 更高执行权限。
6. `AskUserQuestion` 不是普通文本，而是阻塞工具审批，前端回答后通过 `respondToolApproval` 回传。
7. SDK chunk 会被转换成 AI SDK UI chunk，同时 route 侧累积一份可持久化的 assistant message。
8. Write/Edit 工具完成后发 `file-changed`，前端据此刷新 diff、文件预览和漏洞挖掘产物状态。
9. finish chunk 会延后到 DB 保存完成后再发，避免 UI 太早发下一条消息导致持久化覆盖。

### 5.6 Codex 消息流

```text
ACPChatTransport.sendMessages()
  -> 提取 prompt / images / sessionId / selected Codex model
  -> 可选：漏洞挖掘 prompt 注入
  -> trpc.codex.chat.subscribe(runId)
  -> codexRouter:
       load existing subChat messages
       persist user message
       resolve Codex MCP snapshot
       getOrCreateProvider()
       streamText({ model: provider.languageModel(), tools: provider.tools })
       normalize Codex stream chunks
       detect file changes from tool snapshots
       persist responseMessage onFinish
       emit finish
```

业务解释：

1. Codex 使用 ACP provider，不直接调用 Claude SDK 风格的 query。
2. 选择模型时，`gpt-5.5/high` 会拆成 `model` 和 `model_reasoning_effort` 两个 Codex config 参数。
3. `streamText` 里不再传 model ID 给 `provider.languageModel()`，避免触发 ACP `session/set_model` 不支持问题。
4. Codex provider 会按 cwd、model、auth、MCP 指纹缓存；变化时清理并重建。
5. `CODEX_HOME` 默认是 `~/.1code/codex`，用于 Codex sessions 和 runtime config。
6. Codex auth error 会触发前端登录弹窗或一次 fresh session retry。
7. 当前 PoC 中 Codex permission 默认 allow，但 route 里仍保留 `respondToolApproval` 入口。
8. Codex 工具 chunk 形态和 Claude 不完全一致，所以前端/共享 normalizer 会把它整理成 UI 可理解的 `tool-*` parts。

### 5.7 漏洞挖掘实时记录和报告

```text
用户 prompt 命中安全测试关键词
  -> IPCChatTransport / ACPChatTransport
  -> securityMiningRecord.ensure({ chatId, subChatId })
  -> resolveSecurityMiningRecordLocation()
  -> 创建空白 漏洞挖掘记录.md
  -> buildSecurityMiningRuntimePrompt()
  -> 模型按 skill 写记录和报告
  -> Write/Edit 触发 file-changed
  -> active-chat 自动打开右侧 Markdown viewer
  -> 报告存在后，导出报告按钮可打开/下载 漏洞挖掘报告.md
```

触发判断：

- `src/renderer/features/agents/lib/security-mining-record.ts` 中的正则匹配中文和英文安全测试关键词。
- 只有当前 subChat 处于 `agent` 模式时 transport 才会自动启用记录协议。

产物路径优先级：

1. 有真实独立 worktree：`<worktreePath>/漏洞挖掘记录.md` 和 `<worktreePath>/漏洞挖掘报告.md`。
2. 没有真实 worktree，但有项目路径：`<projectPath>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/...`。
3. 项目路径也不可用：`<userData>/security-mining-records/漏洞挖掘-<chatId短ID>-<subChatId短ID>/...`。

职责分工：

- `path.ts` 只负责解析安全产物目录和文件名。
- `security-mining-record.ts` tRPC router 负责 location、ensure、generateReport，并检查路径不逃出允许目录。
- `security-mining-record` skill 负责告诉 Agent 什么时候维护实时记录、什么时候生成最终报告。
- `active-chat.tsx` 负责按钮、自动打开、文件变化监听、报告是否存在的 UI 状态。
- `markdown-viewer.tsx` 负责实际 Markdown 渲染、源码切换和下载。

报告生成有两条路径：

- Agent 自己按 skill 写入 `漏洞挖掘报告.md`，这是当前 PoC 的核心交付路径。
- tRPC `generateReport` 可以基于当前 DB messages、工具调用摘要和实时记录生成确定性 Markdown 汇总。

### 5.8 文件变更、预览和 diff 刷新

```text
Claude/Codex 工具写文件
  -> main process BrowserWindow.webContents.send("file-changed")
  -> renderer useFileChangeListener()
  -> active-chat handleAgentFileChange()
  -> scheduleDiffRefresh()
  -> 如果是漏洞挖掘记录/报告，打开或更新 file viewer
  -> files.watchChanges 也会让 Markdown viewer refetch
```

业务解释：

1. Agent 写文件后，UI 不需要用户手动刷新。
2. 普通文件变更主要刷新 diff 和 changed files。
3. 如果变更文件是 `漏洞挖掘记录.md` 或 `漏洞挖掘报告.md`，会额外更新安全产物状态并打开右侧预览。
4. Markdown Viewer 自己也订阅 `files.watchChanges`，所以文件内容更新后会重新读取。

### 5.9 Archive、删除和终端清理

```text
archive chat
  -> set archivedAt
  -> 如果是 worktree 模式，kill workspace terminal
  -> 可选后台删除 worktree
  -> invalidate git cache

delete chat
  -> 如果有真实 worktree，removeWorktree()
  -> 如果是 worktree 模式，kill terminal
  -> delete chats row
  -> sub_chats cascade delete
```

业务解释：

1. local 模式的 terminal 按项目路径共享，因此 archive/delete 单个 workspace 时不应杀掉共享 terminal。
2. worktree 模式有独立 branch/worktree，archive/delete 时可以按 workspace 清理 terminal。
3. 删除 chat 会触发 DB cascade 删除 subChats。

## 6. 二开时最该先看的文件顺序

如果是从零熟悉项目，建议按这个顺序读：

1. `README.md`：看 PoC 目标和产物路径说明，但注意和 manifest 的 skill 目标差异。
2. `package.json`：看 scripts、Electron build、extraResources、Claude/Codex binary 下载。
3. `src/main/index.ts`：看 app 生命周期。
4. `src/main/windows/main.ts`：看窗口、desktopApi 对应 IPC、tRPC handler。
5. `src/main/lib/db/schema/index.ts`：看业务数据模型。
6. `src/main/lib/trpc/routers/index.ts`：看后端能力总入口。
7. `src/main/lib/trpc/routers/projects.ts` 和 `chats.ts`：看项目、chat、worktree 生命周期。
8. `src/renderer/App.tsx` 和 `features/layout/agents-layout.tsx`：看前端从 onboarding 到主界面的路由。
9. `src/renderer/features/agents/main/new-chat-form.tsx`：看新建 chat。
10. `src/renderer/features/agents/main/active-chat.tsx`：看主业务汇聚点。
11. `src/renderer/features/agents/lib/ipc-chat-transport.ts` 和 `acp-chat-transport.ts`：看 provider transport。
12. `src/main/lib/trpc/routers/claude.ts` 和 `codex.ts`：看运行时执行和持久化。
13. `src/main/lib/security-mining-record/*` 和 `skills/security-mining-record/SKILL.md`：看 PoC 新增业务。
14. `src/renderer/features/file-viewer/*`：看右侧预览器。

## 7. 当前理解中的关键注意点

1. `active-chat.tsx` 是最大复杂度文件。它不是单一聊天组件，而是 chat runtime、sidebars、diff、terminal、queue、approval、security artifact 的汇聚层。改动前最好先按业务流定位局部区域。
2. `mock-api.ts` 不是纯 mock。桌面端许多旧 UI 仍通过它取数，但它背后调用真实 tRPC，并做 DB message 到 UI message 的转换。
3. `sub_chats.messages` 是跨 provider 的事实来源。Claude 和 Codex 的工具 part 形态不同，但最终都要被规范成 UI 可展示、可持久化的 parts。
4. Claude 和 Codex 的 runtime 边界不同。Claude 通过 `CLAUDE_CONFIG_DIR` 做更细的 subChat 隔离；Codex 通过 `CODEX_HOME`、ACP provider session 和 persisted session 管理。
5. 安全挖掘记录不是前端解析 schema 的结构化功能。前端只负责创建/打开/刷新 Markdown，具体内容由 skill 和 Agent 执行过程写入。
6. 当前默认 skill 同步实现和 README 文案有差异。判断真实行为时以 `skills/default-project-skills.json` 和 `default-project-skills.ts` 为准。
7. plan 模式和 agent 模式不只是 UI 标签。Claude route 会按 mode 决定 permissionMode 和工具限制；安全挖掘自动记录只在 agent 模式启用。
8. 文件变更链路同时服务 diff、文件预览和安全产物联动。改 file-changed、watchChanges 或路径解析时要一起考虑这三类消费者。
