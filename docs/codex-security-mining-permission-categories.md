# Codex 漏洞挖掘审批类型归纳

本文基于 1Code 本地多轮 Codex/GPT-5.5 漏洞挖掘会话整理，目的是说明当前会触发审批的操作类型，以及 PoC 阶段哪些操作可以默认通过。

## 背景

在漏洞挖掘场景中，Codex ACP 会对部分工具调用触发权限审批。当前 UI 在展示超长审批文本时容易被大段命令或 Markdown 内容撑满，且不易滚动，典型例子是把整份 `漏洞挖掘记录.md` 通过 `cat >> ... <<'EOF'` 写入时，审批卡片会显示完整写入内容。

PoC 阶段的产品取向是：研究员不盯实时过程，只在环境断开、失败、真实高危动作或需要人工审批时介入。因此低风险、非侵入式、记录类操作不应频繁打断用户。

## 已观察到的审批/工具操作类型

### 1. 写入漏洞挖掘记录/报告

典型形式：

```bash
cat > /path/to/漏洞挖掘记录.md <<'EOF'
...
EOF

cat >> /path/to/漏洞挖掘记录.md <<'EOF'
...
EOF
```

或 ACP 规范化后的 `tool-Edit`，目标文件为：

- `漏洞挖掘记录.md`
- `漏洞挖掘报告.md`

判断：

- 这是本产品要求的核心产物生成行为。
- 风险主要来自“写入范围是否限定在当前会话的记录/报告文件”。
- PoC 阶段建议默认通过，避免记录文件写入被频繁打断。

### 2. 读取本地上下文和记录文件

典型形式：

```bash
sed -n '1,220p' ~/.agents/skills/security-mining-record/SKILL.md
sed -n '1,220p' 漏洞挖掘记录.md
ls -la
```

判断：

- 主要用于读取 skill 规则、检查记录文件是否存在、读取当前记录内容。
- 对漏洞挖掘流程属于低风险辅助操作。
- PoC 阶段建议默认通过。

### 3. 低频公开 HTTP 请求

典型形式：

```bash
curl -I https://www.jianshu.com/
curl -D - -o /dev/null https://www.jianshu.com/robots.txt
curl -D - -o /dev/null https://www.jianshu.com/.well-known/security.txt
curl -D - -o /dev/null https://www.jianshu.com/security.txt
curl --compressed https://www.jianshu.com/contact
```

判断：

- 属于公开、低频、非交互式观察。
- 主要用于响应头、TLS、`robots.txt`、`security.txt`、公开联系信息等检查。
- PoC 阶段建议默认通过。

### 4. 本地过滤和解析公开响应

典型形式：

```bash
curl ... | sed -n '1,220p'
curl ... | grep -nE 'pattern'
curl ... | rg -n 'pattern'
```

判断：

- 本质是对公开响应做本地文本过滤。
- 不改变目标站点状态。
- PoC 阶段建议默认通过。

### 5. Web Search

典型形式：

- `Searching the Web`

判断：

- 用于查询公开信息。
- 不直接作用于目标站点。
- PoC 阶段建议默认通过。

### 6. 浏览器 / MCP 观察类操作

典型形式：

- `chrome-devtools-codex.new_page`
- `chrome-devtools-codex.evaluate_script`
- `chrome-devtools-codex.list_pages`

判断：

- 如果只打开页面、读取 DOM、查看响应信息，可视为低风险观察。
- 如果涉及登录、点击提交、表单交互、写入状态，则应升级为需要人工确认。

### 7. 调试/验证类命令

典型形式：

```bash
touch onecode-approval-test-*.txt
```

判断：

- 这是开发调试审批链路时出现的操作，不属于漏洞挖掘正常流程。
- 不应作为漏洞挖掘默认白名单依据。

## PoC 阶段建议

当前源码临时策略：Codex ACP 的所有权限审批默认通过，不再弹出用户审批 UI。

这样可以先验证漏洞挖掘主流程：

- Agent 能持续写入实时记录。
- Agent 能完成公开、低频、非侵入式观察。
- Agent 能在结束时产出 Markdown 报告。
- 用户不会被大段审批文本打断。

## 后续精细化审批建议

PoC 验证完成后，应从“全部默认通过”收敛为场景化策略。

可默认通过：

- 写入当前会话指定的 `漏洞挖掘记录.md` / `漏洞挖掘报告.md`。
- 读取当前工作区、skill 文件、记录/报告文件。
- 对目标域名做低频 `GET` / `HEAD` / `robots.txt` / `security.txt` / 响应头检查。
- 本地 `sed` / `grep` / `rg` 过滤公开响应。
- 公开 Web Search。

应保留人工审批：

- 登录、注册、提交表单、发评论、发消息等会改变状态的操作。
- `POST` / `PUT` / `PATCH` / `DELETE` 等非只读请求。
- 目录爆破、参数 fuzz、扫描器、`nmap`、`sqlmap`、Burp 批量扫描。
- SSH、靶机控制、设备控制、DNSLog、抓包代理接入。
- 写入任意脚本、执行未知脚本、删除/移动文件。
- 访问非目标域名或超出用户授权范围的资产。
