# 1Code 中 Codex 的 Skill 与 MCP 复用路径

本文整理 1Code 桌面端对 Codex CLI binary、codex-acp、Skill、MCP 的完整支持链路。结论先行：

- 1Code 查询 Codex MCP / 登录 Codex 时使用的是项目下载并随 App 打包的 Codex CLI binary，而不是直接依赖用户 PATH 里的 `codex`。
- 1Code 运行 Codex 会话时还会启动 `@zed-industries/codex-acp-*` 包里的 `codex-acp` binary，通过 ACP provider 与 Codex 交互。
- Codex 默认 `CODEX_HOME=~/.1code/codex`，不是本机默认 `~/.codex`；只有外部环境显式设置同一个 `CODEX_HOME` 时才共享。
- Codex MCP 不是通过读取 Claude MCP 配置复用，而是通过 bundled Codex CLI 执行 `codex mcp list --json`，在 `CODEX_HOME` 环境下解析 Codex 自己的 MCP 配置，再传入 ACP provider session。
- OneCode 安装 Codex MCP 时调用 bundled `codex mcp add ...`，写入当前 `CODEX_HOME`。
- Codex 这边没有 Claude 那套 `~/.claude/skills` symlink、`settingSources`、`Skill tool` 触发链路；产品里的 Skill 管理目前仍是 Claude 路径，Codex 会话只接收 prompt、MCP tools 和 ACP provider tools。

## 1. Codex 的 binary、Skill 与 MCP 复用路径

Codex 这条链路和 Claude 不同：Codex 不是通过 Claude SDK 的 `settingSources`/`mcpServers` 机制加载 Skill/MCP，而是通过两类 binary 协作：

- bundled Codex CLI：用于 `codex login`、`codex login status`、`codex mcp list --json`、`codex mcp login` 这类 CLI 操作。
- `codex-acp` binary：来自 `@zed-industries/codex-acp-*` npm package，用于实际 ACP 会话。

### 1.1 构建阶段：为什么 1Code 需要下载 Codex CLI binary

`package.json` 定义了 Codex binary 下载脚本：

代码位置：`package.json:25`

```json
"codex:download": "node scripts/download-codex-binary.mjs --version=0.98.0"
```

release 链路也把 Codex 下载放在 build/package 之前：

代码位置：`package.json:27`

```json
"release": "rm -rf release && bun i && bun run claude:download && bun run codex:download && bun run build && bun run package:mac && bun run dist:manifest && ./scripts/upload-release-wrangler.sh"
```

下载脚本开头直接说明用途：

代码位置：`scripts/download-codex-binary.mjs:3`

```js
 * Downloads Codex CLI native binaries for bundling with the Electron app.
```

脚本从 OpenAI Codex release 下载：

代码位置：`scripts/download-codex-binary.mjs:22`

```js
const RELEASE_REPO = "openai/codex"
const RELEASE_TAG_PREFIX = "rust-v"
```

不同平台对应不同 release asset，输出统一叫 `codex` 或 `codex.exe`：

代码位置：`scripts/download-codex-binary.mjs:26`

```js
const PLATFORMS = {
  "darwin-arm64": {
    assetName: "codex-aarch64-apple-darwin.tar.gz",
    extractedBinaryName: "codex-aarch64-apple-darwin",
    outputBinaryName: "codex",
  },
  ...
  "win32-x64": {
    assetName: "codex-x86_64-pc-windows-msvc.exe",
    outputBinaryName: "codex.exe",
  },
}
```

下载目标是 `resources/bin/<platform-arch>/codex`：

代码位置：`scripts/download-codex-binary.mjs:253`

```js
const targetDir = path.join(BIN_DIR, platformKey)
const targetPath = path.join(targetDir, platform.outputBinaryName)
```

脚本会校验 hash、解压 tar.gz、复制 binary、设置可执行权限：

代码位置：`scripts/download-codex-binary.mjs:292`

```js
const actualHash = await calculateSha256(downloadPath)
if (actualHash !== expectedHash) {
  ...
  return false
}
```

代码位置：`scripts/download-codex-binary.mjs:306`

```js
if (platform.assetName.endsWith(".tar.gz")) {
  ...
  fs.copyFileSync(extractedPath, targetPath)
} else {
  fs.copyFileSync(downloadPath, targetPath)
}
```

