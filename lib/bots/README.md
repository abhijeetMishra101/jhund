# lib/bots

This directory contains the core bot runtime: message routing, Claude orchestration, tool definitions, and the auto-approve safety gate.

---

## Files

### `index.ts` — Bot runtime & message orchestration

The main entry point. Three exported functions:

| Function | What it does |
|---|---|
| `getBotForChannel(channelId)` | Returns the `bot_role` assigned to a channel via `channels.bot_role_id`. Fallback for legacy single-bot channels. |
| `resolveBotForMessage(channelId, messageContent?)` | Multi-bot routing. Checks `channel_members` first; if the message starts with `@Name` it routes to that named bot, otherwise it routes to the primary bot (`is_primary = true`). Falls back to `getBotForChannel` if no `channel_members` rows exist. |
| `respondToMessage(channelId, workspaceId, parentMessageId?, messageContent?)` | Full response pipeline — resolves the bot, builds message history, calls Claude, runs a read loop for file/directory tools, then handles any action tool and persists the reply. |

**Read loop** (`MAX_READ_ITERATIONS = 5`): After each Claude response, if the content contains `read_github_file` or `list_directory` tool calls, all of them are resolved in parallel and fed back as `tool_result` blocks. This repeats until Claude calls a different tool or returns text.

**System prompt**: Always derived from `getRoleSystemPrompt(role_key, workspaceName)` at request time — never from the stale `system_prompt` column in the DB. This means prompt improvements roll out on deploy without migrations.

**Model**: `claude-sonnet-4-6`, `max_tokens: 4096`.

---

### `auto-approve.ts` — Confidence-gated auto-approve

Exports one function:

```ts
isAutoApprovable(actions: GithubActionInput[]): boolean
```

Server-side allowlist that is the **authoritative** check — Claude's `confidence: "auto"` field is advisory only. All four rules must pass:

| Rule | Constraint |
|---|---|
| 1 | Every action must be `commit_file` — no PRs, issues, or comments |
| 2 | At most **3** actions in the batch |
| 3 | Every `file_path` must match a safe-path pattern: `docs/`, `__tests__/`, `*.test.ts`, `*.test.js`, `*.spec.ts`, `*.spec.js`, `*.md` |
| 4 | Every `branch` must start with `bot/` |

If any rule fails, the action falls back to normal founder-approval regardless of what Claude declared.

---

### `context.ts` — Message history builder

Exports:

```ts
buildMessageHistory(channelId, limit?, workspaceId?): Promise<MessageParam[]>
```

Fetches the last `limit` (default 20) messages from a channel and maps them to Anthropic `MessageParam` format (oldest → newest, as required by Claude).

**Role mapping:**
- `author_type = 'user'` → `role: 'user'`
- `author_type = 'bot'` → `role: 'assistant'`
- `author_type = 'system'` → included **only** if `author_id` matches `workspaceId` (GitHub events, workflow-chain transitions) or the null UUID `00000000-0000-0000-0000-000000000000` (feature-stage handoffs). Confirmation chips and error messages are excluded.

**Guardrails:**
- Consecutive same-role turns are merged to satisfy Anthropic's alternating-role requirement.
- Leading `assistant` turns are dropped (Claude requires conversations to start with `user`).

---

### `tools.ts` — Claude tool definitions

Exports typed `Anthropic.Tool` constants used in the Claude API call inside `index.ts`:

| Export | Tool name | Purpose |
|---|---|---|
| `READ_GITHUB_FILE_TOOL` | `read_github_file` | Read a file from the connected repo |
| `LIST_DIRECTORY_TOOL` | `list_directory` | List files/folders in a repo directory |
| `PROPOSE_GITHUB_ACTION_TOOL` | `propose_github_action` | Propose GitHub actions for founder approval |
| `CREATE_FEATURE_TOOL` | `create_feature` | Create a feature in the Pipeline |
| `ADVANCE_FEATURE_STAGE_TOOL` | `advance_feature_stage` | Advance a feature to the next pipeline stage |
| `RECORD_DECISION_TOOL` | `record_decision` | Record a decision with optional auto-dispatch |
| `DOCUMENT_DISCUSSION_TOOL` | `document_discussion` | Save a Markdown discussion summary to the repo |
| `UNDO_DECISION_TOOL` | `undo_decision` | Retract the most recent decision in a channel |

All tool definitions include full `input_schema` shapes and description strings that are passed verbatim to Claude.

---

## Data flow

```
Incoming message
       │
       ▼
resolveBotForMessage()     ← @mention or primary bot
       │
       ▼
buildMessageHistory()      ← last 20 turns, filtered
       │
       ▼
anthropic.messages.create() ← claude-sonnet-4-6, 4096 tokens
       │
       ├─ read_github_file / list_directory calls?
       │         └─ resolve in parallel → tool_results → loop (max 5×)
       │
       ├─ propose_github_action?
       │         ├─ isAutoApprovable() → true  → execute immediately
       │         └─ isAutoApprovable() → false → create pending plan, await founder approval
       │
       └─ text reply → persist message row
```
