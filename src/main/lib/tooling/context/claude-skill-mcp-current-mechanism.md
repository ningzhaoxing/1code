# Claude Skill 与 MCP 当前机制

本文记录当前 1Code 中 Claude 侧 Skill 与 MCP 的发现、管理、展示和运行时加载机制，用于后续设计 `tooling` 管理模块和 `ProviderAdapter` 层。

本文只描述当前实现，不定义新方案。

> 状态说明：本文是引入 `src/main/lib/tooling` 三层抽象前的机制基线。后续实现已将 1Code 管理的 Claude user-scope 切到 `~/.1code/.claude`，并新增 `ToolingCatalog`、`ToolingStore` 和 `ClaudeAdapter`。新实现细节以 `tooling-three-layer-implementation-design.md`、OpenSpec changes 和当前代码为准。

## 1. 总体结论

Claude Skill 与 Claude MCP 现在是两套不同机制：

- Skill 是目录扫描机制。1Code 扫描 `~/.claude/skills`、`<project>/.claude/skills` 和插件 skill 目录；运行时通过 `CLAUDE_CONFIG_DIR` 隔离目录 + `settingSources: ["project", "user"]` 交给 Claude SDK 原生加载。
- MCP 是配置合并机制。1Code 读取并合并 `~/.claude.json`、`~/.claude/.claude.json`、`~/.claude/mcp.json`、项目 `.mcp.json` 和插件 MCP 配置；运行时把可用 MCP 作为 `options.mcpServers` 显式传给 Claude SDK。
- 设置页目前直接调用 `skills` router 和 `claude` router，没有统一的 Skill/MCP 管理域模型。
- 插件来源已具备只读语义；普通用户/项目 Skill 与 MCP 可编辑、可删除。
- Skill 没有启停概念；MCP 使用配置里的 `disabled` 字段表示停用。

## 2. 关键代码入口

### 2.1 Skill

- `src/main/lib/trpc/routers/skills.ts`
  - 负责扫描、创建、更新、删除 Skill。
  - 当前返回类型是 `FileSkill`，字段包括 `name`、`description`、`source`、`provider`、`pluginName`、`path`、`content`。
  - `source` 只有 `user | project | plugin`，没有 `official`。

- `src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`
  - 设置页 Skill UI。
  - 通过 `trpc.skills.list` 获取列表。
  - 通过 `item.source === "plugin"` 判断只读。
  - 用户/项目 Skill 支持创建、编辑、删除。

- `src/renderer/features/agents/mentions/agents-file-mention.tsx`
  - 输入框 `@` mention 列表中拉取 Skill。
  - 使用 `trpc.skills.listEnabled`。

- `src/main/lib/trpc/routers/claude.ts`
  - 解析 `@[skill:name]` mention。
  - 创建 Claude 会话时设置 `CLAUDE_CONFIG_DIR`。
  - 把 `~/.claude/skills` symlink 到隔离 config 目录。
  - 通过 `settingSources: ["project", "user"]` 让 Claude SDK 加载 Skill。

### 2.2 MCP

- `src/main/lib/claude-config.ts`
  - 负责读写 Claude MCP 配置。
  - 主要配置源：
    - `~/.claude.json`
    - `~/.claude/.claude.json`
    - `~/.claude/mcp.json`
    - `<project>/.mcp.json`
  - 提供 `updateMcpServerConfig()`、`removeMcpServerConfig()`、`getMergedGlobalMcpServers()`、`getMergedLocalProjectMcpServers()`、`readProjectMcpJson()` 等函数。

- `src/main/lib/mcp-auth.ts`
  - 负责 MCP OAuth、token 刷新、工具探测。
  - `ensureMcpTokensFresh()` 会在 MCP 注入 SDK 前刷新即将过期的 OAuth token。

- `src/main/lib/trpc/routers/claude.ts`
  - `getAllMcpConfigHandler()` 为设置页读取所有 Claude MCP，并探测状态。
  - Claude 会话启动时合并 MCP，并生成 `mcpServersForSdk`。
  - 最终通过 `options.mcpServers` 传给 Claude SDK。

- `src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx`
  - MCP 设置页。
  - 通过 `trpc.claude.getAllMcpConfig` 读取 Claude MCP。
  - 通过 `trpc.claude.addMcpServer`、`updateMcpServer`、`removeMcpServer` 管理 Claude MCP。
  - 通过 `disabled` 字段控制启停。

## 3. Claude Skill 当前机制

### 3.1 Skill 文件格式

Skill 是一个目录，目录内必须包含 `SKILL.md`：

