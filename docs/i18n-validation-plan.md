# i18n Validation Plan

## Scope

The i18n layer covers stable product UI in the active Settings experience:

- Settings sidebar labels.
- Preferences, Account, Appearance, Keyboard, Beta, Models, Projects, Skills, Custom Agents, MCP Servers, Plugins, and Debug pages.
- Visible labels, helper text, placeholders, empty states, form actions, dialogs, confirms, prompts, and Settings-triggered toasts.
- The document `lang` attribute.

The i18n layer deliberately does not translate:

- Agent responses, terminal output, logs, repository files, diffs, generated reports, or user-authored content.
- Model names, tool names, provider names, editor names, protocol names, platform names, and product names such as Claude Code, OpenAI Codex, VS Code, JetBrains, OAuth, HTTP, macOS, Linux, and Windows.
- Plugin metadata, skill/command markdown content, MCP tool descriptions, and provider error payloads.
- Unreferenced legacy Settings files that are not mounted by the current Settings router, such as `agents-worktrees-tab.tsx`.

## Manual Verification

1. Open Settings and switch Language to `简体中文`.
2. Visit every active Settings tab and confirm stable UI text is Chinese:
   Preferences, Account, Appearance, Keyboard, Beta, Models, Projects, Skills, Custom Agents, MCP Servers, Plugins, and Debug.
3. Open nested forms and dialogs where available:
   custom agent create/edit, skill/command create/delete, MCP add/edit/delete, project remove, model account rename/remove, and Debug confirms/toasts.
4. Confirm scoped exclusions remain unchanged:
   model labels, tool names, plugin descriptions, skill markdown, MCP tool descriptions, repository paths, and provider error messages.
5. Switch Language back to English and confirm the same Settings UI returns to English without restart.
6. Reload the app and confirm the selected language persists.
7. Inspect `document.documentElement.lang`:
   English sets `lang="en"` and Simplified Chinese sets `lang="zh-CN"`.

## Automated Verification

Run:

```bash
bun test src/renderer/lib/i18n/i18n.test.ts
git diff --check
bun run build
```

The i18n unit test verifies:

- All supported locales define the same translation keys.
- English and Simplified Chinese return different expected labels.
- Placeholder interpolation works.
- Missing keys remain visible instead of silently rendering blank text.

Also run a targeted scan:

```bash
rg -n '>[[:space:]]*[A-Z][^<{]*<' src/renderer/components/dialogs/settings-tabs src/renderer/features/settings
```

Review each hit and classify it as either an allowed proper noun/protocol/platform/model label, or a real UI string that must be moved into `messages.ts`.

## Expansion Rule

Add new strings to i18n when they are stable product UI or Settings workflow feedback. Do not add dynamic user content, generated agent output, provider payloads, repository content, terminal output, model names, or tool names to translation dictionaries.
