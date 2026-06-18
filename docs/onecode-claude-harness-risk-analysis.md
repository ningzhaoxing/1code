# OneCode Claude Code Harness 风险分析

本文分析 OneCode 作为 Claude Code harness 时，对漏洞挖掘、长任务执行、多工具调用、MCP/Skill 复用、中断恢复和审批流程可能带来的风险。

结论先行：

- OneCode 没有重写 Claude Code 的核心工具执行能力；它通过 Claude Agent SDK 调用 bundled Claude Code binary。
- 风险主要来自 harness 层：权限策略、事件转换、状态持久化、恢复机制、MCP/Skill 配置复用、计划审批 UI 语义。
- 对漏洞挖掘这类长任务来说，风险不是“模型天然变弱”，而是“外层调度和状态管理可能让能力表现变弱或偏移”。

## 1. 基础链路：OneCode 如何驱动 Claude Code

OneCode 后端动态加载 Claude Agent SDK：

代码位置：`src/main/lib/trpc/routers/claude.ts:248`

```ts
let cachedClaudeQuery:
  | typeof import("@anthropic-ai/claude-agent-sdk").query
  | null = null
const getClaudeQuery = async () => {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery
  }
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeQuery = sdk.query
  return cachedClaudeQuery
}
```

SDK options 里指定 bundled Claude Code binary：

代码位置：`src/main/lib/trpc/routers/claude.ts:1981`

```ts
// Use bundled binary
pathToClaudeCodeExecutable: claudeBinaryPath,
```

实际启动会话：

代码位置：`src/main/lib/trpc/routers/claude.ts:2021`

```ts
// 5. Run Claude SDK
let stream
try {
  stream = claudeQuery(queryOptions)
}
```

后端通过 async stream 接收 SDK message：

代码位置：`src/main/lib/trpc/routers/claude.ts:2060`

```ts
for await (const msg of stream) {
```

然后转换成 OneCode UI chunk：

代码位置：`src/main/lib/trpc/routers/claude.ts:2321`

```ts
// Transform and emit + accumulate
for (const chunk of transform(msg)) {
```

