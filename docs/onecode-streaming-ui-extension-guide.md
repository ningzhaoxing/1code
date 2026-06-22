# OneCode 流式 UI 二开指南

本文档说明 OneCode 如何把 Claude Code 和 Codex 的流式输出封装成用户最终看到的聊天与工具调用 UI。它面向二开同事，重点帮助判断：一个流式展示需求应该改 UI 封装层、Codex normalizer，还是必须改 Claude/Codex 原始流式协议。

## 范围

如果需求是视觉展示类，例如工具调用进度条、当前执行阶段、耗时、工具分组动态、shimmer 状态、更高级的工具卡片，优先从 OneCode 的封装层入手：

```text
Claude Code / Codex 原始流
  -> OneCode transport 和 normalizer
  -> AI SDK UI message stream
  -> message parts / tool parts
  -> AssistantMessageItem
  -> Agent tool UI components
```

只有当需求需要的信息在 normalized stream 或 message part 中不存在时，才考虑改 Claude/Codex 原始协议。例如真实执行百分比、正在运行工具的增量 stdout、某个 provider 内部阶段、MCP server 自己发出的 progress event。

## 目录地图

和流式 UI 二开相关的封装层主要集中在这些位置：

| 层级 | 目录 / 文件 | 作用 |
| --- | --- | --- |
| Claude 流类型和转换 | `src/main/lib/claude/types.ts`, `src/main/lib/claude/transform.ts` | 定义 `UIMessageChunk`；把 Claude SDK event 转成 AI SDK 风格 chunk。 |
| Claude tRPC router | `src/main/lib/trpc/routers/claude.ts` | 维护 Claude chat subscription，并向 renderer 发送 `UIMessageChunk`。 |
| Codex tRPC router | `src/main/lib/trpc/routers/codex.ts` | 使用 ACP provider 和 AI SDK `streamText()`，并转成 UI message stream。 |
| Codex normalizer | `src/shared/codex-tool-normalizer.ts` | 把 Codex/ACP stream chunk 和持久化 tool part 归一成共享 UI 更容易消费的形态。 |
| Renderer transports | `src/renderer/features/agents/lib/ipc-chat-transport.ts`, `src/renderer/features/agents/lib/acp-chat-transport.ts` | 把 tRPC subscription 包装成 `ReadableStream<UIMessageChunk>`，供 `useChat()` 消费。 |
| Chat 编排 | `src/renderer/features/agents/main/active-chat.tsx`, `src/renderer/features/agents/main/chat-data-sync.tsx` | 选择 Claude/Codex transport，并接入 AI SDK `useChat()`。 |
| Message store / status | `src/renderer/features/agents/stores/message-store.ts`, `src/renderer/features/agents/stores/streaming-status-store.ts` | 保存 normalized messages、message parts、streaming status，并做渲染优化。 |
| Message renderer | `src/renderer/features/agents/main/assistant-message-item.tsx` | 对 Codex parts 做二次归一，分组工具调用，并把每个 part 分发到具体 UI 组件。 |
| Tool UI components | `src/renderer/features/agents/ui/agent-*.tsx` | Bash、Edit/Write、Task、MCP、Thinking、Todo、WebFetch、WebSearch、通用工具、interrupted 工具等视觉组件。 |

## 封装实体

### `UIMessageChunk`

`UIMessageChunk` 是传输层最核心的封装对象，定义在 `src/main/lib/claude/types.ts:1-49`。

主要 chunk 类型：

- 生命周期：`start`、`finish`、`start-step`、`finish-step`。
- 文本流：`text-start`、`text-delta`、`text-end`。
- 推理流：`reasoning`、`reasoning-delta`。
- 工具流：`tool-input-start`、`tool-input-delta`、`tool-input-available`、`tool-output-available`、`tool-output-error`。
- 应用元信息：`session-init`、`message-metadata`、认证错误、重试通知。
- 用户审批 / 提问：`ask-user-question`、`ask-user-question-timeout`。