代码位置：`scripts/download-codex-binary.mjs:328`

```js
if (!platformKey.startsWith("win32")) {
  fs.chmodSync(targetPath, 0o755)
}
```

Electron 打包时，和 Claude 一样，当前平台的 binary 会被复制进 App resources：

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

闭环判断：

```text
bun run codex:download
  -> scripts/download-codex-binary.mjs
  -> openai/codex rust-v<version> release asset
  -> resources/bin/<platform-arch>/codex
  -> electron-builder extraResources 复制到 App resources/bin
```

这证明 1Code 的 Codex CLI 操作依赖项目下载并打包的 Codex CLI binary。

### 1.2 运行阶段：1Code 如何定位并使用 bundled Codex CLI

运行时，Codex router 有单独的 bundled CLI 路径解析函数：

代码位置：`src/main/lib/trpc/routers/codex.ts:238`

```ts
function resolveBundledCodexCliPath(): string {
```

开发环境和生产环境路径不同：

代码位置：`src/main/lib/trpc/routers/codex.ts:239`

```ts
const binaryName = process.platform === "win32" ? "codex.exe" : "codex"
const resourcesDir = app.isPackaged
  ? join(process.resourcesPath, "bin")
  : join(
      app.getAppPath(),
      "resources",
      "bin",
      `${process.platform}-${process.arch}`,
    )
```

如果本地开发没有下载 binary，会提示执行下载脚本：

代码位置：`src/main/lib/trpc/routers/codex.ts:254`

```ts
const hint = app.isPackaged
  ? "Binary is missing from bundled resources."
  : "Run `bun run codex:download` to download it for local dev."
```

所有 Codex CLI 调用都会先走这个 bundled path：

代码位置：`src/main/lib/trpc/routers/codex.ts:391`

```ts
const codexCliPath = resolveBundledCodexCliPath()
```

随后用这个路径 `spawn`：

代码位置：`src/main/lib/trpc/routers/codex.ts:395`

```ts
const child = spawn(codexCliPath, args, {
  stdio: ["ignore", "pipe", "pipe"],
  cwd: cwd && cwd.length > 0 ? cwd : undefined,
  env: buildBaseCodexEnv(),
  windowsHide: true,
})
```

登录流程同样使用 bundled Codex CLI，而不是 PATH 里的 `codex`：

代码位置：`src/main/lib/trpc/routers/codex.ts:1346`

```ts
const codexCliPath = resolveBundledCodexCliPath()
```

代码位置：`src/main/lib/trpc/routers/codex.ts:1349`

```ts
const child = spawn(codexCliPath, ["login"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: buildBaseCodexEnv(),
  windowsHide: true,
})
```

闭环判断：

```text
resources/bin/<platform-arch>/codex
  -> resolveBundledCodexCliPath()
  -> runCodexCli(args)
  -> spawn(codexCliPath, args, { env: buildBaseCodexEnv() })
  -> codex login / codex mcp list / codex mcp login
```

### 1.3 Codex 的 CODEX_HOME：默认不是本机 ~/.codex

Codex router 定义默认 home：

代码位置：`src/main/lib/trpc/routers/codex.ts:141`

```ts
const DEFAULT_CODEX_HOME = join(homedir(), ".1code", "codex")
```

构建 CLI/ACP 环境时，会优先保留已有 `process.env` 和 shell env，然后设置 `CODEX_HOME`：

代码位置：`src/main/lib/trpc/routers/codex.ts:268`

```ts
function buildBaseCodexEnv(): Record<string, string> {
```

代码位置：`src/main/lib/trpc/routers/codex.ts:286`

```ts
env.CODEX_HOME = ensureCodexHome(env.CODEX_HOME?.trim() || DEFAULT_CODEX_HOME)
```

这段逻辑的含义是：

```text
如果外部环境已经设置 CODEX_HOME：
  1Code 沿用该 CODEX_HOME

否则：
  1Code 使用 ~/.1code/codex 作为 Codex home
```

因此，默认情况下，1Code 的 bundled Codex CLI 不直接复用用户本机默认的 `~/.codex`。它会在 `CODEX_HOME=~/.1code/codex` 下执行 Codex CLI 操作。只有当启动 1Code 的外部环境显式设置了 `CODEX_HOME`，才会改用那个环境指定的 Codex home。

