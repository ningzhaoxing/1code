# 漏洞挖掘实时文档预览需求说明

日期：2026-06-18

## 1. 背景

本需求是在 1Code 桌面端现有能力基础上做二开，不是新做一个独立安全工作台。

目标是在用户使用 Agent 进行漏洞挖掘时，让 Agent 将关键过程和中间结果持续写入一份项目目录下的 Markdown 文件，并在 1Code 右侧文件预览区自动打开和实时预览该文件。

参考界面应贴合真实 1Code：

- 左侧：1Code 原有 workspace/sidebar。
- 中间：1Code 原有 Agent chat，展示用户任务、Agent 响应、工具调用、审批、文件修改记录。
- 右侧：1Code 原有文件预览器形态，用于打开和渲染 Markdown 文件。

## 2. 核心目标

用户发起漏洞挖掘任务后，系统应自动打开右侧 Markdown 实时文档预览。

这份文档仍然是普通项目文件。真实独立 worktree 场景下，记录文件直接放在当前 worktree 根目录，例如：

```text
<worktreePath>/漏洞挖掘记录.md
```

如果当前 chat 没有独立 worktree path，或 `worktreePath` 只是回退成了项目根目录，则在项目根目录下创建一个本次 chat/subChat 专属产物目录，例如：

```text
<project-root>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘记录.md
<project-root>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘报告.md
```

实时文档的保存位置按优先级确定：

1. 如果当前 chat 有真实独立 worktree path，优先保存到该 worktree 根目录。
2. 如果没有真实独立 worktree path，但能定位项目根目录，则在项目根目录下创建带唯一 ID 后缀的产物目录。
3. 如果项目根目录也不可用，则在 1Code 默认位置下创建带唯一 ID 后缀的产物目录。
3. 无论保存到哪个位置，右侧预览入口都应打开最终解析出的实际文件路径。

产物目录用于承载同一次漏洞挖掘的多个输出，P0 至少包含实时记录，后续报告导出也放在同一目录内，避免记录和报告各自再做一套文件名去重逻辑。

用户可以通过两种方式打开它：

1. 通过新增的“实时记录 / 挖掘记录”快捷按钮直接打开。
2. 通过 1Code 资源栏/文件目录手动找到并打开。

第一种方式是新增体验重点：用户不需要专门去文件目录里寻找这份文件。

## 3. “漏洞挖掘流程”的含义

这里的“漏洞挖掘流程”不是 1Code 现有代码里的固定概念，也不要求第一版先做复杂 workflow engine。

它指的是本次 PoC 里的业务场景：

1. 用户在 1Code 中发起漏洞挖掘任务。
2. Agent 按预置 skill 和相关 MCP/tool 执行任务。
3. Agent 在执行过程中自然沉淀关键过程、证据、发现和报告备注。
4. 这些内容被持续写入按路径优先级解析出的 Markdown 文件。
5. 1Code 右侧文件预览器自动打开并刷新该 Markdown。

后续如果产品需要，可以再将该场景抽象成更明确的任务模式或流程类型。

## 4. 用户体验

### 4.1 自动弹出右侧文档

当漏洞挖掘任务开始，且 Agent 创建或更新本次产物目录里的 `漏洞挖掘记录.md` 后，右侧文件预览器自动打开该文件。

自动打开不应改变 1Code 的整体布局逻辑，只是复用现有右侧文件预览区。

### 4.2 快捷入口

在 Agent chat 顶部或工具栏增加一个轻量按钮，例如：

```text
实时记录
```

点击后直接打开解析出的 Markdown 文件。

如果文件还不存在，应展示明确状态，例如：

```text
漏洞挖掘记录尚未创建，Agent 写入后会自动打开。
```

### 4.3 从文件目录打开

该 Markdown 文件仍然存在于用户项目目录中。因此用户也可以从资源栏/文件目录中手动打开。

这条路径是已有 1Code 行为，不是主要新增点。

### 4.4 聊天区联动