对于纯 UI 二开，应该把 `UIMessageChunk` 当作 provider runtime 和 renderer 之间的边界。除非 UI 需要的数据无法从现有 chunk 和 message part 推导出来，否则不要先扩展这里。

### AI SDK `UIMessage`

renderer transport 实现了 `ChatTransport<UIMessage>`，并返回 `ReadableStream<UIMessageChunk>`：

- Claude transport：`src/renderer/features/agents/lib/ipc-chat-transport.ts:159-165`。
- Codex transport：`src/renderer/features/agents/lib/acp-chat-transport.ts:109-115`。

`active-chat.tsx` 会把选中的 transport 传给 AI SDK `useChat()`。实际调用在 `src/renderer/features/agents/main/active-chat.tsx:2471-2478`，其中 `experimental_throttle: 50` 用来减少流式过程中的频繁重渲染。

`ChatDataSync` 也有同样的 `useChat()` 同步模式，见 `src/renderer/features/agents/main/chat-data-sync.tsx:54-70`。

### `Message` 和 `MessagePart`

renderer 侧 message 结构定义在 `src/renderer/features/agents/stores/message-store.ts:7-25`：

```ts
export interface MessagePart {
  type: string
  text?: string
  toolCallId?: string
  state?: string
  input?: any
  output?: any
  result?: any
}
```

这是绝大多数 UI 二开应该针对的实体。工具调用 UI 应优先从 `part.type`、`part.state`、`part.input`、`part.output`、`part.result` 和 `chatStatus` 推导展示状态。

store 也围绕这个结构做了优化。`message-store.ts:163-173` 说明了 `AssistantMessageItem` 应该对结构变化响应，例如新增 part、工具状态变化，而不是每个 text delta 都触发大范围渲染。做进度动画时要注意这一点：优先用 CSS/motion 动画，避免每个 chunk 都 setState。

### Tool Part

tool part 是 `type` 以 `tool-` 开头的 `MessagePart`，例如：

- `tool-Bash`
- `tool-Read`
- `tool-Edit`
- `tool-Write`
- `tool-Task`
- `tool-Thinking`
- `tool-TodoWrite`
- `tool-mcp__<server>__<tool>`

UI 常用的工具状态：

- `input-streaming`：模型正在生成工具入参。
- `input-available`：工具入参已经确定。
- `output-available`：工具已经返回输出。
- `output-error`：工具失败。
- `result`：某些 normalized 或历史兼容的结果状态。

共享状态判断函数是 `getToolStatus(part, chatStatus)`，位置在 `src/renderer/features/agents/ui/agent-tool-registry.tsx:38-52`。它推导：

- `isPending`
- `isError`
- `isSuccess`
- `isInterrupted`

如果要做统一进度状态，建议在同一文件里新增 `getToolPhase()`。

### Tool UI Metadata

通用工具展示使用 `ToolMeta` 和 `AgentToolRegistry`，位置在 `src/renderer/features/agents/ui/agent-tool-registry.tsx:28-36` 和 `src/renderer/features/agents/ui/agent-tool-registry.tsx:129-190`。

当前 metadata 支持：

- icon
- title
- subtitle
- tooltip content
- variant

它还没有 progress label、phase label 或 progress style。UI-first 的二开可以先扩展这里，而不是直接改后端协议。

示例扩展：

```ts
export type ToolPhase = "preparing" | "running" | "finalizing" | "done" | "error" | "interrupted"

export interface ToolMeta {
  icon: React.ComponentType<{ className?: string }>
  title: (part: any) => string
  subtitle?: (part: any) => string
  tooltipContent?: (part: any, projectPath?: string) => string
  variant: ToolVariant
  progressLabel?: (part: any, status?: string) => string
}
```

## Claude 流程

Claude 会输出 OneCode 自己定义的 `UIMessageChunk` 流。