这也是 Codex 与 Claude 的关键差异：

```text
Claude:
  1Code 显式 symlink ~/.claude/skills 等资产到 isolatedConfigDir

Codex:
  1Code 默认设置 CODEX_HOME=~/.1code/codex
  没有把 ~/.codex symlink 到 1Code 目录
```

### 1.4 Codex 会话使用的是 codex-acp binary

Codex 聊天会话不是直接 `spawn bundled codex` 来跑对话，而是创建 ACP provider。ACP binary 来自 npm package：

代码位置：`src/main/lib/trpc/routers/codex.ts:224`

```ts
function resolveCodexAcpBinaryPath(): string {
```

代码位置：`src/main/lib/trpc/routers/codex.ts:227`

```ts
const codexPackageRoot = dirname(
  require.resolve("@zed-industries/codex-acp/package.json"),
)
const resolvedPath = require.resolve(`${packageName}/bin/${binaryName}`, {
  // Resolve relative to the wrapper package so nested optional deps work in packaged apps.
  paths: [codexPackageRoot],
})
```

创建 provider 时，`command` 指向这个 ACP binary：

代码位置：`src/main/lib/trpc/routers/codex.ts:1257`

```ts
const provider = createACPProvider({
  command: resolveCodexAcpBinaryPath(),
  env: buildCodexProviderEnv(params.authConfig),
  authMethodId: getCodexAuthMethodId(params.authConfig),
  session: {
    cwd: params.cwd,
    mcpServers: params.mcpServers,
  },
  ...
  persistSession: true,
})
```

如果用户在 1Code 里配置 app-managed API key，provider env 会注入 `CODEX_API_KEY`：

代码位置：`src/main/lib/trpc/routers/codex.ts:1137`

```ts
function buildCodexProviderEnv(authConfig?: { apiKey: string }): Record<string, string> {
```

代码位置：`src/main/lib/trpc/routers/codex.ts:1145`

```ts
return {
  ...env,
  CODEX_API_KEY: apiKey,
}
```

并指定 ACP auth method：

代码位置：`src/main/lib/trpc/routers/codex.ts:1159`

```ts
// codex-acp advertises auth methods:
// - chatgpt
// - codex-api-key
// - openai-api-key
// For app-managed API key path we want deterministic key auth.
return "codex-api-key"
```

闭环判断：

```text
Codex 聊天请求
  -> getOrCreateProvider()
  -> createACPProvider({ command: resolveCodexAcpBinaryPath(), env, session })
  -> codex-acp 负责实际 ACP 会话
```

### 1.5 Codex MCP 的读取路径：通过 bundled Codex CLI 查询 Codex 配置

Codex MCP 不走 Claude 的 `~/.claude.json` / `.mcp.json` 合并逻辑。Codex router 通过 bundled Codex CLI 执行：

代码位置：`src/main/lib/trpc/routers/codex.ts:827`

```ts
const result = await runCodexCliChecked(["mcp", "list", "--json"], {
  cwd: lookupPath === "__global__" ? undefined : lookupPath,
})
```

这里的 `runCodexCliChecked()` 会进入前面的 `runCodexCli()`，也就是：

```text
resolveBundledCodexCliPath()
  -> spawn(bundled codex, ["mcp", "list", "--json"], { cwd, env: buildBaseCodexEnv() })
```

然后解析 Codex CLI 的 JSON 输出：

代码位置：`src/main/lib/trpc/routers/codex.ts:831`

```ts
let parsed: unknown
try {
  parsed = JSON.parse(result.stdout)
} catch {
  throw new Error("Failed to parse Codex MCP list JSON output.")
}

const entries = z.array(codexMcpListEntrySchema).parse(parsed)
```

Codex MCP server 会被转换成两份数据：

- `mcpServersForSession`：传给 ACP provider session。
- `mcpServersForSettings`：给设置页/侧边栏展示状态、工具、鉴权信息。

代码位置：`src/main/lib/trpc/routers/codex.ts:839`

```ts
const mcpServersForSession: CodexMcpServerForSession[] = []
const mcpServersForSettings: CodexMcpServerForSettings[] = []
```

stdio 类型会转成 ACP session server：

代码位置：`src/main/lib/trpc/routers/codex.ts:863`