中间聊天区仍然展示 Agent 实时过程，包括：

- 用户发起任务。
- Agent 响应。
- 工具调用。
- 审批请求。
- 文件修改记录。
- 末尾报告导出入口。

当聊天区出现类似：

```text
Edited 1 file
漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘记录.md
```

点击该文件行时，应能打开右侧 Markdown 预览。

如果后续需要更强联动，可以支持“查看 Finding-001”后滚动到文档对应标题；P0 可以不做精确滚动。

## 5. Markdown 文档内容

Markdown 内容规范主要写在 skill 中，也可以在任务启动 prompt 中补充一次。

它不是前端强依赖的 schema，也不是要求 Agent 输出固定 JSON。

新建时，`漏洞挖掘记录.md` 应该是空白文件，不预置标题、章节或占位内容。

skill 只负责告诉 Agent 在什么时机写入哪些关键信息。Agent 可以按任务实际情况自行组织自然 Markdown，不需要套固定章节。

前端只负责读取和渲染 Markdown，不解析章节来驱动 UI。

## 6. Agent / Skill 要求

预置 skill 需要明确告诉 Agent：

1. 在漏洞挖掘任务中维护实时 Markdown 文件；默认优先写入当前项目根目录。
2. 关键进展、判断、发现、证据路径要及时写入该文件。
3. 使用自然 Markdown，避免为了前端展示强行套 JSON schema。
4. 不要把所有工具输出完整塞入文档，只沉淀关键结论和证据引用。
5. 如果产生截图、日志、DNSLog 等证据，应在 Markdown 中记录相对路径。
6. 最终报告生成时，不能只读取该 Markdown；必须结合完整挖掘过程、工具执行链路、审批/纠偏、文件变更、证据文件和该 Markdown 记录共同生成。

示例 skill 片段：

```md
当执行漏洞挖掘任务时，你必须维护任务 prompt 指定的漏洞挖掘记录文件。

文件保存位置：
- 优先写入用户当前项目根目录。
- 如果当前项目根目录不可用，则写入 1Code 默认位置。

你应在以下时机更新该文件：
- 用户确认测试对象、限制条件或授权边界后。
- 得到关键工具调用结果后。
- 出现疑似漏洞或确认问题后。
- 需要人工审批或用户纠偏后。
- 生成最终报告前。

该文件使用自然 Markdown，不使用 JSON schema，不预设固定章节。
```

## 7. 前端新增能力

P0 需要新增：

1. 一个“实时记录 / 挖掘记录”按钮。
2. 按路径优先级解析 Markdown 文件，并打开最终实际路径。
3. 漏洞挖掘任务开始后自动打开右侧文件预览。
4. 文件变化后的预览刷新。
5. Markdown 下载入口。

P0 不需要新增：

- 独立安全大屏。
- 单独的漏洞列表组件。
- 强结构化 Finding schema。
- 复杂图表。
- 单独报告预览页。

## 8. 报告导出

右侧只展示实时 Markdown 文档。

最终报告是 Markdown 文件，不是 Word。任务结束后，在聊天末尾或工具栏给出报告产物入口，例如：

```text
导出 Markdown 报告 · 下载
```

报告生成逻辑必须明确：最终报告不是“把右侧实时记录 Markdown 原样下载”。它应基于完整漏洞挖掘链路生成。

最终报告至少应汇总以下输入：

1. 当前 chat/subChat 的完整消息链路：用户目标、范围补充、多轮纠偏、Agent 阶段性判断和最终结论。
2. Agent 工具调用链路：调用了哪些工具、关键参数、关键输出摘要、失败或跳过原因。
3. 审批与安全边界：哪些动作需要人工放行、用户如何决策、哪些动作被明确禁止。
4. 文件与证据产物：`漏洞挖掘记录.md`、截图、日志、DNSLog、扫描摘要、复现脚本或其他证据文件路径。
5. 实时 Markdown 记录：作为过程沉淀和关键发现索引，而不是唯一信息源。

