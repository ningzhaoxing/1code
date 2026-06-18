# 1Code 中 Claude Code 的 Skill 与 MCP 复用路径

本文整理 1Code 桌面端对 Claude Code binary、Skill、MCP 的完整支持链路。结论先行：

- 1Code 运行 Claude 时使用的是项目下载并随 App 打包的 Claude Code binary，而不是直接依赖用户 PATH 里的 `claude`。
- 1Code 为每个 subChat 创建隔离的 Claude config 目录，主要隔离会话/session 状态。
- User 级 Skill、Command、Agent、Plugin、`settings.json` 不是重新安装一份，而是从本机 `~/.claude` symlink 到隔离目录。
- 在 OneCode 里安装 User Skill 会写入本机 `~/.claude/skills`；安装 Project Skill 会写入项目 `.claude/skills`。
- 在 OneCode 里安装 Claude MCP 会写入本机 `~/.claude.json` 的 global/project MCP 配置。
- MCP 不是简单靠 symlink 自动继承，而是由 1Code 主动读取本机、项目、插件 MCP 配置，合并、过滤、刷新 token 后显式传给 Claude SDK。

## 0. 1Code 与 Claude Code 的交互模块总览

这一节单独说明 1Code 和 Claude Code 之间“怎么交互”。这里的 Claude Code 不是用户 PATH 里的 `claude`，而是 1Code 打包进 App 的 Claude binary；1Code 通过 `@anthropic-ai/claude-agent-sdk` 调用它，并把 SDK 事件转换为前端 UI 流。

### 0.1 交互方法：Claude Agent SDK + bundled Claude binary

1Code 的 Claude 路由不是直接 `spawn claude` 后解析终端文本，而是动态导入 Claude Agent SDK，并缓存 `query` 方法：

代码位置：`src/main/lib/trpc/routers/claude.ts:248`

```ts
let cachedClaudeQuery:
  | typeof import("@anthropic-ai/claude-agent-sdk").query
  | null = null
const getClaudeQuery = async () => {
  ...
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeQuery = sdk.query
  return cachedClaudeQuery
}
```

会话启动前，后端先定位 bundled Claude binary：

代码位置：`src/main/lib/trpc/routers/claude.ts:1447`

```ts
// Get bundled Claude binary path
const claudeBinaryPath = getBundledClaudeBinaryPath()
```

然后把这个 binary 路径放进 SDK options：

代码位置：`src/main/lib/trpc/routers/claude.ts:1981`

```ts
// Use bundled binary
pathToClaudeCodeExecutable: claudeBinaryPath,
```

最后通过 SDK 的 `query` 建立 Claude Code 会话流：

代码位置：`src/main/lib/trpc/routers/claude.ts:2021`

```ts
// 5. Run Claude SDK
stream = claudeQuery(queryOptions)
```

闭环：

```text
1Code Renderer
  -> trpcClient.claude.chat.subscribe(...)
  -> Claude router 组装 queryOptions
  -> getBundledClaudeBinaryPath()
  -> pathToClaudeCodeExecutable
  -> claudeQuery(queryOptions)
  -> Claude SDK 启动 bundled Claude Code binary
```

### 0.2 普通聊天：前端订阅 tRPC，后端消费 SDK stream