```ts
if (transportType === "stdio") {
  const command = entry.transport.command || undefined
  const args = entry.transport.args || undefined
  if (includeInSession && command) {
    const envPairs = objectToPairs(resolvedStdioEnv) || []
    sessionServer = {
      name: entry.name,
      type: "stdio",
      command,
      args: Array.isArray(args) ? args : [],
      env: envPairs,
    }
  }
}
```

HTTP/SSE 类型也会转成 ACP session server：

代码位置：`src/main/lib/trpc/routers/codex.ts:881`

```ts
} else if (
  transportType === "streamable_http" ||
  transportType === "http" ||
  transportType === "sse"
) {
  const url = entry.transport.url || undefined
  const headers = objectToPairs(resolvedHttpHeaders)
  if (includeInSession && url) {
    sessionServer = {
      name: entry.name,
      type: "http",
      url,
      headers: headers || [],
    }
  }
}
```

如果需要展示 tools，1Code 会探测 MCP tools；需要鉴权且没有可用 auth 的 server 不会被探测：

代码位置：`src/main/lib/trpc/routers/codex.ts:904`

```ts
const shouldProbeTools =
  shouldIncludeTools &&
  includeInSession &&
  !authState.needsAuth &&
  (
    // Probe unauthenticated/public servers and stdio servers.
    !authState.supportsAuth ||
    transportType === "stdio" ||
    // For auth-capable HTTP, only probe if explicit auth header is available.
    Boolean(resolvedHttpHeaders?.Authorization)
  )
const tools = shouldProbeTools ? await fetchCodexMcpTools(entry) : []
```

最后把 session server 放进 snapshot：

代码位置：`src/main/lib/trpc/routers/codex.ts:933`

```ts
for (const converted of convertedEntries) {
  if (converted.sessionServer) {
    mcpServersForSession.push(converted.sessionServer)
  }
  mcpServersForSettings.push(converted.settingsServer)
}
```

并用 fingerprint 缓存：

代码位置：`src/main/lib/trpc/routers/codex.ts:940`

```ts
const snapshot: CodexMcpSnapshot = {
  mcpServersForSession,
  groups: [
    {
      groupName: "Global",
      projectPath: null,
      mcpServers: mcpServersForSettings,
    },
  ],
  fingerprint: getCodexMcpFingerprint(mcpServersForSession),
  fetchedAt: Date.now(),
  toolsResolved: shouldIncludeTools,
}
```

完整 MCP 读取闭环：

```text
Codex MCP 配置
  -> 由 Codex CLI 根据 CODEX_HOME 和 cwd 自己解析
  -> 1Code 调用 bundled codex: codex mcp list --json
  -> 1Code 解析 JSON 输出
  -> 转换为 ACP session mcpServers
  -> 缓存 snapshot/fingerprint
```

这里的“复用”不是复用 Claude MCP 配置，也不是 1Code 自己解析 `~/.codex/config.toml` 后合并；而是复用 Codex CLI 自身对 Codex MCP 配置的解析能力。

### 1.6 Codex MCP 如何进入实际对话会话

Codex chat 请求发起时，renderer 只把 prompt、cwd、projectPath、model、mode、sessionId、images、authConfig 传给后端：

代码位置：`src/renderer/features/agents/lib/acp-chat-transport.ts:161`

```ts
sub = trpcClient.codex.chat.subscribe(
  {
    subChatId: this.config.subChatId,
    chatId: this.config.chatId,
    runId,
    prompt,
    cwd: this.config.cwd,
    ...(this.config.projectPath
      ? { projectPath: this.config.projectPath }
      : {}),
    model: selectedModel,
    mode: currentMode,
    ...(sessionId ? { sessionId } : {}),
    ...(forceNewSession ? { forceNewSession: true } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(codexApiKey
      ? {
          authConfig: {
            apiKey: codexApiKey,
          },
        }
      : {}),
  },
```

注意，这里没有传 Skill 列表、Skill 路径、Skill content，也没有类似 Claude 的 `settingSources`。

后端在开始会话前，先基于 projectPath/worktree/cwd 选择 MCP lookup path：

代码位置：`src/main/lib/trpc/routers/codex.ts:1720`