```text
<skill-name>/
  SKILL.md
  references/
  scripts/
  assets/
```

`SKILL.md` 使用 frontmatter：

```markdown
---
name: security-mining-record
description: ...
---

...
```

当前 `skills.ts` 只读取 `SKILL.md` 的 frontmatter 和正文，不解析 `references/`、`scripts/`、`assets/` 的结构。

### 3.2 Skill 发现位置

当前 Claude Skill 发现位置在 `skills.ts` 中硬编码：

| 来源 | Provider | 扫描目录 |
|---|---|---|
| 用户 | Claude | `~/.claude/skills` |
| 项目 | Claude | `<cwd>/.claude/skills` |
| 插件 | Claude | `<plugin>/skills` |

插件 Skill 只在 `shouldListClaude` 时扫描。也就是说插件 Skill 当前只接入 Claude 视角。

### 3.3 Skill 列表返回模型

当前 `FileSkill`：

```ts
interface FileSkill {
  name: string
  description: string
  source: "user" | "project" | "plugin"
  provider: "claude" | "codex"
  pluginName?: string
  path: string
  content: string
}
```

当前缺失的统一管理字段：

- `kind`: 当前隐含为 `skill`。
- `readonly`: 当前 UI 根据 `source === "plugin"` 推导。
- `enabled`: Skill 当前没有启停。
- `origin`: 当前没有官方 `official` 来源。
- `scope`: 当前通过 `source` 和路径间接表达。
- `status`: Skill 当前没有运行时状态。

### 3.4 Skill 创建、更新、删除

创建：

- 用户 Skill 写入 `~/.claude/skills/<safe-name>/SKILL.md`。
- 项目 Skill 写入 `<cwd>/.claude/skills/<safe-name>/SKILL.md`。
- 创建时只写 `SKILL.md`，不创建 references/scripts/assets。

更新：

- 根据 UI 传入的 `path` 定位 `SKILL.md`。
- 重写 `SKILL.md` frontmatter 和正文。

删除：

- 根据 `SKILL.md` 的父目录删除整个 Skill 目录。

插件 Skill：

- UI 只读，不允许编辑或删除。
- 后端 router 目前没有显式阻止插件路径写入；只读主要由前端控制。

### 3.5 Skill 在输入框中的使用

输入框 Skill mention 走 `@` 体系：

- `agents-file-mention.tsx` 调 `trpc.skills.listEnabled`。
- Skill 选项 id 形如 `skill:<name>`。
- 插入后最终序列化为 `@[skill:<name>]`。

Claude router 中 `parseMentions()` 解析 `@[skill:name]`：

```text
用户输入: @[skill:security-mining-record] 做一次记录
解析结果: skillMentions = ["security-mining-record"]
清理后 prompt: 做一次记录
```

当前实现不会在 1Code 侧读取 Skill 文件并拼进 prompt，而是追加一句指令：

```text
Use the "security-mining-record" skill(s) for this task.
```

当输入只有 Skill mention 时，会构造：

```text
Invoke the "security-mining-record" skill(s) using the Skill tool for this task.
```

所以 Skill 的真正内容加载依赖 Claude SDK/runtime，而不是 1Code 手动展开。

### 3.6 Skill 运行时加载

Claude 会话启动时：

1. 为当前 `subChatId` 创建隔离目录：

```text
<userData>/claude-sessions/<subChatId>
```

2. 把用户目录下的 Claude 资源 symlink 到隔离目录：

```text
~/.claude/skills    -> <isolatedConfigDir>/skills
~/.claude/commands  -> <isolatedConfigDir>/commands
~/.claude/agents    -> <isolatedConfigDir>/agents
~/.claude/plugins   -> <isolatedConfigDir>/plugins
~/.claude/settings.json -> <isolatedConfigDir>/settings.json
```

3. 设置环境变量：

```text
CLAUDE_CONFIG_DIR=<isolatedConfigDir>
```

4. 调 Claude SDK 时传：

```ts
settingSources: ["project", "user"]
```

这意味着：

- user 级 Skill 通过隔离 config 目录下的 `skills` symlink 进入 Claude runtime。
- project 级 Skill 由 Claude SDK 根据 `cwd` 和 `settingSources` 从项目目录读取。
- 1Code 本身不直接执行 Skill，只负责让 Claude runtime 能看到 Skill。

## 4. Claude MCP 当前机制

### 4.1 MCP 配置源

当前 Claude MCP 来源包括：