1. `src/main/lib/trpc/routers/claude.ts:821-858` 创建 tRPC subscription，并通过 `safeEmit(chunk)` 把 chunk 发给 renderer。
2. `src/main/lib/claude/transform.ts:67-90` 累积 streamed tool input JSON，并在输入完整后发出 `tool-input-available`。
3. `src/main/lib/claude/transform.ts:157-189` 处理 Claude `tool_use` 开始事件和 `input_json_delta`，生成 `tool-input-start` 和 `tool-input-delta`。
4. `src/main/lib/claude/transform.ts:191-238` 把 Claude thinking block 映射成 `toolName: "Thinking"` 的 tool-like chunks。
5. `src/renderer/features/agents/lib/ipc-chat-transport.ts:236-256` 订阅 `trpcClient.claude.chat`。
6. `src/renderer/features/agents/lib/ipc-chat-transport.ts:260-345` 处理 OneCode 专属 app event，例如用户问题和 `session-init`。
7. `src/renderer/features/agents/lib/ipc-chat-transport.ts:482-484` 把 chunk enqueue 到 AI SDK stream。

Claude 这边对“工具输入正在生成”的粒度更细，因为 OneCode 能收到并转换 `input_json_delta`。这适合做“准备工具入参”的 UI，但不代表工具真正执行时有真实百分比。

## Codex 流程

Codex 通过 ACP 路径进入，然后被 normalizer 归一到共享 UI 形态。

1. `src/main/lib/trpc/routers/codex.ts:1766-1776` 使用 `provider.languageModel(selectedModelId)` 和 `provider.tools` 调用 AI SDK `streamText()`。
2. `src/main/lib/trpc/routers/codex.ts:1778-1795` 使用 `result.toUIMessageStream(...)` 转换为 UI message stream。
3. `src/renderer/features/agents/lib/acp-chat-transport.ts:161-183` 订阅 `trpcClient.codex.chat`。
4. `src/renderer/features/agents/lib/acp-chat-transport.ts:185-240` 处理 session/auth/error chunk，并在 enqueue 前调用 `normalizeCodexStreamChunk(chunk)`。
5. `src/shared/codex-tool-normalizer.ts:393-455` 对 Codex 的 `tool-input-start` 和 `tool-input-available` stream chunk 做归一。
6. `src/shared/codex-tool-normalizer.ts:300-370` 对 Codex live/persisted tool part 做归一，包括 type、input、output/result alias，以及可选 state 归一。

Codex 的原始事件模型和 Claude 不同。两者的 UI 收敛主要发生在 normalizer 和 renderer 层。

## Renderer 收敛点

最重要的共享定制点是 `AssistantMessageItem`。

`src/renderer/features/agents/main/assistant-message-item.tsx:53-68` 把 ACP/Codex title verb 映射成 Claude 风格的 canonical tool type：

- `Read -> Read`
- `Run -> Bash`
- `List -> Glob`
- `Search/Grep -> Grep`
- `Edit -> Edit`
- `Write -> Write`
- `Thought -> Thinking`
- `Fetch -> WebFetch`

`src/renderer/features/agents/main/assistant-message-item.tsx:84-173` 定义了 `normalizeAcpParts(parts)`，它会把 `tool-Read README.md`、`tool-acp.acp_provider_agent_dynamic_tool` 这类 ACP/Codex 工具 part 转成 `tool-Read`、`tool-Bash` 这类 canonical type。

`src/renderer/features/agents/main/assistant-message-item.tsx:498-503` 同时应用两层 normalizer：

```ts
const messageParts = normalizeAcpParts(
  (message?.parts || []).map((part) => normalizeCodexToolPart(part) as any),
)
```

`src/renderer/features/agents/main/assistant-message-item.tsx:498-500` 的注释很关键：AI SDK 会原地 mutate parts，所以不要依赖 array reference 做 memo，否则流式更新时可能拿到旧结果。

`src/renderer/features/agents/main/assistant-message-item.tsx:657-849` 把每个 normalized part 分发到具体视觉组件：

