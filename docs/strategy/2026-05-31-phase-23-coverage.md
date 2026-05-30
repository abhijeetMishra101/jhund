# Phase 23 — Workspace Context: PO Coverage Audit

**Date:** 2026-05-31
**Phase:** 23 — Workspace Context
**Status:** Phase 23a shipped (✅). Phase 23b (auto-derive) pending.

---

## PO Retrospective Note

Phase 23a shipped the infrastructure (column, injection, Settings textarea) but missed the correct user outcome. The original use cases were framed around the mechanism ("founder sets text") rather than the outcome ("bots know the project without founder effort"). For a product targeting non-technical founders, asking them to write a technical description is friction that contradicts the zero-config promise.

**Correct outcome statement:**
> Bots know the project context **without the founder having to explain it**.

This surfaces the right answer immediately: auto-derive context from the connected GitHub repo (README + package.json), which the founder has already linked. The Settings textarea becomes an override, not the primary path.

Phase 23b captures this fix.

---

## Goal

Bots have project-specific knowledge from day one — zero extra effort from the founder. On GitHub connect, context is derived automatically. The founder can refine it in Settings but should never be required to.

---

## Use Cases

### Phase 23a — Infrastructure (✅ Shipped in PR #98)

| ID | Priority | Description | Status |
|----|----------|-------------|--------|
| UC-23-01 | P0 | `bot_context` column exists and is injected into every bot's system prompt | ✅ Done |
| UC-23-02 | P0 | Description is prepended to every bot's system prompt on every Claude call | ✅ Done |
| UC-23-03 | P0 | Bot responses reference project-specific details without founder having to repeat them | ✅ Smoke-tested |
| UC-23-05 | P1 | Description is preserved across save — re-opening Settings shows the saved value | ✅ Done |
| UC-23-06 | P1 | Character limit enforced in the UI (no silent truncation) | ✅ Done |
| UC-23-07 | P2 | Description can be cleared (saved as empty string → no injection) | ✅ Done |

### Phase 23b — Auto-Derive (❌ Gap — not yet built)

| ID | Priority | Description |
|----|----------|-------------|
| UC-23b-01 | P0 | On GitHub repo connect, `bot_context` is automatically populated by reading `README.md` + `package.json` from the repo — founder does nothing |
| UC-23b-02 | P0 | Auto-derived context is accurate — includes project name, purpose, and tech stack as stated in the README |
| UC-23b-03 | P1 | Founder can override or augment the auto-derived context in Settings |
| UC-23b-04 | P1 | If README is missing or unreadable, Ops bot prompts founder in #ops with a pre-filled template to complete |
| UC-23b-05 | P2 | Context is refreshed when the connected repo changes (e.g. README updated) |

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

## Phase 23b — Infrastructure Dependencies

| Gate | Description | Verified By |
|------|-------------|-------------|
| No new DB columns | `bot_context` already exists from 23a | N/A |
| GitHub read access | `readGithubFile` tool already exists (Phase 20) | Code review |

## Phase 23b — Test Coverage Plan

| Use Case | Test Type | File |
|----------|-----------|------|
| UC-23b-01 | Unit: GitHub connect callback triggers context derivation | `__tests__/api/github/callback.test.ts` |
| UC-23b-02 | Unit: README + package.json parsed correctly into context string | `__tests__/lib/workspace/derive-context.test.ts` |
| UC-23b-03 | Covered by existing 23a textarea tests | existing |
| UC-23b-04 | Unit: missing README → Ops bot message inserted | `__tests__/lib/workspace/derive-context.test.ts` |

---

## Out of Scope

- Per-channel context overrides (Phase 24+)
- Context versioning or history
- UC-23b-05 (auto-refresh on README change) — Phase 27+

---

## Sign-off Criteria

### Phase 23a ✅
- [x] DB migration run on production
- [x] All P0 unit tests green in CI
- [x] Smoke test UC-23-03 passes manually (Sam answered "Next.js 14, Supabase, Anthropic Claude" from context)

### Phase 23b ❌ (pending)
- [ ] GitHub connect callback triggers `deriveWorkspaceContext()`
- [ ] `bot_context` is populated automatically after repo connect — founder never touches Settings
- [ ] Manual test: connect a repo, ask any bot "what stack are we using?" — answers correctly with no prior Setup