| 来源 | 文件/位置 | 说明 |
|---|---|---|
| 用户 global | `~/.claude.json` 的根级 `mcpServers` | 1Code 主要写入位置 |
| 用户 global | `~/.claude/.claude.json` 的 `mcpServers` | 兼容 Claude Code 新配置 |
| 用户 global | `~/.claude/mcp.json` | 兼容单独 MCP 文件 |
| 项目 config | `~/.claude.json` 的 `projects[projectPath].mcpServers` | 1Code 项目级写入位置 |
| 项目 config | `~/.claude/.claude.json` 的 `projects[projectPath].mcpServers` | 兼容 Claude Code 新配置 |
| 项目文件 | `<project>/.mcp.json` | 项目根配置 |
| 插件 | 插件 `.mcp.json` / 插件配置 | 需要插件启用和审批 |

### 4.2 MCP 配置合并优先级

Global 合并：

```text
~/.claude/mcp.json
  < ~/.claude/.claude.json mcpServers
  < ~/.claude.json mcpServers
```

Project 合并：

```text
~/.claude/.claude.json projects[path].mcpServers
  < ~/.claude.json projects[path].mcpServers
```

会话注入时，项目 `.mcp.json` 也参与合并：

```text
projectServers = {
  ...projectMcpJsonServers,
  ...projectConfigServers
}
```

最终会话内的优先级：

```text
plugin < global < project
```

代码中实现为：

```ts
const allServers = {
  ...pluginServers,
  ...globalServers,
  ...projectServers,
}
```

同名冲突时，项目覆盖 global，global 覆盖 plugin。

### 4.3 MCP 设置页列表

设置页使用 `trpc.claude.getAllMcpConfig`：

1. 清空 `workingMcpServers` 缓存。
2. 读取 global 配置并合并。
3. 读取所有已知 project 配置。
4. 读取 DB 中项目的 `.mcp.json`。
5. 对每个 MCP server 调 `fetchToolsForServer()` 探测 tools。
6. 根据探测结果生成状态：
   - `connected`: 能拉到 tools。
   - `needs-auth`: 需要 OAuth/bearer 且没有可用 Authorization。
   - `failed`: 无 tools 且不属于待登录。
   - `disabled`: 通过配置推导。
   - `pending-approval`: 插件 MCP 未审批。

返回结构是：

```ts
{
  groups: Array<{
    groupName: string
    projectPath: string | null
    mcpServers: Array<{
      name: string
      status: string
      tools: McpToolInfo[]
      needsAuth: boolean
      config: Record<string, unknown>
    }>
  }>
}
```

这个结构是设置页专用结构，不是统一域模型。

### 4.4 MCP 创建、更新、删除

创建：

- `trpc.claude.addMcpServer`
- global 写入 `~/.claude.json.mcpServers[name]`。
- project 写入 `~/.claude.json.projects[projectPath].mcpServers[name]`。
- 支持 stdio 和 http：

```ts
stdio: { command, args?, env? }
http: { url, authType?, headers? }
```

更新：

- `trpc.claude.updateMcpServer`
- 支持更新名称、命令、参数、环境变量、URL、认证类型、bearer token、`disabled`。
- 启停实际是写入 `disabled: boolean`。

删除：

- `trpc.claude.removeMcpServer`
- 从 `~/.claude.json` 对应 global/project 位置删除。

限制：

- 当前 UI 对插件 MCP 不允许编辑/删除。
- 当前后端主要写 `~/.claude.json`，不会回写 `~/.claude/.claude.json`、`~/.claude/mcp.json` 或项目 `.mcp.json`。

### 4.5 MCP OAuth 与 token 刷新

OAuth 入口：

- `trpc.claude.startMcpOAuth`
- 内部调用 `startMcpOAuth(serverName, projectPath)`。

如果 server 在普通配置里找不到，会回退查插件 MCP；插件 OAuth 成功后，会把插件 server 提升/写入 global `~/.claude.json`。

Token 刷新：

- 会话注入前调用 `ensureMcpTokensFresh()`。
- token 即将过期时刷新。
- 刷新后的 token 会通过 `updateClaudeConfigAtomic()` 写回 `~/.claude.json`，避免并发覆盖。

### 4.6 MCP 运行时注入

Claude 会话启动时：

1. 读取并合并 global MCP。
2. 读取并合并 project MCP。
3. 读取项目 `.mcp.json`。
4. 读取插件 MCP，并只纳入已启用插件、已审批且未被用户/项目同名覆盖的 MCP。
5. 得到 `allServers`。
6. 如果 `workingMcpServers` 缓存存在，则过滤掉已知不可用 MCP。
7. 调 `ensureMcpTokensFresh()` 刷新 OAuth token。
8. 最终通过 Claude SDK options 传入：