```ts
const resolvedProjectPathFromCwd = resolveProjectPathFromWorktree(
  input.cwd,
)
const mcpLookupPath =
  input.projectPath || resolvedProjectPathFromCwd || input.cwd
mcpSnapshot = await resolveCodexMcpSnapshot({
  lookupPath: mcpLookupPath,
})
```

然后把 `mcpSnapshot.mcpServersForSession` 传给 provider：

代码位置：`src/main/lib/trpc/routers/codex.ts:1733`

```ts
const provider = getOrCreateProvider({
  subChatId: input.subChatId,
  cwd: input.cwd,
  mcpServers: mcpSnapshot.mcpServersForSession,
  mcpFingerprint: mcpSnapshot.fingerprint,
  existingSessionId:
    input.forceNewSession
      ? undefined
      : input.sessionId ?? getLastSessionId(existingMessages),
  authConfig: input.authConfig,
})
```

`getOrCreateProvider()` 内部再把 MCP 放进 ACP session：

代码位置：`src/main/lib/trpc/routers/codex.ts:1261`

```ts
session: {
  cwd: params.cwd,
  mcpServers: params.mcpServers,
},
```

实际模型调用时，Codex 使用的是 ACP provider 暴露出来的 tools：

代码位置：`src/main/lib/trpc/routers/codex.ts:1766`

```ts
const result = streamText({
  model: provider.languageModel(selectedModelId),
  messages: [
    {
      role: "user",
      content: buildModelMessageContent(input.prompt, input.images),
    },
  ],
  tools: provider.tools,
  abortSignal: abortController.signal,
})
```

完整 MCP 使用闭环：

```text
renderer codex.chat.subscribe({ prompt, cwd, projectPath, model, sessionId, authConfig })
  -> 后端选择 mcpLookupPath
  -> resolveCodexMcpSnapshot()
  -> bundled codex mcp list --json
  -> 转换为 mcpServersForSession
  -> createACPProvider({ session: { cwd, mcpServers } })
  -> streamText({ model: provider.languageModel(...), tools: provider.tools })
  -> Codex 会话里可使用 ACP provider 暴露的 MCP tools
```

### 1.7 Codex Skill：产品会展示 Claude Skill，但 Codex 会话没有 Claude 式 Skill 加载闭环

产品里的 Skill 管理路由读取的是 Claude 路径：

代码位置：`src/main/lib/trpc/routers/skills.ts:115`

```ts
const userSkillsDir = path.join(os.homedir(), ".claude", "skills")
const userSkillsPromise = scanSkillsDirectory(userSkillsDir, "user")
```

项目 Skill 也读取 `.claude/skills`：

代码位置：`src/main/lib/trpc/routers/skills.ts:119`

```ts
if (input?.cwd) {
  const projectSkillsDir = path.join(input.cwd, ".claude", "skills")
  projectSkillsPromise = scanSkillsDirectory(projectSkillsDir, "project", input.cwd)
}
```

创建 Skill 时，同样写入 Claude 路径：

代码位置：`src/main/lib/trpc/routers/skills.ts:213`

```ts
targetDir = path.join(input.cwd, ".claude", "skills")
```

代码位置：`src/main/lib/trpc/routers/skills.ts:215`

```ts
targetDir = path.join(os.homedir(), ".claude", "skills")
```

mention UI 会把这些 Skill 转成 mention option：

代码位置：`src/renderer/features/agents/mentions/agents-file-mention.tsx:723`

```ts
const { data: skills = [], isFetching: isFetchingSkills } = trpc.skills.listEnabled.useQuery(
  projectPath ? { cwd: projectPath } : undefined,
  {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes - skills don't change frequently
  },
)
```

代码位置：`src/renderer/features/agents/mentions/agents-file-mention.tsx:849`

```ts
const skillOptions: FileMentionOption[] = useMemo(() => {
  ...
  return skills
    ...
    .map(skill => ({
      id: `${MENTION_PREFIXES.SKILL}${skill.name}`,
      label: skill.name,
      path: skill.path,
      ...
      type: "skill" as const,
    }))
}, [skills, debouncedSearchText])
```

选择 mention 时只是插入 mention：

代码位置：`src/renderer/features/agents/main/chat-input-area.tsx:1021`

```ts
// Otherwise: insert mention as normal
editorRef.current?.insertMention(mention)
```