因此报告导出链路应是：

```text
完整聊天/执行事件 + 工具调用摘要 + 审批/纠偏记录 + 证据文件 + 漏洞挖掘记录.md
  -> 汇总生成最终报告 Markdown
  -> 保存为 漏洞挖掘报告.md
  -> 展示预览和下载入口
```

生成出的报告应面向最终交付，包含测试对象、授权边界、方法概述、关键发现、证据引用、复现/验证状态、风险判断、修复建议、未确认线索和免责声明。

## 9. 可复用现有能力

当前 1Code 已具备大部分基础能力，可以优先复用。

### Markdown 文件预览

`src/renderer/features/file-viewer/components/markdown-viewer.tsx`

现有能力：

- 读取 Markdown 文件。
- 渲染 Markdown。
- 在渲染视图和源码视图之间切换。
- 复制文件内容。
- 监听文件变化并 refetch。

### 文件预览侧栏

`src/renderer/features/file-viewer/components/file-viewer-sidebar.tsx`

现有能力：

- 根据文件类型选择对应 viewer。
- Markdown 文件会进入 `MarkdownViewer`。

### 文件读取与监听

`src/main/lib/trpc/routers/files.ts`

现有能力：

- `readTextFile`：读取文本文件，并处理文件过大、二进制、not found 等情况。
- `watchChanges`：监听项目目录变化并通知前端刷新。

### Agent 写文件事件

`src/main/lib/trpc/routers/claude.ts`

现有能力：

- Claude Write/Edit 工具完成后，会向 renderer 发出 `file-changed` 事件。

### 前端文件变化监听

`src/renderer/lib/hooks/use-file-change-listener.ts`

现有能力：

- 监听 Claude Write/Edit 产生的文件变化。
- 触发相关 diff/status 刷新。

### 右侧文件预览挂载位置

`src/renderer/features/agents/main/active-chat.tsx`

现有能力：

- 已有 `fileViewerPath` 状态。
- 已有右侧 `FileViewerSidebar` 挂载逻辑。
- 打开指定 Markdown 文件时，可复用该路径。

## 10. 源码调研后的实现口径

### 10.1 保存路径的现有机制与补充要求

1Code 当前不是只有一个“项目根目录”概念。源码里至少有两类路径：

1. `projects.path`：用户添加到 1Code 的原始项目目录，定义在 `src/main/lib/db/schema/index.ts` 的 `projects` 表。
2. `chats.worktreePath`：当前 workspace/chat 实际运行目录，定义在同一个 schema 的 `chats` 表。

创建 chat 时，如果启用 worktree，1Code 会把新 worktree 路径写入 `chats.worktreePath`；如果 worktree 创建失败，或者是 local mode，则回退到 `projects.path`。前端的聊天工作目录、文件搜索、资源栏、右侧文件预览也主要围绕 `worktreePath` 工作。

因此，本需求里的“当前项目根目录”在 P0 中应按 1Code 现有运行语义理解为：

```text
优先使用当前 chat/workspace 的实际工作目录 worktreePath。
如果 worktreePath 不可用，再回退到原始项目目录 projects.path。
如果二者都不可用，再回退到 1Code 默认位置。
```

建议最终路径解析优先级为：

```text
1. <worktreePath>/漏洞挖掘记录.md
2. <projects.path>/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘记录.md
3. <app.getPath("userData")>/security-mining-records/漏洞挖掘-<chatId短ID>-<subChatId短ID>/漏洞挖掘记录.md
```

需要注意：

- 文件放在真实 `worktreePath` 下时，资源栏、文件搜索、右侧预览、文件监听最贴合现有 1Code 行为。
- 如果 `worktreePath` 不存在或等于 `projects.path`，说明当前 chat 没有独立 worktree；此时在 `projects.path` 下创建产物目录，目录名带 chat/subChat 短 ID，用固定文件名保存记录和报告。
- 文件放在 `app.getPath("userData")` 下时，它不属于用户项目文件树，通常只能通过快捷按钮打开；如果仍要实时刷新，需要让 Markdown viewer 监听该 fallback 产物目录，而不是继续监听 `worktreePath`。
- 同一次漏洞挖掘的最终报告路径建议为同目录下的 `漏洞挖掘报告.md`。