```ts
mcpServers: mcpServersFiltered
```

这和 Skill 不同：

- Skill 依赖 Claude runtime 自己按 `settingSources` 读取目录。
- MCP 由 1Code 主动合并成对象，再传给 Claude SDK。

## 5. 当前 UI 与后端耦合点

### 5.1 Skill UI

设置页直接消费 `trpc.skills.list`：

- 前端自己把 Skill 和 Command 合并成 `UnifiedItem`。
- 前端按 `source` 分成 user/project/plugin。
- 只读规则在前端用 `source === "plugin"` 判断。
- create/update/delete 直接调用 `trpc.skills.*`。

### 5.2 MCP UI

设置页同时消费：

- `trpc.claude.getAllMcpConfig`
- `trpc.codex.getAllMcpConfig`

然后前端按 provider 分区展示。Claude MCP 的启停、删除、OAuth 都直接调用 `trpc.claude.*`。

这意味着现状下：

- UI 知道 provider 差异。
- UI 知道部分底层配置语义，比如 `disabled`。
- 没有统一的 `ToolingItem`、`ToolingOperation` 或 `ProviderAdapter`。

## 6. 对 ProviderAdapter 抽象的约束

后续抽象时，Claude adapter 不能只做“路径映射”，它至少要覆盖两类能力。

### 6.1 Skill adapter 能力

Claude Skill adapter 需要支持：

- 列出 user/project/plugin/official Skill。
- 创建 user/project Skill。
- 更新 user/project Skill。
- 删除 user/project Skill。
- 判断只读来源。
- 为运行时准备 Claude 可见的 Skill 目录。
- 保留 Claude SDK 原生 Skill 加载方式，不在 1Code 中手动展开 Skill 内容。

关键点：

- Claude user Skill 运行时靠 `CLAUDE_CONFIG_DIR/skills`。
- Claude project Skill 运行时靠 `cwd` + `settingSources: ["project", "user"]`。
- 插件 Skill 当前只对 Claude 生效。
- 官方 Skill 如果引入受管目录，需要在 adapter 层决定如何让 Claude runtime 可见。

### 6.2 MCP adapter 能力

Claude MCP adapter 需要支持：

- 列出 global/project/plugin/official MCP。
- 读取并归一化多配置源。
- 创建/更新/删除 user/project MCP。
- 启停 MCP。
- OAuth 登录与 token 刷新。
- 探测状态和 tools。
- 为运行时生成 Claude SDK `mcpServers` 对象。
- 保持同名优先级：project > global > plugin。

关键点：

- Claude MCP 运行时不是目录加载，而是 `options.mcpServers` 注入。
- OAuth token 刷新会写回 `~/.claude.json`。
- 设置页状态探测产生的 `workingMcpServers` 会影响会话注入过滤。

## 7. 当前机制的主要问题

当前机制能工作，但不适合作为统一 Skill/MCP 管理层的长期形态：

1. Skill 与 MCP 分散在不同 router 和 helper 中，缺少共同模型。
2. 管理 API 与 provider 实现耦合，router 同时承担业务逻辑和 API 边界。
3. UI 直接理解 provider 差异和配置细节。
4. 只读规则散落在前端，没有后端权限模型。
5. Skill 没有启停概念。
6. 官方内容没有独立来源和受管层。
7. MCP 状态探测、配置读取、运行时注入混在 `claude.ts` 中。
8. 当前返回结构更偏 UI 展示，不适合作为统一 domain model。

这些问题说明后续 `src/main/lib/tooling` 应该先抽后端领域层，再让现有 routers 逐步变薄。

## 8. 建议的后续迁移边界

当前代码可被拆成三类能力：

| 当前位置 | 应迁移到 tooling 的能力 |
|---|---|
| `skills.ts` | Skill store、Skill parser、Skill CRUD、Skill listing |
| `claude-config.ts` | Claude MCP config store、MCP merge strategy |
| `mcp-auth.ts` | MCP status/auth helper，可由 Claude MCP adapter 调用 |
| `claude.ts` | Claude runtime context builder、MCP injection builder、Skill runtime setup |
| settings tabs | 改为消费统一 tooling router，而不是直接理解 Claude/Codex 差异 |

阶段性做法应该是：

1. 保留现有文件读写格式。
2. 在 `src/main/lib/tooling` 下新增统一模型和 Claude adapter。
3. 让 `skillsRouter`、`claude.getAllMcpConfig` 先代理到新模块。
4. 验证 UI 行为不变。
5. 再引入 official source、启停清单和受管目录。

这样能先抽象 ProviderAdapter，不急着改变用户现有配置文件。