到了 Codex transport，入参只保留最终 prompt 等字段：

代码位置：`src/renderer/features/agents/lib/acp-chat-transport.ts:161`

```ts
sub = trpcClient.codex.chat.subscribe(
  {
    subChatId: this.config.subChatId,
    chatId: this.config.chatId,
    runId,
    prompt,
    cwd: this.config.cwd,
    ...
  },
```

Codex 后端把 prompt 作为普通 user message 传入模型：

代码位置：`src/main/lib/trpc/routers/codex.ts:1766`

```ts
const result = streamText({
  model: provider.languageModel(selectedModelId),
  messages: [
    {
      role: "user",
      content: buildModelMessageContent(input.prompt, input.images),
    },
  ],
  tools: provider.tools,
  abortSignal: abortController.signal,
})
```

这里没有 Claude router 中的这些步骤：

```text
parseMentions(promptForModel)
  -> skillMentions
  -> prompt 改写为 "Use/Invoke the ... skill(s)"
  -> settingSources = ["project", "user"]
  -> Claude Code Skill tool
```

所以 Codex Skill 的真实边界是：

```text
产品 UI / Skill 管理：
  可以列出和插入 ~/.claude/skills、项目 .claude/skills 里的 Skill mention

Codex 会话执行：
  只收到 prompt 文本
  没有读取 ~/.claude/skills
  没有读取 ~/.codex/skills
  没有 CODEX_HOME/skills 加载逻辑
  没有 settingSources
  没有 Skill tool 触发链路
```

因此，当前 1Code 对 Codex 的 Skill 支持不能等同于 Claude Code 的 Skill 支持。它最多是“UI 层可选择/插入 Claude Skill mention 文本”，但没有像 Claude 那样把 Skill 文件系统和运行时 Skill tool 连成闭环。

### 1.8 Codex 小结

```text
构建/打包：
  bun run codex:download
    -> resources/bin/<platform-arch>/codex
    -> electron-builder extraResources 到 App resources/bin

CLI 操作：
  resolveBundledCodexCliPath()
    -> bundled codex
    -> codex login / codex mcp list --json / codex mcp login

默认配置根：
  CODEX_HOME=process.env.CODEX_HOME || ~/.1code/codex

MCP 复用：
  复用 Codex CLI 在当前 CODEX_HOME + cwd 下解析出来的 MCP 配置
  不是复用 Claude MCP 配置
  默认也不是直接复用本机 ~/.codex

会话执行：
  resolveCodexAcpBinaryPath()
    -> @zed-industries/codex-acp-* / codex-acp
    -> createACPProvider({ session: { cwd, mcpServers } })
    -> streamText({ model: provider.languageModel(...), tools: provider.tools })

Skill：
  产品 Skill router 读写 ~/.claude/skills 与 .claude/skills
  Codex 会话没有 Skill 文件加载、settingSources、Skill tool 触发链路
```

关键判断：

```text
1Code 对 Codex MCP 的支持：
  bundled Codex CLI 解析 Codex MCP 配置
  + 1Code 转换为 ACP session mcpServers
  + codex-acp/provider.tools 暴露给模型

1Code 对 Codex Skill 的支持：
  当前不是运行时级别的 Codex Skill 支持
  只是产品通用 mention/UI 层能看到 Claude Skill
  Codex 后端没有把 Skill 文件内容或 Skill tool 注入会话
```

## 2. 在 OneCode 中安装 Codex Skill 或 MCP 时，实际写到哪里

### 2.1 OneCode 没有独立的 Codex Skill 安装闭环

OneCode 当前的 Skill 管理入口写入的是 Claude Skill 路径：`~/.claude/skills` 或项目 `.claude/skills`。这部分代码证据在上文 1.7 已列出：`src/main/lib/trpc/routers/skills.ts:115`、`src/main/lib/trpc/routers/skills.ts:119`、`src/main/lib/trpc/routers/skills.ts:213`、`src/main/lib/trpc/routers/skills.ts:215`。

因此，在 OneCode 里“安装 Skill”并不会安装到 Codex 的 `CODEX_HOME`，也不会形成 Codex runtime 的 Skill tool 加载链路。Codex 会话侧只收到最终 prompt，并通过 `streamText({ tools: provider.tools })` 使用 ACP provider tools。

