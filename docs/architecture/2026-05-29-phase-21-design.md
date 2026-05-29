# Phase 21 Design — Codebase Navigation + Confidence-Gated Auto-Approve

**Date**: 2026-05-29  
**Status**: Approved for implementation  
**Branch**: `feat/phase-21-autonomy`

---

## Context

Phase 20 gave bots the ability to read specific files before proposing changes (`read_github_file`). That reduced hallucinated diffs but still required the founder to tell the bot *which* file to read. Two friction points remain:

1. **Navigation gap** — bots can't explore the codebase structure. They must be told exact file paths, or they guess and get 404s.
2. **Approval fatigue** — every single change, even a one-line doc fix or a new test, requires the founder to click Approve. At 10+ proposals/day this becomes a bottleneck.

Phase 21 removes both blockers.

---

## Goals

| # | Goal | Metric |
|---|------|--------|
| G1 | Bots can discover file paths without the founder's help | Bot self-resolves path in ≥ 80% of multi-file tasks without founder input |
| G2 | Low-risk writes execute automatically | Founder approves 0 doc/test changes manually |
| G3 | Founder retains full override control | Auto-executions visible in channel; founder can see what ran |
| G4 | No regression on action budget | Auto-executed actions still count against cap |

---

## Feature 1 — `list_directory` Tool

### What it does

The bot calls `list_directory` with a directory path (e.g. `"lib/bots"`). The response is a flat list of file and sub-directory names at that level — enough to know what exists and decide which files to `read_github_file` next.

### Implementation

**New file: `lib/github/read.ts`** (extends existing `readGithubFile`)

```typescript
export async function listDirectory(
  workspaceId: string,
  dirPath: string,
  branch?: string
): Promise<{ name: string; path: string; type: 'file' | 'dir' }[]>
```

Uses `octokit.rest.repos.getContent({ owner, repo, path: dirPath, ref: branch })`.  
When the path is a directory, GitHub returns an array. When it's a file, it returns an object — guard against this.

**New tool definition in `lib/bots/tools.ts`**

```typescript
export const LIST_DIRECTORY_TOOL: Anthropic.Tool = {
  name: 'list_directory',
  description:
    'List the files and sub-folders in a directory of the connected GitHub repository. ' +
    'Use this to explore the codebase structure before deciding which files to read. ' +
    'Returns names, paths, and types (file or directory). ' +
    'Start at the repo root ("") if you are not sure where files live.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to repo root. Use "" for the root. Examples: "lib/bots", "src/components"',
      },
      branch: {
        type: 'string',
        description: 'Branch to read from. Omit to use the repo default branch.',
      },
    },
    required: ['path'],
  },
}
```

**`lib/bots/index.ts` — extend the read loop**

The existing `read_github_file` read-loop (max 5 iterations) handles `list_directory` in the same pass:

```
iteration N:
  scan response.content for blocks where name === 'read_github_file' OR name === 'list_directory'
  if none → break
  resolve ALL matching blocks via Promise.all (mix of reads + listings is fine)
  push assistant + tool_results turn
  call Claude again
```

No new loop — just add `list_directory` to the filter predicate.

**`list_directory` does NOT increment the action counter** — it's a read, same as `read_github_file`.

### Response format to Claude

```json
[
  { "name": "index.ts",   "path": "lib/bots/index.ts",   "type": "file" },
  { "name": "tools.ts",   "path": "lib/bots/tools.ts",   "type": "file" },
  { "name": "context.ts", "path": "lib/bots/context.ts", "type": "file" }
]
```

If the path doesn't exist or is empty: `"Directory not found: lib/nonexistent"` (plain string, same error convention as `read_github_file`).

---

## Feature 2 — Confidence-Gated Auto-Approve

### Design principles

1. **Bot declares confidence; server decides** — Claude marks an action `"auto"` only if it meets its own criteria. The server independently verifies the action against a whitelist. If the server check fails, the action falls back to normal plan approval. Never trust the bot alone.