### 10.2 文件创建/初始化的现有机制与补充要求

现有 `MarkdownViewer` 和 `files.readTextFile` 主要解决“读取并预览已有文件”的问题。当前没有一个面向业务流程的接口，专门负责创建本次对话对应的漏洞挖掘记录文件。

已有的写文件能力是特化场景，例如 `files.writePastedText` 会把大段 pasted text 写入：

```text
<app.getPath("userData")>/claude-sessions/<subChatId>/pasted/
```

它不能直接复用为漏洞挖掘记录文件，因为本需求要求：

- 优先写入用户当前 workspace/project。
- 真实 worktree 场景文件名固定；回退场景目录名带唯一 ID，目录内文件名固定。
- 需要返回给前端用于打开右侧预览。
- 需要兼容 fallback 到 1Code 默认目录。

因此建议新增一个专用 tRPC 能力，例如：

```ts
securityMiningRecord.ensure({
  chatId,
  subChatId,
  worktreePath,
  projectPath,
})
```

该接口职责：

1. 按 `worktreePath -> projects.path -> userData` 优先级解析最终文件路径。
2. 校验最终路径不能逃逸允许目录。
3. 如果文件不存在，创建一个空白 Markdown 文件。
4. 返回给前端：

```ts
{
  artifactDir: string
  filePath: string
  projectPath: string
  relativePath?: string
  reportPath: string
  reportRelativePath?: string
  created: boolean
  storage: "worktree" | "project" | "userData"
}
```

初始文件必须为空白，不预置标题、章节或占位内容。后续内容主要由 Agent 通过 skill 持续维护，前端不解析章节，不把它当 JSON schema。

### 10.3 右侧自动弹出与实时刷新

现有 Claude 路由在 Write/Edit 工具完成后，会向 renderer 发出 `file-changed` 事件。前端已有 `useFileChangeListener(worktreePath)`，目前主要用于刷新 diff/status。

本需求需要在此基础上补充：

1. 规范化 Agent 写文件事件里的路径：兼容绝对路径和相对路径。
2. 判断变更文件是否是当前 chat/subChat 解析出的 `漏洞挖掘记录.md`。
3. 如果命中，则调用现有 `setFileViewerPath(filePath)` 打开右侧文件预览。
4. 同时 invalidate `files.search`，让资源栏能尽快出现新建的 Markdown 文件。
5. 如果用户手动关闭过右侧文档，需要避免同一轮任务中反复打扰式弹出；P0 可以用前端状态控制。

Markdown viewer 当前会用传入的 `projectPath` 调用 `files.watchChanges`。如果记录文件在 `worktreePath` 下，现有机制基本可复用；如果记录文件在 `userData` fallback 目录下，需要让 viewer 使用 fallback 目录作为监听根。

### 10.4 漏洞挖掘 Skill

P0 必须配套一个漏洞挖掘 skill。该 skill 是产品厚度的关键，不只是 UI 附属功能。

现有 1Code/Claude Skill 支持两类安装位置：

```text
~/.claude/skills/
<cwd>/.claude/skills/
```

本 PoC 第一版采用用户级 Claude skill，但不由 1Code 运行时硬编码生成。Skill 作为外置文件维护，源码中的外置文件位置为：

```text
skills/security-mining-record/SKILL.md
```

安装时复制到 Claude 原生用户级 skill 目录：

```text
~/.claude/skills/security-mining-record/SKILL.md
```

原因：