前端 Claude transport 通过 tRPC subscription 发起聊天请求，传入 `subChatId/chatId/prompt/cwd/projectPath/mode/sessionId/model/customConfig` 等字段：

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:236`

```ts
const sub = trpcClient.claude.chat.subscribe(
  {
    subChatId: this.config.subChatId,
    chatId: this.config.chatId,
    prompt,
    cwd: this.config.cwd,
    projectPath: this.config.projectPath,
    mode: currentMode,
    sessionId,
    ...
  },
```

后端拿到 SDK stream 后，用 `for await` 逐条读取 Claude SDK 消息：

代码位置：`src/main/lib/trpc/routers/claude.ts:2060`

```ts
for await (const msg of stream) {
  if (abortController.signal.aborted) {
    break
  }
  ...
}
```

读取到的 SDK 消息不是原样给前端，而是经过 transformer 转成 1Code UI 使用的 `UIMessageChunk`：

代码位置：`src/main/lib/trpc/routers/claude.ts:2321`

```ts
// Transform and emit + accumulate
for (const chunk of transform(msg)) {
```

transformer 的职责包括文本块、工具调用、thinking、usage、嵌套工具等格式转换：

代码位置：`src/main/lib/claude/transform.ts:3`

```ts
export function createTransformer(options?: { isUsingOllama?: boolean }) {
```

前端收到 chunk 后写入 `ReadableStream`，再由聊天 UI 消费：

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:482`

```ts
controller.enqueue(chunk)
```

闭环：

```text
用户发送消息
  -> ipc-chat-transport 订阅 claude.chat
  -> Claude router 调 Claude Agent SDK
  -> for await 读取 Claude SDK message
  -> createTransformer(msg) 转 UIMessageChunk
  -> controller.enqueue(chunk)
  -> 前端聊天消息、工具状态、metadata 更新
```

### 0.3 Skill 与 MCP 如何进入会话

Skill 进入 Claude 会话有两条链路：

- 配置目录层面：1Code 为 subChat 创建隔离 config 目录，再把本机 `~/.claude/skills` symlink 到隔离目录，详见本文第 3 节。
- SDK options 层面：非 Ollama 模式下，1Code 设置 `settingSources: ["project", "user"]`，让 Claude Code 加载 project/user 级配置。

代码位置：`src/main/lib/trpc/routers/claude.ts:1776`

```ts
// Load skills from project and user directories (skip for Ollama - not supported)
...(!isUsingOllama && {
  settingSources: ["project" as const, "user" as const],
}),
```

MCP 进入会话是另一条链路：1Code 先读取、合并、过滤、刷新 MCP 配置，得到 `mcpServersFiltered`，再显式传给 Claude SDK：

代码位置：`src/main/lib/trpc/routers/claude.ts:1762`

```ts
// Pass filtered MCP servers (only working/unknown ones, skip failed/needs-auth)
...(mcpServersFiltered &&
  Object.keys(mcpServersFiltered).length > 0 && {
    mcpServers: mcpServersFiltered,
  }),
```

所以 Claude 会话里的 Skill/MCP 不是前端临时拼 prompt 完成的，而是进入 Claude Code runtime 的配置加载和 SDK `mcpServers` 参数。

### 0.4 中断、取消与恢复

Claude 会话的取消由后端 `activeSessions` 保存每个 `subChatId` 对应的 `AbortController`：

代码位置：`src/main/lib/trpc/routers/claude.ts:261`

```ts
// Active sessions for cancellation
const activeSessions = new Map<string, AbortController>()
```

前端或系统调用 `cancel` mutation 时，后端会 abort 当前 controller，并清理等待中的审批：

代码位置：`src/main/lib/trpc/routers/claude.ts:2861`

```ts
const controller = activeSessions.get(input.subChatId)
if (controller) {
  controller.abort()
  activeSessions.delete(input.subChatId)
  clearPendingApprovals("Session cancelled.", input.subChatId)
}
```

SDK stream 消费循环会检查 abort 信号，收到中断后跳出：

代码位置：`src/main/lib/trpc/routers/claude.ts:2060`

```ts
for await (const msg of stream) {
  if (abortController.signal.aborted) {
    break
  }
```

恢复依赖 Claude SDK session id。后端从已有消息或输入中拿 `sessionId`：

代码位置：`src/main/lib/trpc/routers/claude.ts:1450`

```ts
const resumeSessionId =
  input.sessionId || existingSessionId || undefined
```

然后把它传入 SDK 的 `resume`/`continue`/`resumeSessionAt`/`forkSession` 选项：

代码位置：`src/main/lib/trpc/routers/claude.ts:1985`

```ts
...(resumeSessionId && {
  resume: resumeSessionId,
  ...(shouldForkResume && forkResumeAtUuid && !isUsingOllama
    ? {
        resumeSessionAt: forkResumeAtUuid,
        forkSession: true,
      }
    : resumeAtUuid && !isUsingOllama
      ? { resumeSessionAt: resumeAtUuid }
      : { continue: true }),
}),
```

后端也会从 SDK message 中记录 `session_id` 和 assistant `uuid`，用于后续恢复、回滚、fork：

代码位置：`src/main/lib/trpc/routers/claude.ts:2280`

```ts
if (msgAny.session_id) {
  metadata.sessionId = msgAny.session_id
  currentSessionId = msgAny.session_id
}

if (msgAny.type === "assistant" && msgAny.uuid) {
  lastAssistantUuid = msgAny.uuid
}
```

闭环：

```text
取消：
  cancel(subChatId)
  -> activeSessions[subChatId].abort()
  -> SDK stream loop 看到 abort
  -> 清理 pending approvals

恢复：
  前端/DB 保存 sessionId
  -> 下一次 claude.chat 带 sessionId
  -> queryOptions.resume / continue / resumeSessionAt / forkSession
  -> Claude SDK 从对应 Claude session 恢复
```

### 0.5 审批与权限控制

Claude 的审批能力主要通过 SDK 的 `canUseTool` hook 接入 1Code harness。

普通 agent 模式下，1Code 设置 `bypassPermissions`，并开启跳过权限：

代码位置：`src/main/lib/trpc/routers/claude.ts:1768`

```ts
permissionMode:
  input.mode === "plan"
    ? ("plan" as const)
    : ("bypassPermissions" as const),
...(input.mode !== "plan" && {
  allowDangerouslySkipPermissions: true,
}),
```

plan 模式下，`canUseTool` 会阻止非 Markdown 的写入、阻止 `ExitPlanMode` 自动执行、阻止一组 plan mode 禁用工具：

代码位置：`src/main/lib/trpc/routers/claude.ts:1864`

```ts
if (input.mode === "plan") {
  if (toolName === "Edit" || toolName === "Write") {
    ...
  } else if (toolName == "ExitPlanMode") {
    return {
      behavior: "deny",
      message: `IMPORTANT: DONT IMPLEMENT THE PLAN UNTIL THE EXPLIT COMMAND...`,
    }
  } else if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
    return {
      behavior: "deny",
      message: `Tool "${toolName}" blocked in plan mode.`,
    }
  }
}
```

`AskUserQuestion` 工具会被 1Code 拦截，转成 UI 上的等待用户确认/回答：

代码位置：`src/main/lib/trpc/routers/claude.ts:1889`

```ts
if (toolName === "AskUserQuestion") {
  const { toolUseID } = options
  safeEmit({
    type: "ask-user-question",
    toolUseId: toolUseID,
    questions: (toolInput as any).questions,
  } as UIMessageChunk)
```

前端响应后，会调用 `respondToolApproval`，后端 resolve 原先挂起的 Promise：

代码位置：`src/main/lib/trpc/routers/claude.ts:2880`

```ts
respondToolApproval: publicProcedure
  ...
  .mutation(({ input }) => {
    const pending = pendingToolApprovals.get(input.toolUseId)
    ...
    pending.resolve({
      approved: input.approved,
      message: input.message,
      updatedInput: input.updatedInput,
    })
```

plan approval 是另一层 UI 流程：前端识别完成的 `ExitPlanMode` tool part，认为存在待审批 plan：

代码位置：`src/renderer/features/agents/main/active-chat.tsx:4355`

```tsx
// Check if there's an unapproved plan (in plan mode with completed ExitPlanMode)
const hasUnapprovedPlan = useMemo(() => {
```

用户批准后，前端切换到 agent mode，并发送 `Implement plan`：

代码位置：`src/renderer/features/agents/main/active-chat.tsx:3166`

```tsx
// Handle plan approval - sends "Build plan" message and switches to agent mode
const handleApprovePlan = useCallback(() => {
  useAgentSubChatStore.getState().updateSubChatMode(subChatId, "agent")
  ...
  sendMessageRef.current({
    role: "user",
    parts: [{ type: "text", text: "Implement plan" }],
  })
```

闭环：

```text
Claude Code 请求工具执行
  -> Claude SDK 调用 canUseTool
  -> 1Code 根据 mode/toolName 决定 allow/deny
  -> AskUserQuestion 进入 pendingToolApprovals
  -> 前端 UI 响应 respondToolApproval
  -> canUseTool 返回 allow/deny 给 Claude SDK

Plan 审批：
  Claude 产出 ExitPlanMode
  -> 前端标记 hasUnapprovedPlan
  -> 用户批准
  -> 切换 agent mode
  -> 发送 Implement plan
```

## 1. 构建阶段：为什么 1Code 需要下载 Claude binary

`package.json` 定义了 Claude binary 下载脚本：

代码位置：`package.json:23`

```json
"claude:download": "node scripts/download-claude-binary.mjs --version=2.1.45"
```

同一个 `package.json` 的 release 脚本也把下载步骤放在 build/package 之前：

代码位置：`package.json:27`

```json
"release": "rm -rf release && bun i && bun run claude:download && bun run codex:download && bun run build && bun run package:mac && bun run dist:manifest && ./scripts/upload-release-wrangler.sh"
```

下载脚本本身说明了用途：

代码位置：`scripts/download-claude-binary.mjs:3`

```js
 * Downloads Claude Code native binaries for bundling with the Electron app.
```

它按平台架构选择二进制：

代码位置：`scripts/download-claude-binary.mjs:27`

```js
const PLATFORMS = {
  "darwin-arm64": { dir: "darwin-arm64", binary: "claude" },
  "darwin-x64": { dir: "darwin-x64", binary: "claude" },
  "linux-arm64": { dir: "linux-arm64", binary: "claude" },
  "linux-x64": { dir: "linux-x64", binary: "claude" },
  "win32-arm64": { dir: "win32-arm64", binary: "claude.exe" },
  "win32-x64": { dir: "win32-x64", binary: "claude.exe" },
}
```

下载产物写入 `resources/bin/<platform-arch>/claude`：

代码位置：`scripts/download-claude-binary.mjs:162`

```js
const targetDir = path.join(BIN_DIR, platformKey)
const targetPath = path.join(targetDir, platform.binary)
```

脚本会校验 SHA256 并设置可执行权限：

代码位置：`scripts/download-claude-binary.mjs:195`

```js
const actualHash = await calculateSha256(targetPath)
if (actualHash !== expectedHash) {
  fs.unlinkSync(targetPath)
  return false
}

if (process.platform !== "win32") {
  fs.chmodSync(targetPath, 0o755)
}
```

打包时，`electron-builder` 把当前平台架构的 binary 复制进 App resources：

代码位置：`package.json:161`

```json
"extraResources": [
  {
    "from": "resources/bin/${platform}-${arch}",
    "to": "bin",
    "filter": ["**/*"]
  }
]
```

因此，构建链路证明：Claude binary 是 1Code 构建产物的一部分，路径和版本由项目控制。

## 2. 运行阶段：1Code 如何定位并使用这个 Claude binary

运行时，1Code 不从 PATH 查找 `claude`，而是计算 bundled binary 路径。

代码位置：`src/main/lib/claude/env.ts:45`

```ts
export function getBundledClaudeBinaryPath(): string {
```

开发环境和生产环境路径不同：

代码位置：`src/main/lib/claude/env.ts:62`

```ts
// In dev: apps/desktop/resources/bin/{platform}-{arch}/claude
// In production: {resourcesPath}/bin/claude
const resourcesPath = isDev
  ? path.join(app.getAppPath(), "resources/bin", `${currentPlatform}-${arch}`)
  : path.join(process.resourcesPath, "bin")
```

如果 binary 不存在，运行时会明确提示先执行下载脚本：

代码位置：`src/main/lib/claude/env.ts:82`

```ts
if (!exists) {
  console.error("[claude-binary] WARNING: Binary not found at path:", binaryPath)
  console.error("[claude-binary] Run 'bun run claude:download' to download it")
}
```

Claude 路由在发起会话前获取这个路径：

代码位置：`src/main/lib/trpc/routers/claude.ts:1447`

```ts
const claudeBinaryPath = getBundledClaudeBinaryPath()
```

随后把它传给 Claude SDK：

代码位置：`src/main/lib/trpc/routers/claude.ts:1981`

```ts
// Use bundled binary
pathToClaudeCodeExecutable: claudeBinaryPath,
```

最终由 Claude SDK 执行：

代码位置：`src/main/lib/trpc/routers/claude.ts:2021`

```ts
// 5. Run Claude SDK
stream = claudeQuery(queryOptions)
```

闭环判断：

```text
bun run claude:download
  -> resources/bin/<platform-arch>/claude
  -> electron-builder extraResources 复制到 App resources/bin
  -> getBundledClaudeBinaryPath() 计算路径
  -> pathToClaudeCodeExecutable 传给 Claude SDK
  -> claudeQuery(queryOptions) 启动会话
```

这说明 1Code 使用的是自己的 bundled Claude Code binary。

## 3. Claude config 隔离：为什么 binary 独立但 Skill 可以复用

1Code 没有直接让 bundled Claude binary 使用默认 `~/.claude` 作为完整配置目录。它会为每个 subChat 创建隔离目录：

代码位置：`src/main/lib/trpc/routers/claude.ts:1150`

```ts
// Create isolated config directory per subChat to prevent session contamination
// The Claude binary stores sessions in ~/.claude/ based on cwd, which causes
// cross-chat contamination when multiple chats use the same project folder
const isolatedConfigDir = path.join(
  app.getPath("userData"),
  "claude-sessions",
  isUsingOllama ? input.chatId : input.subChatId,
)
```

这一步的目标是隔离 session，而不是隔离所有用户配置。后续代码会把本机 `~/.claude` 下的关键资产 symlink 到这个隔离目录：

代码位置：`src/main/lib/trpc/routers/claude.ts:1163`

```ts
// Ensure isolated config dir exists and symlink selected ~/.claude/ assets
// This is needed because SDK looks for these under $CLAUDE_CONFIG_DIR/
```

具体来源是本机用户目录：

代码位置：`src/main/lib/trpc/routers/claude.ts:1172`

```ts
const homeClaudeDir = path.join(os.homedir(), ".claude")
```

symlink 的对象包括：

代码位置：`src/main/lib/trpc/routers/claude.ts:1176`

```ts
const skillsSource = path.join(homeClaudeDir, "skills")
const skillsTarget = path.join(isolatedConfigDir, "skills")
const commandsSource = path.join(homeClaudeDir, "commands")
const commandsTarget = path.join(isolatedConfigDir, "commands")
const agentsSource = path.join(homeClaudeDir, "agents")
const agentsTarget = path.join(isolatedConfigDir, "agents")
const pluginsSource = path.join(homeClaudeDir, "plugins")
const pluginsTarget = path.join(isolatedConfigDir, "plugins")
const settingsSource = path.join(homeClaudeDir, "settings.json")
```

Skill symlink 具体执行：

代码位置：`src/main/lib/trpc/routers/claude.ts:1231`

```ts
await ensureSymlink(
  skillsSource,
  skillsTarget,
  "skills directory",
  "dir",
)
```

Command、Agent、Plugin、`settings.json` 也按同样方式 symlink：

代码位置：`src/main/lib/trpc/routers/claude.ts:1237`

```ts
await ensureSymlink(commandsSource, commandsTarget, "commands directory", "dir")
await ensureSymlink(agentsSource, agentsTarget, "agents directory", "dir")
await ensureSymlink(pluginsSource, pluginsTarget, "plugins directory", "dir")
await ensureSymlink(settingsSource, settingsTarget, "settings.json", "file")
```

闭环判断：

```text
1Code 使用 bundled Claude binary
  -> 为每个 subChat 创建 isolatedConfigDir
  -> 将 ~/.claude/skills symlink 到 isolatedConfigDir/skills
  -> Claude SDK 在隔离配置目录中看到 user skills
```

因此，binary 是 1Code 自带的，但 user-level Skill 与本机 Claude Code 的 `~/.claude/skills` 是复用关系。

## 4. Project/User Skill 如何被 Claude SDK 加载和触发

Claude query options 中明确启用 project/user setting sources：

代码位置：`src/main/lib/trpc/routers/claude.ts:1776`

```ts
// Load skills from project and user directories (skip for Ollama - not supported)
...(!isUsingOllama && {
  settingSources: ["project" as const, "user" as const],
}),
```

这意味着 Claude SDK 会加载：

```text
user source: isolatedConfigDir/skills -> symlink 到 ~/.claude/skills
project source: 当前 cwd/project 下的 .claude/skills
```

1Code 还会在用户输入里解析 Skill mention：

代码位置：`src/main/lib/trpc/routers/claude.ts:1054`

```ts
// Parse mentions from prompt (agents, skills, files, folders)
const { cleanedPrompt, agentMentions, skillMentions } =
  parseMentions(promptForModel)
```

如果用户只输入了 skill mention，1Code 会构造显式提示：

代码位置：`src/main/lib/trpc/routers/claude.ts:1086`

```ts
finalPrompt = `Invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
```

如果用户输入正文同时包含 skill mention，1Code 会追加使用指令：

代码位置：`src/main/lib/trpc/routers/claude.ts:1084`

```ts
finalPrompt = `${finalPrompt}\n\nUse the "${skillMentions.join('", "')}" skill(s) for this task.`
```

完整 Skill 使用闭环：

```text
本机 ~/.claude/skills 或项目 .claude/skills 中存在 SKILL.md
  -> 1Code 创建 isolatedConfigDir
  -> 1Code symlink ~/.claude/skills 到 isolatedConfigDir/skills
  -> queryOptions 设置 settingSources = ["project", "user"]
  -> 用户 @skill 时，1Code 解析 skillMentions
  -> 1Code 将 mention 转成 prompt 指令
  -> Claude SDK/Claude Code 通过 Skill tool 加载并使用对应 Skill
```

边界：

- Ollama offline mode 下，代码注释明确写了 skills 不支持，因此不会设置 `settingSources`。
- 1Code 复用的是本机 `~/.claude/skills` 和项目 `.claude/skills`，不是复制一份私有 skill。

## 5. MCP 的读取路径：不是 symlink，而是 1Code 主动合并后传入

MCP 与 Skill 不同。Skill 是通过 config 目录和 `settingSources` 让 Claude SDK 加载；MCP 是 1Code 读取多个配置源后构造成 `mcpServers` 传入。

源码注释列出 MCP 来源：

代码位置：`src/main/lib/trpc/routers/claude.ts:1271`

```ts
// Read MCP servers from all sources for the original project path
// These will be passed directly to the SDK via options.mcpServers
// Sources: ~/.claude.json, ~/.claude/.claude.json, ~/.claude/mcp.json, .mcp.json
```

首先读取本机 `~/.claude.json`：

代码位置：`src/main/lib/trpc/routers/claude.ts:1275`

```ts
const claudeJsonSource = path.join(os.homedir(), ".claude.json")
```

同时读取 `~/.claude/.claude.json`：

代码位置：`src/main/lib/trpc/routers/claude.ts:1298`

```ts
// Read ~/.claude/.claude.json once for reuse
let chatClaudeDirConfig: ClaudeConfig = {}
try {
  chatClaudeDirConfig = await readClaudeDirConfig()
} catch { /* ignore */ }
```

随后合并 user/global MCP：

代码位置：`src/main/lib/trpc/routers/claude.ts:1304`

```ts
const globalServers = await getMergedGlobalMcpServers(
  claudeConfig,
  chatClaudeDirConfig,
)
```

再合并配置文件里的 project MCP：

代码位置：`src/main/lib/trpc/routers/claude.ts:1307`

```ts
const projectConfigServers = await getMergedLocalProjectMcpServers(
  lookupPath,
  claudeConfig,
  chatClaudeDirConfig,
)
```

同时读取项目根 `.mcp.json`：

代码位置：`src/main/lib/trpc/routers/claude.ts:1310`

```ts
const projectMcpJsonServers = await readProjectMcpJsonCached(lookupPath)
```

项目配置会覆盖项目根 `.mcp.json`：

代码位置：`src/main/lib/trpc/routers/claude.ts:1313`

```ts
// Per-project config servers override .mcp.json
const projectServers = { ...projectMcpJsonServers, ...projectConfigServers }
```

插件 MCP 还要经过两个条件：

- 插件已启用。
- 插件 MCP server 已审批。

代码位置：`src/main/lib/trpc/routers/claude.ts:1316`

```ts
const [
  enabledPluginSources,
  pluginMcpConfigs,
  approvedServers,
] = await Promise.all([
  getEnabledPlugins(),
  discoverPluginMcpServers(),
  getApprovedPluginMcpServers(),
])
```

只有 enabled 且 approved 的 plugin MCP 才会进入 `pluginServers`：

代码位置：`src/main/lib/trpc/routers/claude.ts:1327`

```ts
if (enabledPluginSources.includes(pConfig.pluginSource)) {
  ...
  if (approvedServers.includes(identifier)) {
    pluginServers[name] = serverConfig
  }
}
```

合并优先级为 project > global > plugin：

代码位置：`src/main/lib/trpc/routers/claude.ts:1343`

```ts
// Priority: project > global > plugin
const allServers = {
  ...pluginServers,
  ...globalServers,
  ...projectServers,
}
```

同名 server 的覆盖关系来自对象展开顺序：后展开的 `globalServers` 覆盖 `pluginServers`，后展开的 `projectServers` 覆盖二者。

## 6. MCP 的过滤、token 刷新与传入 Claude SDK

合并后，1Code 会根据 `workingMcpServers` 过滤掉已知不可用 MCP：

代码位置：`src/main/lib/trpc/routers/claude.ts:1350`

```ts
// Filter to only working MCPs using scoped cache keys
if (workingMcpServers.size > 0) {
  const filtered: Record<string, any> = {}
```

过滤时会区分 project scope 和 global scope：

代码位置：`src/main/lib/trpc/routers/claude.ts:1357`

```ts
const scope =
  name in projectServers ? resolvedProjectPath : null
const cacheKey = mcpCacheKey(scope, name)
```

只有标记为 working 或尚未出现在 cache 中的 server 会被保留：

代码位置：`src/main/lib/trpc/routers/claude.ts:1363`

```ts
if (
  workingMcpServers.get(cacheKey) === true ||
  !workingMcpServers.has(cacheKey)
) {
  filtered[name] = srvConfig
}
```

如果进入 Ollama offline mode，MCP 会被跳过：

代码位置：`src/main/lib/trpc/routers/claude.ts:1547`

```ts
// Skip MCP servers entirely in offline mode (Ollama) - they slow down initialization by 60+ seconds
if (isUsingOllama) {
  mcpServersFiltered = undefined
}
```

否则，1Code 会先刷新 MCP token：

代码位置：`src/main/lib/trpc/routers/claude.ts:1557`

```ts
// Ensure MCP tokens are fresh (refresh if within 5 min of expiry)
mcpServersFiltered = await ensureMcpTokensFresh(
  mcpServersForSdk,
  lookupPath,
)
```

最终传入 Claude SDK：

代码位置：`src/main/lib/trpc/routers/claude.ts:1762`

```ts
// Pass filtered MCP servers (only working/unknown ones, skip failed/needs-auth)
...(mcpServersFiltered &&
  Object.keys(mcpServersFiltered).length > 0 && {
    mcpServers: mcpServersFiltered,
  }),
```

完整 MCP 使用闭环：

```text
本机 Claude MCP 配置：
  ~/.claude.json
  ~/.claude/.claude.json
  ~/.claude/mcp.json

项目 MCP 配置：
  项目 .mcp.json
  Claude 配置中按 project path 写入的 MCP

插件 MCP 配置：
  已启用插件 + 已审批 MCP server

  -> 1Code 读取所有来源
  -> 合并 project > global > plugin
  -> 过滤已知不可用 MCP
  -> 非 Ollama 模式下刷新 token
  -> 写入 queryOptions.options.mcpServers
  -> claudeQuery(queryOptions)
  -> Claude Code 会话中出现对应 MCP tools
```

## 7. 在 OneCode 中安装 Claude Skill 或 MCP 时，实际写到哪里

本节说明在 OneCode UI 里创建/安装 Claude Skill 或 Claude MCP 时，实际写入路径是什么，以及它和本机 Claude Code 配置的关系。

### 7.1 OneCode 安装 Skill：本质是写入 Claude Skill 路径

Settings 里的 Skills/Commands 面板允许选择 User 或 Project scope。UI 文案直接写明了 Skill 的目标路径：

代码位置：`src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx:310`

```tsx
<SelectItem value="user">
  {kind === "skill" ? "User (~/.claude/skills/)" : "User (~/.claude/commands/)"}
</SelectItem>
<SelectItem value="project">
  {projectName ? `Project: ${projectName}` : "Project"} ({kind === "skill" ? ".claude/skills/" : ".claude/commands/"})
</SelectItem>
```

点击 Create 后，前端调用 `trpc.skills.create`：

代码位置：`src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx:488`

```tsx
const result = await createSkillMutation.mutateAsync({
  name: data.name,
  description: data.description,
  content: data.content,
  source: data.source,
  cwd: selectedProject?.path,
})
```

后端根据 `source` 决定写入 user 还是 project 路径：

代码位置：`src/main/lib/trpc/routers/skills.ts:208`

```ts
let targetDir: string
if (input.source === "project") {
  if (!input.cwd) {
    throw new Error("Project path (cwd) required for project skills")
  }
  targetDir = path.join(input.cwd, ".claude", "skills")
} else {
  targetDir = path.join(os.homedir(), ".claude", "skills")
}
```

然后创建 skill 目录并写入 `SKILL.md`：

代码位置：`src/main/lib/trpc/routers/skills.ts:218`

```ts
const skillDir = path.join(targetDir, safeName)
const skillMdPath = path.join(skillDir, "SKILL.md")
```

代码位置：`src/main/lib/trpc/routers/skills.ts:231`

```ts
// Create directory and write SKILL.md
await fs.mkdir(skillDir, { recursive: true })
...
await fs.writeFile(skillMdPath, fileContent, "utf-8")
```

Skill 列表读取时，也读取同一组路径：

代码位置：`src/main/lib/trpc/routers/skills.ts:115`

```ts
const userSkillsDir = path.join(os.homedir(), ".claude", "skills")
const userSkillsPromise = scanSkillsDirectory(userSkillsDir, "user")
```

代码位置：`src/main/lib/trpc/routers/skills.ts:119`

```ts
if (input?.cwd) {
  const projectSkillsDir = path.join(input.cwd, ".claude", "skills")
  projectSkillsPromise = scanSkillsDirectory(projectSkillsDir, "project", input.cwd)
}
```

更新和删除也直接操作这个 `SKILL.md` 文件或其父目录：

代码位置：`src/main/lib/trpc/routers/skills.ts:263`

```ts
const absolutePath = input.cwd && !input.path.startsWith("~") && !input.path.startsWith("/")
  ? path.join(input.cwd, input.path)
  : resolveSkillPath(input.path)
...
await fs.writeFile(absolutePath, fileContent, "utf-8")
```

代码位置：`src/main/lib/trpc/routers/skills.ts:300`

```ts
// Skills are directories containing SKILL.md — delete the parent directory
const skillDir = path.dirname(absolutePath)
await fs.access(skillDir)
await fs.rm(skillDir, { recursive: true })
```

完整安装闭环：

```text
OneCode Settings -> New Skill
  -> 选择 User:
       写入 ~/.claude/skills/<skill-name>/SKILL.md
  -> 选择 Project:
       写入 <project>/.claude/skills/<skill-name>/SKILL.md
  -> Claude 会话启动时：
       user skill 通过 ~/.claude/skills -> isolatedConfigDir/skills symlink 复用
       project skill 通过 settingSources=["project","user"] 加载
```

所以，如果用户在 OneCode 里创建 User Skill，它不是安装到 OneCode 私有 harness 目录，而是写到本机 Claude Code 的 user skill 路径 `~/.claude/skills`。本机 Claude Code 也能看到它。反过来，本机 Claude Code 安装到 `~/.claude/skills` 的 Skill，OneCode 的 Claude 会话也会通过 symlink 和 `settingSources` 看到。

Project Skill 则写到项目目录下的 `.claude/skills`。这不是全局本机配置，而是项目配置；只要本机 Claude Code 在同一个项目里运行，也会看到同一份项目 Skill。

边界：

- 这个 Skill 安装流程是 Claude Skill 路径，不是 Codex Skill 路径。
- Codex 会话没有读取 `~/.claude/skills` 或 `.claude/skills` 并触发 Skill tool 的闭环；前面 7.7 已说明，Codex 只会收到 prompt 文本。

### 7.2 OneCode 安装 Claude MCP：本质是写入本机 `~/.claude.json`

MCP 面板新增 server 时，前端会按 provider 分流。Claude provider 调用 `trpc.claude.addMcpServer`：

代码位置：`src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx:283`

```tsx
const addClaudeServerMutation = trpc.claude.addMcpServer.useMutation()
const addCodexServerMutation = trpc.codex.addMcpServer.useMutation()
```

代码位置：`src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx:315`

```tsx
await addClaudeServerMutation.mutateAsync({
  name: name.trim(),
  transport: type,
  command: type === "stdio" ? command.trim() : undefined,
  args: type === "stdio" ? parsedArgs : undefined,
  url: type === "http" ? url.trim() : undefined,
  scope: effectiveScope,
  ...(effectiveScope === "project" && projectPath ? { projectPath } : {}),
})
```

Claude MCP 后端支持 global 和 project 两种 scope：

代码位置：`src/main/lib/trpc/routers/claude.ts:2942`

```ts
scope: z.enum(["global", "project"]),
projectPath: z.string().optional(),
transport: z.enum(["stdio", "http"]),
```

它会把 stdio 或 http server 表示成 `McpServerConfig`：

代码位置：`src/main/lib/trpc/routers/claude.ts:2966`

```ts
const serverConfig: McpServerConfig = {}
if (input.transport === "stdio") {
  serverConfig.command = input.command!.trim()
  if (input.args && input.args.length > 0) {
    serverConfig.args = input.args
  }
  if (input.env && Object.keys(input.env).length > 0) {
    serverConfig.env = input.env
  }
} else {
  serverConfig.url = input.url!.trim()
  if (input.authType) {
    serverConfig.authType = input.authType
  }
  if (input.bearerToken) {
    serverConfig.headers = {
      Authorization: `Bearer ${input.bearerToken}`,
    }
  }
}
```

写入前读取的是 `~/.claude.json`：

代码位置：`src/main/lib/claude-config.ts:20`

```ts
export const CLAUDE_CONFIG_PATH = path.join(os.homedir(), ".claude.json")
```

代码位置：`src/main/lib/trpc/routers/claude.ts:2988`

```ts
const existingConfig = await readClaudeConfig()
```

真正写入由 `updateMcpServerConfig()` 完成：

代码位置：`src/main/lib/trpc/routers/claude.ts:3002`

```ts
const config = updateMcpServerConfig(
  existingConfig,
  input.scope === "project" ? (projectPath ?? null) : null,
  serverName,
  serverConfig,
)
await writeClaudeConfig(config)
```

`updateMcpServerConfig()` 的 global 写入位置是 `config.mcpServers`，也就是 `~/.claude.json` 根级 `mcpServers`：

代码位置：`src/main/lib/claude-config.ts:163`

```ts
// Global MCP servers (root level mcpServers in ~/.claude.json)
if (!projectPath || projectPath === GLOBAL_MCP_PATH) {
  config.mcpServers = config.mcpServers || {}
  config.mcpServers[serverName] = {
    ...config.mcpServers[serverName],
    ...update,
  }
  return config
}
```

project 写入位置是 `config.projects[resolvedPath].mcpServers`：

代码位置：`src/main/lib/claude-config.ts:172`

```ts
// Project-specific MCP servers (resolve worktree paths)
const resolvedPath = resolveProjectPathFromWorktree(projectPath) || projectPath
config.projects = config.projects || {}
config.projects[resolvedPath] = config.projects[resolvedPath] || {}
config.projects[resolvedPath].mcpServers = config.projects[resolvedPath].mcpServers || {}
config.projects[resolvedPath].mcpServers[serverName] = {
  ...config.projects[resolvedPath].mcpServers[serverName],
  ...update,
}
```

最后写回的仍是 `~/.claude.json`：

代码位置：`src/main/lib/claude-config.ts:78`

```ts
export async function writeClaudeConfig(config: ClaudeConfig): Promise<void> {
  await fs.writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}
```

完整安装闭环：

```text
OneCode Settings -> New MCP Server -> Provider: Claude Code
  -> global:
       写入 ~/.claude.json 的 mcpServers.<serverName>
  -> project:
       写入 ~/.claude.json 的 projects[projectPath].mcpServers.<serverName>
  -> Claude 会话启动时：
       OneCode 读取 ~/.claude.json / ~/.claude/.claude.json / ~/.claude/mcp.json / project .mcp.json
       合并、过滤、刷新 token
       传给 Claude SDK queryOptions.options.mcpServers
```

所以，在 OneCode 里安装 Claude MCP，会直接影响本机 Claude Code 的配置文件 `~/.claude.json`。它不是 OneCode 私有 MCP 配置。只要本机 Claude Code 也读取同一个 `~/.claude.json`，它就能看到这些 MCP server。

删除和更新也是操作同一份 `~/.claude.json`：

代码位置：`src/main/lib/trpc/routers/claude.ts:3094`

```ts
const updatedConfig = updateMcpServerConfig(
  config,
  projectPath ?? null,
  input.name,
  merged,
)
await writeClaudeConfig(updatedConfig)
```

代码位置：`src/main/lib/trpc/routers/claude.ts:3130`

```ts
const updated = removeMcpServerConfig(
  config,
  projectPath ?? null,
  input.name,
)
await writeClaudeConfig(updated)
```

### 7.3 Claude 安装关系总表

| 在 OneCode 中安装 | 实际写入/执行位置 | 和本机配置的关系 | 运行时是否使用 |
| --- | --- | --- | --- |
| User Skill | `~/.claude/skills/<name>/SKILL.md` | 与本机 Claude Code user Skill 共用 | Claude Code 使用 |
| Project Skill | `<project>/.claude/skills/<name>/SKILL.md` | 与该项目下的 Claude Code project Skill 共用 | Claude Code 使用 |
| Claude global MCP | `~/.claude.json` 根级 `mcpServers` | 与本机 Claude Code global MCP 共用 | Claude Code 使用 |
| Claude project MCP | `~/.claude.json` 的 `projects[projectPath].mcpServers` | 与本机 Claude Code project MCP 共用 | Claude Code 使用 |

## 8. 总结：1Code 对 Claude Code Skill/MCP 的支持边界

### Skill

```text
构建/运行：
  bundled Claude binary

配置目录：
  per-subChat isolatedConfigDir

复用方式：
  ~/.claude/skills -> isolatedConfigDir/skills 的 symlink
  project .claude/skills 通过 settingSources = ["project", "user"] 加载

安装方式：
  User Skill 写入 ~/.claude/skills/<name>/SKILL.md
  Project Skill 写入 <project>/.claude/skills/<name>/SKILL.md

使用方式：
  用户 @skill -> parseMentions -> prompt 改写 -> Claude Code Skill tool
```

### MCP

```text
构建/运行：
  bundled Claude binary

配置来源：
  ~/.claude.json
  ~/.claude/.claude.json
  ~/.claude/mcp.json
  project .mcp.json
  project-scoped Claude MCP config
  enabled + approved plugin MCP

安装方式：
  Claude global MCP 写入 ~/.claude.json 的 mcpServers
  Claude project MCP 写入 ~/.claude.json 的 projects[projectPath].mcpServers

复用方式：
  不是 symlink 自动继承
  而是 1Code 主动读取、合并、过滤、刷新 token

使用方式：
  queryOptions.options.mcpServers -> claudeQuery(queryOptions)
```

### 关键判断

1Code 对 Claude Code 的支持不是“直接连接本机 Claude Code 进程”，也不是“完全私有的一套 Claude 配置”。它的真实形态是：

```text
1Code 自带 Claude Code binary
  + 每个 subChat 隔离 session/config 目录
  + symlink 复用本机 ~/.claude 的 Skill/Command/Agent/Plugin/Settings
  + 主动读取并传入本机/项目/插件 MCP 配置
```

因此：

- binary 层面：1Code 自带，版本由下载脚本控制。
- Skill 层面：user-level 与本机 Claude Code 共用 `~/.claude/skills`，project-level 与项目 `.claude/skills` 共用。
- MCP 层面：复用本机和项目配置，但经过 1Code 合并、过滤和 token 刷新后再传给 Claude SDK。
- 离线 Ollama 模式：Skill 的 `settingSources` 和 MCP 都不会按 Claude 原生路径启用。