2. **Audit trail always** — every auto-executed action writes a `plans` row with `status: 'auto_executed'`. The founder can always see what ran.

3. **Visible in channel** — auto-execution posts a system message: `"⚡ Auto-executing: {plain_english_description}"` so the founder isn't surprised.

4. **Budget still applies** — auto-executions increment the action counter. Auto ≠ free.

### Tool change — add `confidence` to `propose_github_action`

New optional field in `PROPOSE_GITHUB_ACTION_TOOL`:

```typescript
confidence: {
  type: 'string',
  enum: ['auto', 'review'],
  description:
    '"auto" — this change is low-risk and can execute without founder approval. ' +
    'Only use "auto" when ALL of the following are true: ' +
    '(1) every action is a commit_file (no PR creation, no issue creation), ' +
    '(2) every file path matches docs/, __tests__/, or ends in .test.ts/.test.js/.spec.ts/.md, ' +
    '(3) the branch name starts with "bot/". ' +
    '"review" — default. Requires founder approval before executing.',
  default: 'review',
}
```

### Server-side auto-approve allowlist

Defined in `lib/bots/auto-approve.ts`:

```typescript
export function isAutoApprovable(actions: GithubAction[]): boolean {
  // Rule 1: only commit_file actions (no create_pr, create_issue, comment_*)
  if (actions.some(a => a.action_type !== 'commit_file')) return false

  // Rule 2: max 3 files per auto-batch (prevent bulk auto-rewrites)
  if (actions.length > 3) return false

  // Rule 3: all file paths must be in the safe-path whitelist
  const safePaths = [/^docs\//, /^__tests__\//, /\.(test|spec)\.(ts|js|tsx|jsx)$/]
  if (!actions.every(a => safePaths.some(re => re.test(String(a.payload.file_path ?? ''))))) return false

  // Rule 4: branch must start with 'bot/'
  if (!actions.every(a => String(a.payload.branch ?? '').startsWith('bot/'))) return false

  return true
}
```

### Execution flow

**`lib/bots/index.ts` — `propose_github_action` handler**

```
proposed = parse propose_github_action tool_use input

if proposed.confidence === 'auto' AND isAutoApprovable(proposed.actions):
  // Fast path — no plan chip shown to founder
  planId = insert plans row { status: 'auto_executing', auto_approved: true }
  post system message: "⚡ Auto-executing: {plain_english_description}"
  await executePlanActions(planId, workspaceId)    ← reuse existing executor
  update plans row { status: 'auto_executed' }
  post bot reply: "{Claude's text response}"
  return

else:
  // Normal path — plan chip shown to founder
  planId = insert plans row { status: 'pending' }
  post plan chip message (existing behaviour)
  return
```

### DB — `plans` table changes

New columns needed:

| Column | Type | Notes |
|--------|------|-------|
| `auto_approved` | `boolean` | `true` when no founder click was needed |
| `auto_approved_at` | `timestamptz` | Set at execution time |

Migration: `ALTER TABLE plans ADD COLUMN auto_approved boolean NOT NULL DEFAULT false;`  
And: `ALTER TABLE plans ADD COLUMN auto_approved_at timestamptz;`

The `status` enum gains `'auto_executing'` and `'auto_executed'` values.

---

## Data Flow Diagrams

### Feature 1 — List + Read exploration loop

```
Founder: "Update the README in lib/bots"
    │
    ▼
[Claude turn 1]
  calls: list_directory("lib/bots")
    │
    ▼
[Server resolves]
  → [index.ts, tools.ts, context.ts, ...]
  pushes tool_result to messages
    │
    ▼
[Claude turn 2]
  calls: read_github_file("lib/bots/index.ts") + read_github_file("lib/bots/tools.ts")
    │
    ▼
[Server resolves both (parallel)]
  pushes two tool_results in one user turn
    │
    ▼
[Claude turn 3]  ← stop_reason: end_turn
  calls: propose_github_action(...)
    │
    ▼
[Normal approve flow or auto-approve]
```

