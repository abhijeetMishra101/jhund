# Phase 19 — Decisions + Discussions: Final Architecture Design

**Date**: 2026-05-26
**Author**: Architect
**Status**: Final — ready for implementation
**Branch**: feat/phase-19-decisions-discussions

---

## Overview

Phase 19 adds two bot tools that give bots the ability to persist institutional knowledge without requiring founder interaction:

1. **`record_decision`** — bot records a decision and optionally auto-dispatches an action to the owning bot for execution (no founder approval gate for the dispatch itself; bots still use `propose_github_action` / plan-gate for GitHub operations)
2. **`document_discussion`** — bot commits a structured Markdown summary of a discussion directly to the GitHub repo's `docs/discussions/` folder (bypassing the plan approval modal); falls back to a DB-only message if no GitHub installation is connected

A `#decisions` channel is auto-created in `seedWorkspace` for all templates so all decisions aggregate there.

---

## Database: `decision_events` Table

```sql
create table if not exists public.decision_events (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  channel_id          uuid not null references public.channels(id) on delete cascade,
  bot_role_id         uuid not null references public.bot_roles(id) on delete cascade,
  title               text not null,
  summary             text not null,
  action              text,                  -- optional: what to execute after recording
  action_dispatched_at timestamptz,          -- set when dispatch completes
  created_at          timestamptz not null default now()
);
```

**RLS**: service_role only — no user-facing RLS needed (API layer enforces workspace ownership via auth check).

**Index**: `(workspace_id, created_at DESC)` for the GET /api/decisions list query.

---

## Tool Definitions

### `record_decision`

```typescript
{
  name: 'record_decision',
  description: 'Record a decision you have made, with an optional action to execute',
  input_schema: {
    type: 'object',
    properties: {
      title:   { type: 'string', description: 'Short decision title (< 80 chars)' },
      summary: { type: 'string', description: 'Full decision rationale and context' },
      action:  { type: 'string', description: 'Optional: specific action to execute now' },
    },
    required: ['title', 'summary'],
  },
}
```

**Handler flow** (in `lib/bots/index.ts`):
1. Call `recordDecision({ workspaceId, channelId, botRoleId, title, summary, action? })`
2. If `action` present: call `dispatchDecisionAction(decisionId, workspaceId, action, botRoleId)` (fire-and-forget, same pattern as `advance_feature_stage` dispatch)
3. Post system confirmation message in current channel: `"✓ Decision recorded: {title}"` (+ `"Action dispatched to #decisions."` if applicable)

### `document_discussion`

```typescript
{
  name: 'document_discussion',
  description: 'Commit a structured Markdown summary of this discussion to the GitHub repo docs folder',
  input_schema: {
    type: 'object',
    properties: {
      title:   { type: 'string', description: 'Discussion title' },
      summary: { type: 'string', description: 'Full Markdown summary of the discussion' },
    },
    required: ['title', 'summary'],
  },
}
```

**Handler flow** (in `lib/bots/index.ts`):
1. Call `commitDiscussionDoc({ workspaceId, title, summary })`
2. If committed: post `"✓ Discussion documented at {path}"` in current channel
3. If not committed (no GitHub): post `"Discussion summary stored locally (no GitHub connected): {title}"` + content as message

---

## Module: `lib/decisions/`

### `lib/decisions/record.ts`

`recordDecision(params)` → inserts into `decision_events`, returns the row.

### `lib/decisions/dispatch.ts`

`dispatchDecisionAction(decisionId, workspaceId, action, decidingBotRoleId)`:
1. Finds the `#decisions` channel for the workspace (query `channels` where `name = 'decisions'` and `workspace_id = workspaceId`)
2. Posts a system message in `#decisions`: `"{BotDisplayName} decided: {action}"` (authored by the deciding bot's `bot_role_id`)
3. Calls `respondToMessage(decisionsChannelId, workspaceId)` so the channel's bot (ops) processes the action message
4. Updates `decision_events.action_dispatched_at = now()`

**Circular import note**: `dispatchDecisionAction` calls `respondToMessage` which lives in `lib/bots/index.ts`. The call is made by `lib/bots/index.ts` itself (same file, recursive call — same pattern already used for `advance_feature_stage` dispatch). `lib/decisions/dispatch.ts` does NOT import from `lib/bots/` — the caller passes `respondToMessage` via a function parameter OR the call is made inline in `lib/bots/index.ts` directly after `dispatchDecisionAction` returns the channel + message info.

**Resolution**: `lib/decisions/dispatch.ts` posts the message and returns `{ decisionsChannelId, messageId }`. The caller (`lib/bots/index.ts`) then calls `respondToMessage(decisionsChannelId, workspaceId)` directly — no circular import.

### `lib/decisions/github-commit.ts`

`commitDiscussionDoc({ workspaceId, title, summary })`:
1. Fetch `github_installations` for workspace
2. If none → return `{ committed: false }`
3. Use `getInstallationOctokit(installation_id)` to create `docs/discussions/YYYY-MM-DD-{slug}.md` on the default branch
4. Return `{ committed: true, path, url }`

**File naming**: `YYYY-MM-DD-{slugified-title}.md` where slug = lowercase, spaces→hyphens, non-alphanumeric stripped.

**Commit message**: `docs: add discussion summary — {title}`

---

## `#decisions` Channel

Added to **all three templates** (startup, enterprise, blank) in `TEMPLATE_CHANNELS`:

```typescript
{ name: 'decisions', display_name: '# decisions', role_key: 'ops' }
```

The ops bot owns `#decisions` — it's the natural aggregator (already owns standup + retrospective). All `record_decision` action dispatches post to this channel, giving the founder a single chronological feed.

---

## API Route: GET /api/decisions

- Auth check (Supabase client)
- Fetch `workspace_id` from `users` table
- Query `decision_events` for workspace ordered by `created_at DESC`, limit 50
- Return `{ decisions }`

No POST route — decisions are created exclusively via the bot tool (never directly by the founder).

---

## Module Boundaries

```
lib/decisions/
  record.ts           — recordDecision() → DB insert
  dispatch.ts         — postDecisionMessage() → posts to #decisions, returns { decisionsChannelId, messageId }
  github-commit.ts    — commitDiscussionDoc() → GitHub API commit

app/api/decisions/
  route.ts            — GET /api/decisions

lib/bots/
  tools.ts            — RECORD_DECISION_TOOL, DOCUMENT_DISCUSSION_TOOL
  index.ts            — tool_use handlers (calls lib/decisions/*, then respondToMessage)

lib/templates/
  seed.ts             — #decisions channel added to all templates

supabase/migrations/
  007_decision_events.sql
```

---

## Sequencing

1. DB migration (007)
2. TypeScript types update (`lib/supabase/types.ts`)
3. `lib/decisions/` module (record, dispatch, github-commit)
4. `lib/bots/tools.ts` — add two tools
5. `lib/bots/index.ts` — add two tool handlers
6. `lib/templates/seed.ts` — add #decisions channel
7. `app/api/decisions/route.ts`
8. Tests (record, dispatch, api)

---

## Definition of Done

- [ ] `decision_events` table created via migration 007
- [ ] `record_decision` tool available to all bots; inserts DB row + dispatches action if present
- [ ] `document_discussion` tool commits Markdown to GitHub (or stores locally if no installation)
- [ ] `#decisions` channel auto-created for all workspace templates
- [ ] GET /api/decisions returns decisions for authenticated user's workspace
- [ ] Tests: record (happy path + DB error), dispatch (with/without decisions channel), GET /api/decisions (401 + 200)
- [ ] TypeScript compiles cleanly (`tsc --noEmit`)
- [ ] CI green