- `text` -> `MemoizedTextPart`
- `tool-Task` -> `AgentTaskTool`
- `tool-Bash` -> `AgentBashTool`
- `tool-Thinking` / `reasoning` -> `AgentThinkingTool`
- `tool-Edit` / `tool-Write` -> `AgentEditTool`
- `tool-WebSearch` -> `AgentWebSearchCollapsible`
- `tool-WebFetch` -> `AgentWebFetchTool`
- `tool-PlanWrite` -> `AgentPlanTool`
- `tool-TodoWrite` -> `AgentTodoTool`
- `tool-AskUserQuestion` -> `AgentAskUserQuestionTool`
- registry tools -> `AgentToolCall`
- MCP tools -> `AgentMcpToolCall`

这张分发表就是新增进度组件时最主要的 UI 接入点。

## 现有视觉行为

### 通用工具

`AgentToolCall` 位于 `src/renderer/features/agents/ui/agent-tool-call.tsx:11-20`，接收 `icon`、`title`、`subtitle`、`isPending`、`isError` 等 props。它目前在 pending 时用 `TextShimmer` 展示 title，见 `src/renderer/features/agents/ui/agent-tool-call.tsx:81-99`。

这里是给大多数 simple tools 加紧凑进度条或 activity indicator 的最佳共享位置。

### Bash

`AgentBashTool` 在 `src/renderer/features/agents/ui/agent-bash-tool.tsx:100-124` 会在命令输入 streaming 时显示 “Generating command” shimmer。卡片 header 在 `src/renderer/features/agents/ui/agent-bash-tool.tsx:132-190` 展示命令状态、成功/失败和 spinner。

如果需求是 shell 执行过程展示，优先改这里。

### Edit / Write

`AgentEditTool` 在 `src/renderer/features/agents/ui/agent-edit-tool.tsx:237-240` 推导 `isInputStreaming`。它在 `src/renderer/features/agents/ui/agent-edit-tool.tsx:354-361` 生成 streaming preview content，并在 `src/renderer/features/agents/ui/agent-edit-tool.tsx:363-389` 把流式 UI 更新 throttle 到 100ms。

卡片 header 在 `src/renderer/features/agents/ui/agent-edit-tool.tsx:487-545`，已经有状态区和 shimmer 行为。可以在这里加细进度条，但要保留 100ms throttle，并优先用 CSS transform 动画。

### Task / Subagent

`AgentTaskTool` 在 `src/renderer/features/agents/ui/agent-task-tool.tsx:59-83` 跟踪 elapsed time，在 `src/renderer/features/agents/ui/agent-task-tool.tsx:94-114` 生成最新 nested tool activity，并在 `src/renderer/features/agents/ui/agent-task-tool.tsx:200-228` 用 `AgentToolCall` 渲染嵌套工具。

这里适合做“子 Agent 正在执行 N 个步骤”“最新活动”“运行耗时”等展示。

### MCP

`AgentMcpToolCall` 在 `src/renderer/features/agents/ui/agent-mcp-tool-call.tsx:202-231` 推导 title 和状态，并在 `src/renderer/features/agents/ui/agent-mcp-tool-call.tsx:247-299` 渲染 compact pending shimmer。

MCP output 会在 `src/renderer/features/agents/ui/agent-mcp-tool-call.tsx:106-157` 的 `unwrapMcpOutput()` 中做展示归一。MCP progress 默认也应该做阶段型 UI，除非 MCP server 本身发 progress 且 OneCode 已经透传。

### 现有 progress 参考

`PreviewUrlInput` 已经有一套不确定进度动画，使用 `motion/react`，位置在 `src/renderer/features/agents/ui/preview-url-input.tsx:40-85`。对于“知道正在执行，但不知道真实百分比”的工具调用，可以参考这个模式。

## 推荐二开步骤