### 2.2 OneCode 安装 Codex MCP：本质是调用 bundled Codex CLI 写入当前 `CODEX_HOME`

如果 MCP 面板选择 provider 为 Codex，前端强制 scope 为 global：

代码位置：`src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx:295`

```tsx
const [scope, setScope] = useState<"global" | "project">("global")
const effectiveScope = provider === "codex" ? "global" : scope
```

新增 Codex MCP 时调用的是 `trpc.codex.addMcpServer`，并且传入 `scope: "global"`：

代码位置：`src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx:306`

```tsx
if (provider === "codex") {
  await addCodexServerMutation.mutateAsync({
    name: name.trim(),
    transport: type,
    command: type === "stdio" ? command.trim() : undefined,
    args: type === "stdio" ? parsedArgs : undefined,
    url: type === "http" ? url.trim() : undefined,
    scope: "global",
  })
}
```

Codex 后端也明确拒绝 project scope：

代码位置：`src/main/lib/trpc/routers/codex.ts:1471`

```ts
if (input.scope !== "global") {
  throw new Error("Codex MCP currently supports global scope only.")
}
```

对于 HTTP MCP，后端组装 `codex mcp add <name> --url <url>`：

代码位置：`src/main/lib/trpc/routers/codex.ts:1476`

```ts
const args = ["mcp", "add", input.name.trim()]
if (input.transport === "http") {
  const url = input.url?.trim()
  if (!url) {
    throw new Error("URL is required for HTTP servers.")
  }
  args.push("--url", url)
}
```

对于 stdio MCP，后端组装 `codex mcp add <name> -- <command> ...args`：

代码位置：`src/main/lib/trpc/routers/codex.ts:1483`

```ts
} else {
  const command = input.command?.trim()
  if (!command) {
    throw new Error("Command is required for stdio servers.")
  }

  args.push("--", command, ...(input.args || []))
}
```

然后执行 bundled Codex CLI：

代码位置：`src/main/lib/trpc/routers/codex.ts:1492`

```ts
await runCodexCliChecked(args)
clearCodexMcpCache()
```

`runCodexCliChecked()` 会调用 `runCodexCli()`，而 `runCodexCli()` 使用的是 `resolveBundledCodexCliPath()` 和 `buildBaseCodexEnv()`：

代码位置：`src/main/lib/trpc/routers/codex.ts:391`

```ts
const codexCliPath = resolveBundledCodexCliPath()
```

代码位置：`src/main/lib/trpc/routers/codex.ts:395`

```ts
const child = spawn(codexCliPath, args, {
  stdio: ["ignore", "pipe", "pipe"],
  cwd: cwd && cwd.length > 0 ? cwd : undefined,
  env: buildBaseCodexEnv(),
  windowsHide: true,
})
```

而 `buildBaseCodexEnv()` 默认设置：

代码位置：`src/main/lib/trpc/routers/codex.ts:141`

```ts
const DEFAULT_CODEX_HOME = join(homedir(), ".1code", "codex")
```

代码位置：`src/main/lib/trpc/routers/codex.ts:286`

```ts
env.CODEX_HOME = ensureCodexHome(env.CODEX_HOME?.trim() || DEFAULT_CODEX_HOME)
```

删除 Codex MCP 也是调用 Codex CLI：

代码位置：`src/main/lib/trpc/routers/codex.ts:1509`

```ts
await runCodexCliChecked(["mcp", "remove", input.name.trim()])
clearCodexMcpCache()
```

MCP OAuth 登录/登出也调用 Codex CLI：

代码位置：`src/main/lib/trpc/routers/codex.ts:1524`

```ts
await runCodexCliChecked(["mcp", "login", input.serverName.trim()], {
  cwd: projectPath && projectPath.length > 0 ? projectPath : undefined,
})
```

代码位置：`src/main/lib/trpc/routers/codex.ts:1547`

```ts
await runCodexCliChecked(["mcp", "logout", input.serverName.trim()], {
  cwd: projectPath && projectPath.length > 0 ? projectPath : undefined,
})
```

完整安装闭环：

