# Phase 23 — Workspace Context: Architecture Design

**Date:** 2026-05-31
**Status:** Approved for implementation

---

## Problem

Bots have no knowledge of the project they're working on. Every conversation starts cold — bots don't know the stack, the product vision, or the repo. Founders have to repeat themselves every session.

---

## Solution

A single free-text `bot_context` column on the `workspaces` table. On every Claude call, if `bot_context` is non-empty, it is prepended to the bot's system prompt as a "Project context" block.

The context is set once by the founder in Settings → Workspace.

---

## Data Layer

### Migration

```sql
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS bot_context text;
```

- Type: `text` (nullable)
- No default — null means "not set yet"
- No length enforcement at DB level; enforced at API layer (3200 chars ≈ 800 tokens)

### types.ts update

Add `bot_context: string | null` to `workspaces.Row`, `Insert`, and `Update`.

---

## API Layer

### PATCH /api/workspace/update

Extend existing endpoint. New optional field: `botContext: string`.

**Validation:**
- If present: strip whitespace from both ends
- If trimmed length > 3200: return 400 `{ error: "Project description must be under 3200 characters" }`
- Empty string is valid (clears context — null stored as null, empty string stored as empty string to signal intentional clear)

**Update shape:** `{ bot_context: trimmed }` added to the `updates` object when `botContext` is present in request body.

---

## Bot Layer

### lib/bots/index.ts — respondToMessage

Change:
```typescript
// Before
.select('name')

// After  
.select('name, bot_context')
```

System prompt assembly:
```typescript
const basePrompt = workspaceRow?.name
  ? getRoleSystemPrompt(botRole.role_key, workspaceRow.name)
  : botRole.system_prompt

const botContext = workspaceRow?.bot_context?.trim()
const systemPromptText = botContext
  ? `${basePrompt}\n\n## Project Context\n${botContext}`
  : basePrompt
```

The `Project Context` section is appended **after** the role instructions so role constraints always take precedence.

Cache behaviour: the system prompt block already has `cache_control: { type: 'ephemeral' }`. This is preserved — the cache is naturally busted when `bot_context` changes because the text changes.

---

## UI Layer

### WorkspaceSettings.tsx

Add a new `botContext` state variable and textarea below Working style.

**Label:** "Project description"
**Placeholder:** "Describe your project in plain English. Your team will reference this in every conversation."
**maxLength:** 3200
**Character counter:** shown below textarea, turns amber at 2800, red at 3200

The `handleSave` call already sends a PATCH — extend body to include `botContext` when present.
The `isDirty` check includes `botContext !== workspace.bot_context`.

### Initial value

The `workspace` prop (type `Workspace`) will carry `bot_context` once types.ts is updated. The settings page passes the full workspace object — no new fetches needed.

---

## Module Boundaries

```
[Settings UI]          [PATCH /api/workspace/update]      [workspaces table]
WorkspaceSettings  -->  validates + trims botContext    -->  bot_context column
                                                              ↓
[lib/bots/index.ts]    .select('name, bot_context')    <--  same row
      ↓
  system prompt = rolePrompt + "\n\n## Project Context\n" + bot_context
      ↓
  Claude API call
```

---

## What This Does NOT Change

- Per-role prompts in `lib/templates/roles.ts` — untouched
- Caching strategy — still single ephemeral block, cache busts naturally on context change
- Channel-level routing, multi-bot, or auto-approve logic — unaffected

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Founder writes a prompt injection attempt in bot_context | Low | Context is appended after role rules; roles are instructed to follow their constraints |
| Very long context bloating token cost | Low | 3200 char cap ≈ 800 tokens; system prompt cache absorbs the cost |
| DB migration not run before deploy | Medium | Listed as explicit release gate in coverage doc; check Supabase before merge |

---

## Implementation Order

1. `lib/supabase/types.ts` — add `bot_context` to Row/Insert/Update
2. `lib/bots/index.ts` — extend select + inject into system prompt
3. `app/api/workspace/update/route.ts` — accept + validate `botContext`
4. `app/w/[slug]/settings/components/WorkspaceSettings.tsx` — add textarea
5. Tests: unit for API + bots/index
6. Run DB migration on production
7. Smoke test