1. 新增共享进度组件，例如 `src/renderer/features/agents/ui/agent-tool-progress.tsx`。
2. 在 `agent-tool-registry.tsx` 的 `getToolStatus()` 附近新增 `ToolPhase` 和 `getToolPhase(part, chatStatus)`。
3. 扩展 `AgentToolCall`，增加可选 `phase`、`progressLabel`、`showProgress`。
4. 在 `AssistantMessageItem` 渲染 registry tools 时，把 progress props 传给 `AgentToolCall`。
5. 在 `AgentTaskTool` 渲染 nested registry tools 时传同样的 progress props。
6. 给 `AgentBashTool`、`AgentEditTool`、`AgentTaskTool`、`AgentMcpToolCall` 增加专用进度条或阶段提示。
7. UI 组件不要写 provider-specific 判断；基于 normalized 后的 `part.type`、`part.state`、`chatStatus` 和 tool metadata 推导。
8. 分别用 Claude 和 Codex 触发 `Read`、`Grep`、`Bash`、`Edit`、`Task`、MCP 工具验证。

## 什么时候扩展 Codex Normalizer

当 Codex 已经提供了某个字段，但字段形态不适合共享 UI 使用时，改 `src/shared/codex-tool-normalizer.ts`。

适合改 normalizer 的情况：

- Codex 工具名无法映射到 canonical `tool-*`。
- Codex 把重要展示字段放在 `input.args` 里。
- Codex 使用 `result`，但 UI 期望 `output`，或反过来。
- Codex 有 title/detail 字段，可以用于 progress label。
- Codex state 需要转换成 canonical tool states。

不要为了颜色、动画速度、间距、shimmer 风格这类纯视觉需求改 normalizer。

## 什么时候必须改 Claude/Codex 原始协议

改 provider 原始协议前，应该先告知用户：这个需求需要 normalized stream 当前没有的信息，所以 UI 封装层无法凭空实现。

典型例子：

- “Bash 执行显示真实 0-100% 进度。” 当前 stream 只暴露 tool state 和 output，没有真实命令执行百分比。
- “Bash 运行时逐行显示 stdout。” 如果 provider 只在完成时发 `tool-output-available`，UI 无法展示运行中 stdout，除非底层新增流式输出事件。
- “展示某个 MCP server 发出的 progress event。” 当前 `UIMessageChunk` 没有通用 MCP progress chunk。
- “展示精确文件写入字节数 / patch apply 百分比。” 当前 `tool-Edit` 和 `tool-Write` 能展示 streamed input 和最终 diff，但没有真实文件系统 apply progress。
- “区分 provider 内部阶段。” normalized tool part 只知道 input streaming、input available、output available、error、interrupted 等状态。

协议级改造通常要同时改：

1. `src/main/lib/claude/types.ts`，新增 chunk 字段或 chunk 类型。
2. Claude transform 或 Codex stream handling，真正 emit 新字段。
3. `src/shared/codex-tool-normalizer.ts`，如果 Codex 也需要 canonicalization。
4. Renderer transports，确保新字段不被丢弃。
5. Message part renderer，消费新字段。

如果没有真实 provider 数据，优先做 UI-first 的 synthetic phase，而不是伪造精确百分比。

## 实践规则

- 把 `AssistantMessageItem` 当成 renderer 收敛点。
- 把 `AgentToolRegistry` 当成工具 metadata / status 收敛点。
- 把 `AgentToolCall` 当成 compact generic tool 视觉面。
- 把 `AgentBashTool`、`AgentEditTool`、`AgentTaskTool`、`AgentMcpToolCall` 当成高价值专用视觉面。
- 优先使用 `part.state` 和 `chatStatus`；provider-specific 差异只放在 normalizer。
- 装饰性动画不要每个 stream chunk 都触发 React state 更新。
- 保留 `assistant-message-item.tsx:588-625` 的 collapse 行为，避免 progress UI 和最终回答折叠逻辑打架。
- 新增字段时同时考虑 live stream chunks 和 persisted messages。
