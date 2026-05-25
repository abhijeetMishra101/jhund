# Phase 17 — Smoke Test Outcomes & v1.1 Backlog

**Date**: 2026-05-26
**Status**: Phase 17 smoke test completed (production live)

---

## Smoke Test Results

### ✅ Confirmed Working
| Area | Result |
|------|--------|
| Auth page renders | ✅ |
| Feature pipeline Stage 1→7 end-to-end | ✅ |
| `create_feature` tool (Alex) | ✅ |
| Stage advance gate blocking (QA sign-off) | ✅ |
| Stage 2 dispatch → Jordan (design) + Drew (ml) in parallel | ✅ |
| Stage 6 dispatch → Casey (#qa) auto-responds | ✅ |
| Stage 7 dispatch → Riley (#standup) announces ship | ✅ |
| Plan approval cards (Approve / Reject) | ✅ |
| Action counter visible | ✅ |
| Thread replies loading in panel | ✅ (fixed PR #71) |
| Multi-bot @mention routing (#engineering: @Casey) | ✅ |
| Multi-bot channel header (Sam + Casey in #engineering) | ✅ (data fix required) |

### ⚠️ Issues Found and Fixed During Smoke Test
| PR | Bug | Fix |
|----|-----|-----|
| #69 | `actions` returned as object not array — crashed `respondToMessage` | Normalise with `Array.isArray` check |
| #70 | Empty `actions: []` threw instead of falling back to plain text | Fall back to plain text when actions empty |
| #71 | ThreadPanel fetching `/api/messages/.../threads/...` (wrong path) and reading `data.replies` (wrong key) | Corrected to `/api/channels/.../threads/...` and `data.messages` |
| #71 | Vitest picking up worktree test files causing false failures | Exclude `.claude/worktrees/**` in vitest config |

### 🔲 Manual Data Fixes Required (Not Code)
- **channel_members backfill**: Workspaces created after migration 004 don't get the seed — ran backfill SQL manually
- **Casey in #engineering**: `channel_members` only had Sam — inserted Casey manually via SQL
- **Use case verification**: `feature_use_cases.verified_at` had to be set manually — circular dependency in QA gate (see v1.1 backlog below)

### ⚠️ Items Not Yet Smoke Tested
| Item | Reason | Action |
|------|---------|--------|
| Standup cron | CRON_SECRET not readily available | Test separately |
| Login from scratch (magic link) | Supabase free plan email rate limit | Configure SMTP or wait |
| Action cap 80% warning | Not triggered during test | Manual test needed |

---

## v1.1 Backlog (Prioritised)

These were identified during Phase 17 and deferred from v1.0. Sequenced by founder impact.

### Phase 18-A — Channel Membership UI (P0 for v1.1)
**Problem**: "+ Add teammate" in channel header navigates to workspace Settings page. Founders expect channel-scoped action — UX Designer flagged as trust-erosion within first 10 minutes of use.

**Fix**:
- Replace `<Link href="/settings">` with inline dropdown picker
- Dropdown lists workspace bots not yet in this channel
- New endpoints: `POST /api/channels/[id]/members` and `DELETE /api/channels/[id]/members/[botRoleId]`
- No DB migration required (`channel_members` table exists)
- Estimated: 1 session

**Copy fix**: Change "+ Add teammate" → "+ Add" with dropdown header "Add to #[channel-name]"

**Architect note**: See Phase 18-A design doc when created.

---

### Phase 18-B — QA Gate: Use Case Verification (P0 for v1.1)
**Problem**: Casey (qa bot) cannot verify use cases — `advance_feature_stage` tool is blocked by gate requiring `verified_at` to be set, but there is no tool or API for Casey to set it. Circular dependency.

**Fix** (Option A — simplest): When `advance_feature_stage` is called by qa role with `gate_type: qa_sign_off`, auto-set `verified_at = NOW()` on all unverified use cases before gate check runs.

**Workaround for v1.0**: Manually set `verified_at` in Supabase SQL editor.

**Estimated**: 0.5 sessions. PR spawned as background task.

---

### Phase 18-C — SMTP Configuration (P1 for v1.1)
**Problem**: Supabase free plan has 2 emails/hour rate limit. Magic link login fails under any moderate usage.

**Fix**: Configure custom SMTP (Resend or SendGrid — both have free tiers).

**Estimated**: 0.5 sessions (config only, no code).

---

### Phase 18-D — channel_members Backfill Migration (P1 for v1.1)
**Problem**: Migration 004 seeds `channel_members` at migration time only. New workspaces created after that migration run don't get the seed. Dispatch finds no channels → bots don't receive stage handoffs.

**Fix**: Add a Supabase trigger or a migration that auto-seeds `channel_members` when a new workspace is created from a template.

**Estimated**: 1 session.

---

## Definition of Done for Phase 17

- [x] Migration 006 applied to production DB
- [x] All DB verification queries return rows
- [x] Vercel Production env vars confirmed
- [x] Feature pipeline Stage 1→7 end-to-end confirmed
- [x] Thread replies loading confirmed
- [x] Multi-bot routing (@mention) confirmed
- [x] Multi-bot channel header confirmed (after SQL fix)
- [ ] Standup cron confirmed (pending)
- [ ] Magic link login confirmed from scratch (pending SMTP)
- [ ] Action cap 80% warning confirmed (pending)

> **Founder gate**: Phase 17 is provisionally complete for the guinea pig test. The three pending items are P1 — they do not block the first real workspace onboarding but must be resolved before broader launch.
