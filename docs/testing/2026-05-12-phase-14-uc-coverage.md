# Phase 14 UC Coverage — Threads, Multi-Bot Routing, Standup, Presence, DMs

**Date**: 2026-05-12
**Engineer**: Test Engineer
**Branch**: `feat/phase-14-tests`
**Test file**: `__tests__/phase14-uc-coverage.test.ts`
**Framework**: Vitest 4.1.5 + in-memory Supabase mocks

---

## Test Run Summary

```
Test Files  1 passed (1)
     Tests  24 passed (24)
  Duration  ~141ms
```

All 24 tests pass. Zero failures.

---

## UC Coverage

### UC-3-01 — Multi-bot channel routing

| # | Test Name | Status |
|---|-----------|--------|
| 1 | routes @Casey mention to Casey bot (not Sam) | PASS |
| 2 | routes to primary bot (Sam) when there is no @mention | PASS |
| 3 | channel_members query returns both bots for engineering channel | PASS |
| 4 | @mention to unknown name falls back to primary bot | PASS |

**Coverage**: Full. All routing paths covered — explicit @mention, no mention (primary fallback), unknown mention (primary fallback), and the DB query shape for `channel_members`.

---

### UC-3-02 — Thread replies

| # | Test Name | Status |
|---|-----------|--------|
| 5 | POST /api/messages with parent_id inserts message with correct parent_id | PASS |
| 6 | reply_count increments when a child message is inserted (trigger contract) | PASS |
| 7 | GET /api/channels/[id]/threads/[messageId] returns child messages ordered by created_at asc | PASS |
| 8 | messages with parent_id are stored with correct parent reference | PASS |

**Coverage**: Full for unit/integration contract. The `increment_reply_count` trigger is modelled as a behavioural contract (simulated in-memory) since Postgres triggers cannot be exercised without a live DB. The thread fetch ordering and parent reference are fully covered.

**Gap**: Realtime subscription (thread panel live updates) requires Playwright-level E2E testing — out of scope for unit tests.

---

### UC-3-05 — Bot presence

| # | Test Name | Status |
|---|-----------|--------|
| 9 | bot_roles.status is one of online \| busy \| offline | PASS |
| 10 | channels GET response includes status field for each member | PASS |
| 11 | bot_roles table returns status column from DB | PASS |
| 12 | online status set when bot responds (status field updatable) | PASS |
| 13 | DiceBear avatar URL is constructed with avatar_seed | PASS |

**Coverage**: Full. Validates the status enum constraint, status field presence in channel response, DB read/write of status, and avatar URL construction formula.

**Gap**: Auto-transition logic (green = responded in last 5 min, yellow = pending plan) is derived from timestamps and `plans.status` — covered conceptually by the enum test; a scheduled-check integration test would require a real clock or timer mocks.

---

### UC-10-01 — Standup thread consolidation

| # | Test Name | Status |
|---|-----------|--------|
| 14 | Riley's opening message is inserted first (no parent_id) | PASS |
| 15 | each bot's update has parent_id = riley_opening_message_id | PASS |
| 16 | Riley's consolidation summary has parent_id = riley_opening_message_id | PASS |
| 17 | standup thread: opening → bot replies → summary are all in same thread | PASS |
| 18 | standup messages form a complete thread chain (opening has no parent, replies do) | PASS |

**Coverage**: Full for the thread consolidation contract. Test 17 exercises the full `runStandup()` function with mocked DB chains, verifying `respondToMessage` is called and Claude summarises. Test 18 asserts the structural invariant of the resulting thread.

---

### UC-5-03 — DM channels

| # | Test Name | Status |
|---|-----------|--------|
| 19 | DM channel has name starting with "dm-" | PASS |
| 20 | DM channel can be created via DB insert | PASS |
| 21 | duplicate DM channel is not created if one already exists | PASS |
| 22 | messages can be posted to a DM channel | PASS |
| 23 | messages can be retrieved from a DM channel | PASS |
| 24 | DM channel_type is validated as "dm" (not "channel") | PASS |

**Coverage**: Full. Covers naming convention, creation, idempotency (find-or-create pattern), message post, message retrieval, and channel_type enum validation.

---

## Gaps and Partial Coverage

| Area | Gap | Recommendation |
|------|-----|----------------|
| Thread panel realtime | Live subscription to new thread replies | Add Playwright E2E in Phase 15 test suite |
| Presence auto-transition | Timer-based green→grey→yellow transitions | Add unit test with vi.useFakeTimers() when presence service is implemented |
| RLS policy enforcement | `channel_members` RLS requires live Supabase | Add Supabase local integration test (Phase 16) |
| `increment_reply_count` trigger | Postgres trigger needs live DB | Covered by behavioural contract; add supabase migration test |
| `respondToMessage` with parentMessageId | Phase 14 lib change not yet merged | Tests assert API and data-layer contracts; update when lib lands |

---

## Notes

- Tests are written as design-by-contract tests against the Phase 14 spec. The DB layer is fully mocked; no live Supabase connection is required.
- The `channel_type` enum (`channel | dm | standup | retrospective`) is tested as a pure TypeScript type assertion, mirroring the DB CHECK constraint from the migration.
- DiceBear avatar URL formula is tested explicitly since the seed values are fixed per role and must remain stable across workspaces.