### Feature 2 — Confidence-gated auto-approve

```
Claude: propose_github_action({
  confidence: 'auto',
  actions: [{ action_type: 'commit_file', payload: { file_path: 'docs/api.md', branch: 'bot/update-docs' } }]
})
    │
    ├─ isAutoApprovable? YES
    │       │
    │       ▼
    │  insert plan { status: 'auto_executing' }
    │  post: "⚡ Auto-executing: Update API docs"
    │  executePlanActions(planId, workspaceId)
    │  update plan { status: 'auto_executed' }
    │  post: "Done — changes are live on GitHub."
    │
    └─ isAutoApprovable? NO (e.g. creates a PR)
            │
            ▼
       Normal plan chip → founder clicks Approve
```

---

## Module Map

```
lib/
  github/
    read.ts          ← ADD: listDirectory() (alongside existing readGithubFile)
    executor.ts      ← unchanged
    auth.ts          ← unchanged
  bots/
    tools.ts         ← ADD: LIST_DIRECTORY_TOOL; UPDATE: PROPOSE_GITHUB_ACTION_TOOL (add confidence)
    index.ts         ← UPDATE: read loop handles list_directory; propose handler forks on confidence
    auto-approve.ts  ← NEW: isAutoApprovable() server-side whitelist
    context.ts       ← unchanged
```

---

## Implementation Tasks

### ML / Agent Engineer (`/role-ml-agent-engineer`)

1. Add `listDirectory()` to `lib/github/read.ts`
2. Add `LIST_DIRECTORY_TOOL` to `lib/bots/tools.ts`
3. Add `confidence` field to `PROPOSE_GITHUB_ACTION_TOOL`
4. Update `lib/bots/index.ts` read loop to handle `list_directory` blocks
5. Add `lib/bots/auto-approve.ts` with `isAutoApprovable()` + `AutoApproveResult` type
6. Update `propose_github_action` handler in `lib/bots/index.ts` to fork on confidence + server check
7. Tests: `__tests__/lib/bots/auto-approve.test.ts` (pure unit tests, no mocks needed)
8. Tests: update `__tests__/lib/bots/index.test.ts` — list_directory in read loop, auto-approve fork

### Backend Developer (`/role-backend-developer`)

1. DB migration: add `auto_approved` + `auto_approved_at` columns to `plans` table
2. DB migration: extend `status` enum with `'auto_executing'` and `'auto_executed'`
3. Update `executePlanActions()` to accept a pre-created plan row (avoids double-insert)  
   — OR — keep existing signature; `index.ts` calls `update { status: 'approved' }` before calling executor  
   ← **Preferred**: add `executeActionsDirectly(actions, workspaceId, channelId)` helper that handles the insert+execute+update internally, no UI approval step.

---

## Out of Scope for Phase 21

- Auto-approve for `create_pr` or `create_issue` — always requires founder click  
- Confidence score displayed to founder in the plan chip (future phase)  
- `search_codebase` (grep/regex) — deferred; `list_directory` + `read_github_file` covers 80% of cases  
- Auto-approve for changes to `lib/`, `app/`, `src/` code files — too risky for Phase 21

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Bot marks code files as `'auto'` | Server `isAutoApprovable()` checks file path against whitelist — `confidence` claim is advisory only |
| Auto-approve drains action budget silently | Budget counter incremented; 80% warning posts to channel; no change to cap enforcement |
| Parallel list + read in same Claude turn | Same `Promise.all` pattern as Phase 20 parallel reads — both tool types handled in one loop pass |
| `list_directory` on a huge root dir | Response is capped at 100 entries (Octokit default); Claude should navigate progressively |

---

## Phase Gate

**Before implementation starts (PO to define):**
- P0 use cases for `list_directory`
- P0 use cases for auto-approve
- Deployment gates: DB migration must run before code ships

**After implementation (PO to audit):**
- All P0 use cases covered by unit tests
- Manual smoke test: bot lists root dir → reads file → proposes doc change → auto-executes → PR visible on GitHub
