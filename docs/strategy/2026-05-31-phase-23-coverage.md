# Phase 23 — Workspace Context: PO Coverage Audit

**Date:** 2026-05-31
**Phase:** 23 — Workspace Context
**Status:** Pre-implementation (use case definition)

---

## Goal

Give bots project-specific knowledge so they stop asking "what does this project do?" on every message. The founder sets a description once in Settings; every bot receives it in their system prompt automatically.

---

## Use Cases

| ID | Priority | Description |
|----|----------|-------------|
| UC-23-01 | P0 | Founder sets project description in workspace settings (free text, ≤ 800 tokens / ~3200 chars) |
| UC-23-02 | P0 | Description is prepended to every bot's system prompt on every Claude call |
| UC-23-03 | P0 | Bot responses reference project-specific details without founder having to repeat them |
| UC-23-04 | P0 | If no context is set, Ops bot prompts founder in #ops to fill it in |
| UC-23-05 | P1 | Description is preserved across save — re-opening Settings shows the saved value |
| UC-23-06 | P1 | Character limit enforced in the UI (no silent truncation) |
| UC-23-07 | P2 | Description can be cleared (saved as empty string → no injection) |

---

## Infrastructure Dependencies (Release Gates)

These will NOT fail CI but WILL fail the founder:

| Gate | Description | Verified By |
|------|-------------|-------------|
| DB-01 | `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS bot_context text;` run on production Supabase | Manual: check Supabase dashboard |
| DB-02 | `lib/supabase/types.ts` updated with `bot_context: string \| null` | TypeScript typecheck (CI) |
| ENV-01 | No new env vars required | N/A |

---

## Test Coverage Plan

| Use Case | Test Type | File |
|----------|-----------|------|
| UC-23-01 | Unit: PATCH /api/workspace/update accepts botContext | `__tests__/app/api/workspace/update.test.ts` |
| UC-23-02 | Unit: respondToMessage injects bot_context into system prompt | `__tests__/lib/bots/index.test.ts` |
| UC-23-03 | Manual smoke test | See Smoke Test below |
| UC-23-04 | Unit: respondToMessage skips injection when bot_context is null | `__tests__/lib/bots/index.test.ts` |
| UC-23-05 | Unit: PATCH returns saved bot_context in response | `__tests__/app/api/workspace/update.test.ts` |
| UC-23-06 | Unit: PATCH rejects bot_context > 3200 chars | `__tests__/app/api/workspace/update.test.ts` |
| UC-23-07 | Unit: empty string saves and results in no injection | `__tests__/lib/bots/index.test.ts` |

---

## Smoke Test: UC-23-03 (Manual)

**Goal:** Confirm a bot references the workspace context without being told.

1. Go to Settings → Workspace
2. Enter: `"This is Jhund — an AI-team workspace. The repo is abhijeetMishra101/jhund. The stack is Next.js 14, Supabase, and Anthropic Claude."`
3. Click Save changes
4. Open #product channel
5. Type: `"What stack are we using?"`
6. **Expected:** Sam answers "Next.js 14, Supabase, and Anthropic Claude" without reading any file

---

## Out of Scope for Phase 23

- Per-channel context overrides (Phase 24+)
- Ops bot nudge for missing context (UC-23-04) — deferred unless straightforward to add; bots still work without it
- Context versioning or history

---

## Sign-off Criteria

- [ ] DB migration run on production
- [ ] All P0 unit tests green in CI
- [ ] Smoke test UC-23-03 passes manually
- [ ] `lib/supabase/types.ts` includes `bot_context`