前端通过 tRPC subscription 接收：

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:236`

```ts
const sub = trpcClient.claude.chat.subscribe(
```

最终推入 UI stream：

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:482`

```ts
controller.enqueue(chunk)
```

整体链路：

```text
OneCode Renderer
  -> trpcClient.claude.chat.subscribe
  -> OneCode Main claudeRouter
  -> @anthropic-ai/claude-agent-sdk.query(queryOptions)
  -> bundled Claude Code binary
  -> SDK async stream message
  -> createTransformer(msg) -> UIMessageChunk
  -> renderer ReadableStream
  -> OneCode UI
```

因此，下面的风险主要是 harness 风险，不是 Claude Code binary 被替换成了另一套执行器。

## 2. 风险一：权限模型与本机 Claude Code CLI 不一致

### 风险

OneCode 在非 plan 模式下使用 `bypassPermissions`，并开启 `allowDangerouslySkipPermissions`。这会让一些本机 Claude Code CLI 里可能需要用户确认的工具行为，在 OneCode 里直接执行。

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

### 原因

OneCode 把权限策略作为 SDK option 传入，而不是完全复用本机 Claude Code CLI 的交互式权限确认体验。

### 对漏洞挖掘任务的影响

可能的正向影响：

- 工具执行更顺滑。
- 长任务更少被权限弹窗打断。

可能的负向影响：

- 高风险命令、文件写入、批量修改更容易被直接执行。
- 漏洞挖掘过程中如果模型误判命令风险，OneCode 的默认 agent 模式不会提供本机 CLI 那种逐步确认边界。
- 安全边界更依赖 OneCode 自己的 mode 设计和工具限制。

### 风险判断

这不是“能力打折”，而是“安全控制面改变”。对漏洞挖掘类任务，建议把危险操作前置到 plan/approval 流程，或者二开时增加更细粒度的工具审批。

## 3. 风险二：plan 模式限制可能改变原生执行行为

### 风险

OneCode 在 plan 模式下通过 `canUseTool` 强制限制工具使用。例如 `Edit` / `Write` 只能写 `.md`，部分工具会被 block，`ExitPlanMode` 也被特殊处理。

代码位置：`src/main/lib/trpc/routers/claude.ts:1864`

```ts
if (input.mode === "plan") {
  if (toolName === "Edit" || toolName === "Write") {
    const filePath =
      typeof toolInput.file_path === "string"
        ? toolInput.file_path
        : ""
    if (!/\.md$/i.test(filePath)) {
      return {
        behavior: "deny",
        message:
          'Only ".md" files can be modified in plan mode.',
      }
    }
  } else if (toolName == "ExitPlanMode") {
    return {
      behavior: "deny",
      message: `IMPORTANT: DONT IMPLEMENT THE PLAN UNTIL THE EXPLIT COMMAND. THE PLAN WAS **ONLY** PRESENTED TO USER, FINISH CURRENT MESSAGE AS SOON AS POSSIBLE`,
    }
  } else if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
    return {
      behavior: "deny",
      message: `Tool "${toolName}" blocked in plan mode.`,
    }
  }
}
```

### 原因

OneCode 的 plan mode 不是简单展示 Claude Code 的输出，而是用 SDK `canUseTool` hook 修改工具授权行为。

### 对漏洞挖掘任务的影响

- 如果漏洞挖掘流程需要在 plan 阶段创建非 Markdown 证据文件、脚本、临时 PoC 文件，可能被拒绝。
- 如果用户以为 plan mode 是“只规划不执行”的纯 UI 状态，实际上后端还会参与工具授权。
- 模型可能会根据被拒绝的工具反馈调整行为，从而影响后续路径。

### 风险判断

对“先分析、后执行”的安全工作流是有帮助的；但对需要边探索边生成辅助文件的漏洞挖掘场景，可能限制过强。

## 4. 风险三：事件转换层可能丢失或误表示原始 SDK 事件

### 风险

Claude SDK 返回的是 SDK message，OneCode 通过 `createTransformer()` 转成自己的 `UIMessageChunk`。如果 SDK 事件结构变化，或者存在 transform 未覆盖的事件类型，UI 展示和 DB 持久化可能不完整。

流式文本转换：

代码位置：`src/main/lib/claude/transform.ts:122`

```ts
// ===== STREAMING EVENTS (token-by-token) =====
if (msg.type === "stream_event") {
  const event = msg.event
  if (!event) return
```

工具输入流式转换：

代码位置：`src/main/lib/claude/transform.ts:157`

```ts
// Tool use start (streaming)
if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
```

完整 assistant message 转换：

代码位置：`src/main/lib/claude/transform.ts:256`

```ts
// ===== ASSISTANT MESSAGE (complete, often with tool_use) =====
if (msg.type === "assistant" && msg.message?.content) {
```

tool result 转换：

代码位置：`src/main/lib/claude/transform.ts:329`

```ts
// ===== USER MESSAGE (tool results) =====
if (msg.type === "user" && msg.message?.content && Array.isArray(msg.message.content)) {
```

system init / compact 状态转换：

代码位置：`src/main/lib/claude/transform.ts:368`

```ts
// ===== SYSTEM STATUS (compacting, etc.) =====
if (msg.type === "system") {
```

### 原因

OneCode UI 不能直接消费 Claude SDK 的所有原始事件，所以需要中间转换协议。这个协议一旦和 SDK message 结构不同步，就会产生表示误差。

### 对漏洞挖掘任务的影响

- 工具调用过程可能显示不完整，影响审计和复盘。
- 某些 MCP tool 的结构化输出如果没有正确解析，UI 可能只显示原始字符串或丢失上下文。
- 长任务里如果某一步工具结果未正确持久化，后续恢复时可能缺少关键证据。

### 风险判断

底层 Claude Code 可能已经执行成功，但 OneCode UI/DB 不一定完整表达执行过程。这对漏洞挖掘报告、审计链路和可复现性是实际风险。

## 5. 风险四：中断时可能形成半完成状态

### 风险

OneCode 用 `AbortController` 中断 active session。中断发生在 tool input 流式 JSON、工具执行中、tool result 尚未回传、DB 尚未保存之间时，可能留下半完成消息。

active session 和 abort controller：

代码位置：`src/main/lib/trpc/routers/claude.ts:263`

```ts
const activeSessions = new Map<string, AbortController>()
```

cancel mutation：

代码位置：`src/main/lib/trpc/routers/claude.ts:2861`

```ts
cancel: publicProcedure
  .input(z.object({ subChatId: z.string() }))
  .mutation(({ input }) => {
    const controller = activeSessions.get(input.subChatId)
    if (controller) {
      controller.abort()
      activeSessions.delete(input.subChatId)
      clearPendingApprovals("Session cancelled.", input.subChatId)
    }
```

stream loop 中断检查：

代码位置：`src/main/lib/trpc/routers/claude.ts:2060`

```ts
for await (const msg of stream) {
  if (abortController.signal.aborted) {
    if (isUsingOllama)
      console.log(`[Ollama] Stream aborted by user`)
    break
  }
```

即使中断/错误，也尝试保存 accumulated parts：

代码位置：`src/main/lib/trpc/routers/claude.ts:2665`

```ts
// 7. Save final messages to DB
// ALWAYS save accumulated parts, even on abort (so user sees partial responses after reload)
```

### 原因

Claude SDK stream 是异步事件流，OneCode 的 UI 和 DB 保存是后处理。中断点可能落在任意事件边界。

### 对漏洞挖掘任务的影响

- 某个扫描命令可能已经执行，但 UI 未显示完整结果。
- 某个文件可能已经被 Write/Edit 修改，但 tool result 未持久化完整。
- 恢复后模型可能不知道上一步已经执行到哪里，导致重复执行或漏执行。

### 风险判断

长任务中断是最容易让“能力表现打折”的点。建议二开时对工具执行状态、文件变更、命令退出码做额外审计记录。

## 6. 风险五：恢复依赖 Claude session 与 OneCode DB 双重状态

### 风险

OneCode 恢复依赖两个体系：

- Claude Code session：`sessionId` / `resume` / `resumeSessionAt`
- OneCode DB：messages、metadata、streamId、sdkMessageUuid

前端从最后一条 assistant metadata 取 sessionId：

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:173`

```ts
// Get sessionId for resume (server preserves sessionId on abort so
// the next message can resume with full conversation context)
const lastAssistant = [...options.messages]
  .reverse()
  .find((m) => m.role === "assistant")
const metadata = lastAssistant?.metadata as AgentMessageMetadata | undefined
const sessionId = metadata?.sessionId
```

后端传给 SDK：

代码位置：`src/main/lib/trpc/routers/claude.ts:1985`

```ts
...(resumeSessionId && {
  resume: resumeSessionId,
```

rollback/fork 依赖 SDK message uuid：

代码位置：`src/main/lib/trpc/routers/claude.ts:1988`

```ts
...(shouldForkResume && forkResumeAtUuid && !isUsingOllama
  ? {
      resumeSessionAt: forkResumeAtUuid,
      forkSession: true,
    }
  : resumeAtUuid && !isUsingOllama
    ? { resumeSessionAt: resumeAtUuid }
    : { continue: true }),
```

后端从 SDK message 记录 sessionId 和 uuid：

代码位置：`src/main/lib/trpc/routers/claude.ts:2280`

```ts
// Track sessionId for rollback support (available on all messages)
if (msgAny.session_id) {
  metadata.sessionId = msgAny.session_id
  currentSessionId = msgAny.session_id // Share with cleanup
}
```

代码位置：`src/main/lib/trpc/routers/claude.ts:2286`

```ts
// Track UUID from assistant messages for resumeSessionAt
if (msgAny.type === "assistant" && msgAny.uuid) {
  lastAssistantUuid = msgAny.uuid
}
```

保存到 DB：

代码位置：`src/main/lib/trpc/routers/claude.ts:2688`

```ts
db.update(subChats)
  .set({
    messages: JSON.stringify(finalMessages),
    sessionId: savedSessionId,
    streamId: null,
    updatedAt: new Date(),
  })
```

### 原因

Claude Code 的 session 文件和 OneCode 的 UI/DB message 是两套状态。它们必须保持一致，恢复才可靠。

### 对漏洞挖掘任务的影响

- OneCode DB 有 sessionId，但 Claude session 文件丢失时，恢复失败。
- Claude session 还在，但 OneCode DB message 丢失或部分保存时，UI 和模型上下文认知不一致。
- rollback/fork 依赖 `sdkMessageUuid`，如果 uuid 没有正确保存，精确恢复点会失效。

### 风险判断

漏洞挖掘长任务通常依赖连续上下文。恢复状态不一致会直接影响后续判断质量。

## 7. 风险六：MCP 过滤、token 刷新和配置复用可能改变工具可用性

### 风险

OneCode 不是简单让 Claude Code 自动读取所有 MCP；它读取多个来源后合并、过滤、刷新 token，再传给 SDK。

读取和合并 MCP 来源：

代码位置：`src/main/lib/trpc/routers/claude.ts:1271`

```ts
// Read MCP servers from all sources for the original project path
// These will be passed directly to the SDK via options.mcpServers
// Sources: ~/.claude.json, ~/.claude/.claude.json, ~/.claude/mcp.json, .mcp.json
```

合并优先级：

代码位置：`src/main/lib/trpc/routers/claude.ts:1343`

```ts
// Priority: project > global > plugin
const allServers = {
  ...pluginServers,
  ...globalServers,
  ...projectServers,
}
```

过滤 non-working MCP：

代码位置：`src/main/lib/trpc/routers/claude.ts:1350`

```ts
// Filter to only working MCPs using scoped cache keys
if (workingMcpServers.size > 0) {
```

传给 SDK：

代码位置：`src/main/lib/trpc/routers/claude.ts:1762`

```ts
// Pass filtered MCP servers (only working/unknown ones, skip failed/needs-auth)
...(mcpServersFiltered &&
  Object.keys(mcpServersFiltered).length > 0 && {
    mcpServers: mcpServersFiltered,
  }),
```

### 原因

OneCode 为了 UI 展示、插件审批、token 刷新和性能做了 MCP 管理层。这个管理层会影响最终传给 Claude Code 的 MCP 列表。

### 对漏洞挖掘任务的影响

- 某个安全扫描 MCP 被标记 failed 后，可能不会进入会话。
- project/global/plugin 同名 MCP 的覆盖顺序可能和用户预期不一致。
- token 刷新失败会导致 MCP 工具不可用。
- 插件 MCP 需要 enabled + approved，审批状态会影响可用工具集合。

### 风险判断

漏洞挖掘能力高度依赖工具集合时，必须检查 `session-init` 中实际进入会话的 tools/MCP，而不能只看配置文件是否存在。

## 8. 风险七：Skill 复用依赖 symlink 和 settingSources

### 风险

User Skill 通过 symlink 从 `~/.claude/skills` 进入 isolated config dir；Project Skill 通过 `settingSources` 加载。如果 symlink 创建失败、source 不存在、settingSources 不生效，Skill 能力会下降。

isolated config dir：

代码位置：`src/main/lib/trpc/routers/claude.ts:1150`

```ts
// Create isolated config directory per subChat to prevent session contamination
const isolatedConfigDir = path.join(
  app.getPath("userData"),
  "claude-sessions",
  isUsingOllama ? input.chatId : input.subChatId,
)
```

symlink user assets：

代码位置：`src/main/lib/trpc/routers/claude.ts:1176`

```ts
const skillsSource = path.join(homeClaudeDir, "skills")
const skillsTarget = path.join(isolatedConfigDir, "skills")
```

settingSources：

代码位置：`src/main/lib/trpc/routers/claude.ts:1776`

```ts
// Load skills from project and user directories (skip for Ollama - not supported)
...(!isUsingOllama && {
  settingSources: ["project" as const, "user" as const],
}),
```

### 原因

为了隔离 session，OneCode 不直接使用默认 `~/.claude` 作为完整 config dir，而是创建 isolated config，再 symlink 一部分资产。

### 对漏洞挖掘任务的影响

- 漏洞挖掘 Skill 未加载时，模型不会得到预期的方法论、检查清单、工具习惯。
- Project Skill 与 User Skill 的加载边界不清晰时，可能使用错版本的 Skill。
- Ollama/offline 模式明确跳过 settingSources，Skill 不按 Claude 原生路径启用。

### 风险判断

如果漏洞挖掘能力依赖自定义 Skill，需要在 session-init 或实际行为中验证 Skill 是否加载，而不是只确认文件存在。

## 9. 风险八：计划审批是 OneCode UI 语义，不完全等于 Claude Code 原生审批

### 风险

OneCode 通过检测 `ExitPlanMode` tool part 判断“计划待审批”，批准后切换 subChat mode 到 `agent`，然后发送 `"Implement plan"`。

检测未审批计划：

代码位置：`src/renderer/features/agents/main/active-chat.tsx:4358`

```tsx
// Check if there's an unapproved plan (in plan mode with completed ExitPlanMode)
const hasUnapprovedPlan = useMemo(() => {
  // If already in agent mode, plan is approved (mode is the source of truth)
  if (subChatMode !== "plan") return false
```

查找 `ExitPlanMode`：

代码位置：`src/renderer/features/agents/main/active-chat.tsx:4364`

```tsx
// If assistant message with completed ExitPlanMode, we found an unapproved plan
if (msg.role === "assistant" && msg.parts) {
  const exitPlanPart = msg.parts.find(
    (p: any) => p.type === "tool-ExitPlanMode"
  )
```

批准后切 agent mode 并发送实现指令：

代码位置：`src/renderer/features/agents/main/active-chat.tsx:3166`

```tsx
// Handle plan approval - sends "Build plan" message and switches to agent mode
const handleApprovePlan = useCallback(() => {
```

代码位置：`src/renderer/features/agents/main/active-chat.tsx:3183`

```tsx
// Send "Build plan" message (now in agent mode)
sendMessageRef.current({
  role: "user",
  parts: [{ type: "text", text: "Implement plan" }],
})
```

### 原因

OneCode 的计划审批是基于 UI message parts 和 subChat mode 推导出来的应用层状态。

### 对漏洞挖掘任务的影响

- 如果 `ExitPlanMode` 事件未被正确 transform 或持久化，UI 可能漏显示待审批。
- 如果中断发生在 plan 输出和 ExitPlanMode 附近，状态可能不完整。
- 批准时发送的是固定文本 `"Implement plan"`，如果上下文恢复不完整，模型可能不知道具体要实现哪份计划。

### 风险判断

计划审批对“先审查再执行”有价值，但它本身是 OneCode harness 语义，需要重点测试中断、刷新、切换 subChat、恢复后的状态一致性。

## 10. 风险九：AskUserQuestion 审批/问答存在超时与状态同步风险

### 风险

AskUserQuestion 通过 `canUseTool` 暂停工具调用，后端等待前端响应，默认 60 秒超时。

后端 emit question：

代码位置：`src/main/lib/trpc/routers/claude.ts:1889`

```ts
if (toolName === "AskUserQuestion") {
  const { toolUseID } = options
  // Emit to UI (safely in case observer is closed)
  safeEmit({
    type: "ask-user-question",
    toolUseId: toolUseID,
    questions: (toolInput as any).questions,
  } as UIMessageChunk)
```

后端等待响应：

代码位置：`src/main/lib/trpc/routers/claude.ts:1898`

```ts
// Wait for response (60s timeout)
const response = await new Promise<{
  approved: boolean
  message?: string
  updatedInput?: unknown
}>((resolve) => {
```

前端保存 pending question：

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:260`

```ts
// Handle AskUserQuestion - show question UI
if (chunk.type === "ask-user-question") {
```

前端回传审批：

代码位置：`src/renderer/features/agents/main/active-chat.tsx:3143`

```tsx
const handlePlanApproval = useCallback(
  async (toolUseId: string, approved: boolean) => {
```

后端接收回传：

代码位置：`src/main/lib/trpc/routers/claude.ts:2880`

```ts
respondToolApproval: publicProcedure
```

### 原因

这是 OneCode 在 SDK tool authorization hook 上构建的交互机制。它依赖 tRPC subscription、前端 atom 状态、用户操作和后端 pending map 同步。

### 对漏洞挖掘任务的影响

- 用户未及时响应会导致工具调用被 deny。
- 前端刷新、订阅断开、subChat 切换可能导致 pending UI 与后端 pending map 不一致。
- 对需要人工确认目标、范围、授权边界的安全任务，超时/误拒会改变执行路径。

### 风险判断

这类审批适合高风险节点，但不能作为唯一审计来源。建议记录 question、answer、toolUseId、最终 allow/deny 到可追溯日志。

## 11. 风险十：OneCode 额外注入任务上下文，可能增强也可能偏移

### 风险

前端在特定条件下会为安全挖掘任务准备额外 record，并生成 `modelPrompt`。

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:212`

```ts
if (currentMode === "agent" && shouldUseSecurityMiningRecord(prompt)) {
  try {
    const record = await trpcClient.securityMiningRecord.ensure.mutate({
      chatId: this.config.chatId,
      subChatId: this.config.subChatId,
    })
    modelPrompt = buildSecurityMiningModelPrompt(prompt, record.filePath)
```

随后传给后端：

代码位置：`src/renderer/features/agents/lib/ipc-chat-transport.ts:240`

```ts
prompt,
...(modelPrompt && { modelPrompt }),
```

### 原因

OneCode 在用户 prompt 之外加入了产品侧任务语义。这可能是安全挖掘场景的增强，也可能改变模型对任务目标的理解。

### 对漏洞挖掘任务的影响

- 如果注入模板与当前任务匹配，能提升结构化记录能力。
- 如果误触发或模板过强，可能让模型偏向“填写记录”，而不是继续深入挖掘。
- 如果 record 文件路径、内容或状态异常，可能引入错误上下文。

### 风险判断

对二开来说，这一层是可控增强点，但必须可开关、可审计、可解释。

## 12. 总结：哪些风险最可能让能力表现打折

| 风险 | 原因 | 对漏洞挖掘能力的影响 |
| --- | --- | --- |
| 权限策略偏差 | 非 plan 模式 bypass permissions | 安全边界不同，可能执行过度 |
| plan 模式工具限制 | `canUseTool` 阻止部分工具或非 md 写入 | 探索阶段可能受限 |
| stream transform 漏事件 | SDK message 转 OneCode UI chunk | 过程、证据、结果展示不完整 |
| 中断半完成 | async stream + abort + DB 后保存 | 重复执行、漏执行、上下文断裂 |
| session/DB 不一致 | Claude session 与 OneCode DB 双状态 | 长任务恢复质量下降 |
| MCP 管理层过滤 | 合并、过滤、token、审批 | 安全工具不可用或集合变化 |
| Skill symlink/settingSources | isolated config + symlink | 专用漏洞挖掘方法论未加载 |
| plan approval UI 语义 | 基于 `ExitPlanMode` part 推导 | 待审批状态误判 |
| AskUserQuestion 同步 | pending map + 前端 atom + timeout | 人工确认节点丢失或误拒 |
| 额外 prompt 注入 | 产品侧安全记录上下文 | 任务目标可能偏移 |

更准确的判断是：

```text
Claude Code 核心能力：
  大体不打折

OneCode 中的能力表现：
  取决于 harness 的权限策略、事件转换、状态保存、恢复机制、MCP/Skill 装载是否稳定

漏洞挖掘长任务：
  最容易受中断恢复、MCP 可用性、Skill 加载、审批状态和事件持久化影响
```

因此，二开时建议把以下内容作为优先验证项：

1. 实际进入会话的 tools/MCP/skills 是否和预期一致。
2. 中断后 partial tool call、文件变更、命令结果是否完整保存。
3. sessionId、sdkMessageUuid、Claude session 文件、OneCode DB 是否一致。
4. plan approval 在刷新、切换 subChat、恢复后是否仍准确。
5. AskUserQuestion 的 allow/deny 是否有可靠审计记录。
6. 漏洞挖掘专用 prompt/record 注入是否可控、可关闭、可复现。