```text
OneCode Settings -> New MCP Server -> Provider: Codex
  -> UI 强制 scope=global
  -> 后端组装 codex mcp add ...
  -> runCodexCliChecked(args)
  -> bundled codex CLI
  -> env.CODEX_HOME = process.env.CODEX_HOME || ~/.1code/codex
  -> Codex CLI 把 MCP 写入当前 CODEX_HOME 对应的 Codex 配置
  -> OneCode 后续用 codex mcp list --json 读取同一套配置
  -> 转成 ACP provider session mcpServers
```

所以，OneCode 安装 Codex MCP 和本机 Codex CLI 的关系取决于 `CODEX_HOME`：

- 默认情况：OneCode 使用 `~/.1code/codex`，不直接写本机默认 `~/.codex`，因此与用户在终端直接运行的默认 Codex CLI 配置隔离。
- 如果启动 OneCode 的环境显式设置了 `CODEX_HOME`：OneCode 会沿用该 `CODEX_HOME`，这时它会和同一个 `CODEX_HOME` 下的本机 Codex CLI 共享 MCP 配置。

这和 Claude MCP 不同：Claude MCP 是 OneCode 直接写 `~/.claude.json`，天然和本机 Claude Code 的 user/project MCP 配置复用；Codex MCP 是 OneCode 调用 Codex CLI 写入当前 `CODEX_HOME`，默认是 OneCode 自己的 `~/.1code/codex`。

### 2.3 Codex 安装关系总表

| 在 OneCode 中安装 | 实际写入/执行位置 | 和本机配置的关系 | 运行时是否使用 |
| --- | --- | --- | --- |
| Skill | 当前写入 Claude Skill 路径 `~/.claude/skills` 或 `.claude/skills` | 与本机 Claude Code Skill 共用；不是 Codex Skill 配置 | Codex 不按 Skill 机制使用 |
| Codex MCP | bundled `codex mcp add ...` 写入当前 `CODEX_HOME` | 默认 `~/.1code/codex`，不等于本机默认 `~/.codex`；显式同一 `CODEX_HOME` 时才共用 | Codex ACP 会话使用 |

## 3. 总结：1Code 对 Codex Skill/MCP 的支持边界

### MCP

```text
构建/运行：
  bundled Codex CLI
  + npm package 内的 codex-acp binary

默认配置根：
  CODEX_HOME=process.env.CODEX_HOME || ~/.1code/codex

配置读取：
  1Code 不直接解析 ~/.codex/config.toml
  也不读取 Claude MCP 配置
  而是调用 bundled codex mcp list --json

安装方式：
  OneCode 调用 bundled codex mcp add/remove/login/logout
  Codex CLI 写入当前 CODEX_HOME 对应的配置

复用方式：
  复用 Codex CLI 对当前 CODEX_HOME + cwd 的 MCP 配置解析结果
  再转换成 ACP provider session mcpServers

使用方式：
  createACPProvider({ session: { cwd, mcpServers } })
  -> streamText({ tools: provider.tools })
```

### Skill

```text
产品 UI：
  Skill router 和 mention UI 可以读取 ~/.claude/skills 与项目 .claude/skills

运行时：
  Codex chat transport 只发送 prompt/cwd/projectPath/model/session/auth/images
  Codex router 只把 prompt 作为 messages 传给 streamText
  没有 settingSources
  没有 Skill 文件加载
  没有 Skill tool 触发链路

结论：
  当前不能认为 Codex 运行时复用了 Claude Skill
  也不能认为它直接复用了本机 ~/.codex/skills
```

### 关键判断

1Code 对 Codex 的真实形态是：

```text
1Code 自带 Codex CLI binary
  + codex-acp binary 执行 ACP 会话
  + 默认 CODEX_HOME=~/.1code/codex
  + 通过 codex mcp list --json 复用 Codex CLI 的 MCP 解析结果
  + 将 MCP 转成 ACP session mcpServers
  + 没有 Claude 式 Skill runtime 支持
```

因此：

- binary 层面：Codex CLI 由 `bun run codex:download` 下载并打包；聊天会话由 `codex-acp` 运行。
- MCP 层面：复用 Codex CLI 在当前 `CODEX_HOME` 和 `cwd` 下解析出的 MCP 配置；默认不是直接读取本机 `~/.codex`。
- Skill 层面：产品 UI 能读写 Claude Skill 路径，但 Codex 会话没有加载 Skill 文件或触发 Skill tool 的闭环。