- 这是 Claude Code 原生的用户级 skill 目录，能被 1Code 当前 Claude 路由通过 `settingSources: ["project", "user"]` 加载。
- skill 本身是通用漏洞挖掘记录规则，不应该跟某一个项目目录绑定。
- 每次任务的实际 `漏洞挖掘记录.md` 路径由 1Code 在任务 prompt 中注入，避免用户级 skill 被固定到某一个项目路径。

该 skill 需要明确告诉 Agent：

1. 当前任务是漏洞挖掘任务，且任务 prompt 提供实时记录路径和最终报告路径时，必须维护指定路径的漏洞挖掘记录文件。
2. 用户确认测试对象、限制条件或授权边界时，应及时更新该 Markdown。
3. 工具调用出现有价值结果、疑似漏洞、人工审批、用户纠偏或最终报告前，应及时补充关键结论和证据引用。
4. 使用自然 Markdown，不输出固定 JSON schema，也不要求固定章节。
5. 不要把工具原始输出整段堆入文档，只保留关键结论、证据引用和复核状态。
6. 任务完成后，最终 Markdown 报告应以完整聊天/执行链路、工具调用摘要、审批/纠偏记录、证据文件和这份实时记录共同作为输入，并写入 prompt 指定的报告路径。

任务启动时，前端或后端需要把 resolved record path 和 report path 注入给 Agent，例如：

```text
本次漏洞挖掘实时记录文件路径为：
<resolved-record-path>

本次漏洞挖掘最终 Markdown 报告路径为：
<resolved-report-path>

请使用漏洞挖掘 skill：执行过程中持续维护实时记录；任务完成后写入最终 Markdown 报告。
```

### 10.5 Codex Provider 兼容说明

当前调研重点基于 1Code + Claude Code 跑通 PoC。Claude 路由已有 skill mention 解析和 `settingSources: ["project", "user"]` 配置，能加载 Claude Skill。

Codex provider 这条链路目前主要传入 `prompt/cwd/projectPath/mode`，并把 `provider.tools` 交给模型使用。源码中没有看到与 Claude 同等的 skill mention 解析和 `.claude/skills` 加载逻辑。

因此，如果后续漏洞挖掘流程切到 Codex provider，需要单独补兼容策略：

- 要么把漏洞挖掘 skill 内容转成 prompt 注入。
- 要么接入 Codex 自身的 skill/指令加载机制。
- 要么在产品侧限制第一版漏洞挖掘流程只走 Claude Code。

### 10.6 不走 OpenSpec/PR 申请流程

本需求作为 PoC 二开任务推进，不要求通过 OpenSpec 提案或 PR 申请流程。后续开发可以直接按本文档和源码调研结论拆任务实施。

## 11. P0 验收标准

1. 用户发起漏洞挖掘任务后，Agent 能创建或更新本次产物目录里的 `漏洞挖掘记录.md`。
2. 右侧文件预览器能自动弹出并展示该文件。
3. 点击“实时记录 / 挖掘记录”按钮能直接打开该文件。
4. 从资源栏/文件目录手动打开该文件仍然可用。
5. 文件优先保存到当前项目根目录；找不到项目根目录时，保存到 1Code 默认位置。
6. Agent 更新该 Markdown 后，右侧预览能刷新。
7. 该功能不破坏 1Code 原有 chat、file viewer、diff、resource/sidebar 行为。
8. 前端不要求 Agent 输出 JSON schema。
9. Agent 完成任务并写入 `漏洞挖掘报告.md` 后，最终报告入口在聊天末尾或工具栏出现，可在右侧 Markdown 预览器打开和下载。
10. 最终报告不能只由 `漏洞挖掘记录.md` 直接转换得到；必须能体现完整任务链路、工具执行过程、审批/纠偏和证据引用。

## 12. 原型参考

当前 HTML 原型路径：

```text
docs/prototypes/security-mining-record-preview.html
```

该原型用于表达界面关系：

- 右侧文档是 1Code 文件预览器，不是新安全大屏。
- 文档可以自动弹出，也可以通过按钮打开。
- 文件仍然存在于项目目录中，可通过资源栏打开。
