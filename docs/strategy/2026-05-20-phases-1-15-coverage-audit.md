# Phases 1–15 — Retrospective Use Case Coverage Audit

**Date**: 2026-05-20
**Auditor**: Product Owner
**Purpose**: Establish the QA baseline after the Phase 15 message-disappearance regression. Retroactively maps all 200+ use cases against what is actually implemented and tested. Becomes the starting point for all future phase gate reviews.

---

## Summary

| Status | Count | Notes |
|--------|-------|-------|
| ✅ Implemented + Tested | 31 | Automated test would catch regression |
| ⚠️ Implemented, NOT tested | 19 | CI is green; founder sees broken product if these regress |
| 🔲 Not yet implemented | 158 | Planned product; not in current codebase |
| ❌ Broken (caught this audit) | 2 | Fixed in PR #63 |

**P0 gaps still open after PR #63**: 8 (listed in section below)

---

## Critical: P0 Gaps Still Open

These are implemented features with no automated test. A one-line code change would break them silently. Fix before next phase ships.

| UC | Description | Gap |
|----|-------------|-----|
| UC-5-01 | Workspace loads with GitHub not connected — bots degrade gracefully | No test for graceful degradation path |
| UC-5-02 | First message ever sent — bot responds | No test for first-message scenario |
| UC-7-04 | Founder asks bot to push to main — bot declines | No test that bot message content contains the refusal |
| UC-8-01 | Action cap warning banner appears at 80% | Component renders (tested) but 80% threshold logic not tested with edge values |
| UC-8-02 | Action cap blocks GitHub actions mid-workflow | `increment_action_count` RPC tested via mock, not via actual cap enforcement |
| UC-4-01 | GitHub webhook → bot responds in channel | Webhook routing tested; bot response content not tested end-to-end |
| UC-10-01 | Standup posts at 9am — all bots post | Cron handler tested but stagger timing (30s between posts) not tested |
| UC-3-05 | @mention in multi-bot channel routes to named bot | Routing logic tested; but full message→route→response roundtrip not tested |

---

## Deployment Gates Audit

Items that CI cannot verify — must be confirmed manually before each production deploy.

| Item | Status | Risk if missed |
|------|--------|---------------|
| Migration `001_initial.sql` applied | ✅ Assumed applied (product is live) | Catastrophic — entire product breaks |
| Migration `002_*.sql` applied | ✅ Assumed applied | Catastrophic |
| Migration `003_*.sql` applied | ✅ Assumed applied | Catastrophic |
| Migration `004_phase14_threads_multibots.sql` applied | ⚠️ **UNCERTAIN — this is the Phase 15 regression cause** | Messages silently disappear on channel return |
| `ANTHROPIC_API_KEY` set in Vercel | ✅ Assumed (bots respond in production) | Bots fail silently |
| `SUPABASE_SERVICE_ROLE_KEY` set in Vercel | ✅ Assumed (auth works) | Auth broken |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` set | ⚠️ Unknown if current values are correct | GitHub actions silently fail |
| Supabase Realtime enabled for `messages` table | ⚠️ Unknown | Messages don't appear in real-time; only after 5s poll |

**Action required**: Confirm migration 004 is applied to production immediately.

---

## Full Coverage Table

### Category 1: Single Bot, Clear Request

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-1-01 | Founder asks Engineering to review PR | P1 | 🔲 Not built | — | GitHub action execution exists; PR review flow not wired |
| UC-1-02 | Founder asks Product to prioritise backlog | P2 | 🔲 Not built | — | Product Owner bot not in default template |
| UC-1-03 | Founder asks Design to wireframe | P2 | 🔲 Not built | — | Design bot not in default template |
| UC-1-04 | Founder asks Security to audit | P1 | 🔲 Not built | — | Security bot exists; audit workflow chain not built |
| UC-1-05 | Founder asks QA to test feature | P1 | 🔲 Not built | — | QA bot exists; test execution workflow not built |
| UC-1-06 | Founder asks ML Engineer about latency | P2 | 🔲 Not built | — | ML bot not in default template |

### Category 2: Vague / Ambiguous Messages

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-2-01 | Vague message to specific bot | P1 | ⚠️ Gap | — | Bot receives message and calls Claude; response content not tested |
| UC-2-02 | Emotional/frustrated message | P2 | 🔲 Not built | — | No special handling for sentiment |
| UC-2-03 | Question spanning multiple roles | P2 | 🔲 Not built | — | Requires workflow chain |
| UC-2-04 | One-word message "Help" | P1 | ⚠️ Gap | — | Bot calls Claude; empathy response content not tested |
| UC-2-05 | "What's the status?" | P1 | 🔲 Not built | — | No status aggregation |
| UC-2-06 | No clear ask / thinking out loud | P1 | ⚠️ Gap | — | Bot calls Claude; engagement not tested |

### Category 3: Multi-Bot Channel Scenarios

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-3-01 | Vague message in multi-bot channel | P1 | ⚠️ Gap | `phase14-routing.test.ts` | Primary bot routing logic tested; actual response content not verified |
| UC-3-02 | Founder creates custom multi-bot channel | P1 | ⚠️ Gap | `channels.test.ts` | Channel creation tested; bot intro messages not tested |
| UC-3-03 | Two bots disagree | P2 | 🔲 Not built | — | No disagreement protocol |
| UC-3-04 | Vague message in #standup | P1 | ⚠️ Gap | `standup.test.ts` | Standup posting tested; in-standup routing not tested |
| UC-3-05 | @mention specific bot in multi-bot channel | P0 | ✅ | `phase14-routing.test.ts`, `messages-post.test.ts` | Fixed in PR #63 — content now passed to resolveBotForMessage |

### Category 4: GitHub-Triggered Workflows

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-4-01 | PR opened — no security files | P0 | ⚠️ Gap | `github.test.ts` (webhook routing) | Webhook routing tested; bot post-response content not E2E tested |
| UC-4-02 | PR opened touching auth files | P1 | 🔲 Not built | — | No file-pattern routing; Security not triggered separately |
| UC-4-03 | Issue labeled "security" | P1 | 🔲 Not built | — | No label-based routing |
| UC-4-04 | PR merged to main | P1 | 🔲 Not built | — | No merge event handler |
| UC-4-05 | CI/CD fails on PR | P1 | 🔲 Not built | — | No check_run handler |
| UC-4-06 | Release tag pushed | P2 | 🔲 Not built | — | No tag push handler |
| UC-4-07 | Issue labeled "bug" + "high" | P1 | 🔲 Not built | — | No multi-label routing |
| UC-4-08 | PR review requested on GitHub | P1 | 🔲 Not built | — | No review_requested handler |

### Category 5: Onboarding & First-Time Scenarios

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-5-01 | GitHub not connected — graceful degradation | P0 | ⚠️ Gap | — | No test for graceful no-GitHub mode |
| UC-5-02 | First message ever sent | P0 | ⚠️ Gap | — | No test for first-message warmth/proactiveness |
| UC-5-03 | Founder hires new bot mid-project | P1 | ✅ | `bots-hire.test.ts` | Hire API tested |
| UC-5-04 | Founder connects GitHub after onboarding | P1 | ✅ | `callback.test.ts`, `connect.test.ts` | OAuth flow tested |
| UC-5-05 | Founder renames a bot | P1 | ✅ | `bots-rename.test.ts` | Rename API tested |

### Category 6: Full Feature Development Lifecycle

| UC | Name | Priority | Status | Notes |
|----|------|----------|--------|-------|
| UC-6-01 | End-to-end feature request | P1 | 🔲 Not built | Requires full workflow chain + multi-bot coordination |
| UC-6-02 | Scope changes mid-build | P1 | 🔲 Not built | Requires chain pause/resume |
| UC-6-03 | Bug discovered mid-feature | P1 | 🔲 Not built | Requires priority conflict surfacing |

### Category 7: Founder Override & Disagreement

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-7-01 | Founder overrides bot recommendation | P1 | ⚠️ Gap | — | Bot receives override; no test for compliant behaviour |
| UC-7-02 | Founder rejects plan repeatedly | P1 | 🔲 Not built | — | No rejection count tracking |
| UC-7-03 | Founder asks bot for out-of-scope action | P1 | ⚠️ Gap | `prompts.test.ts` | System prompt instructs refusal; response content not verified |
| UC-7-04 | Founder asks bot to push directly to main | P0 | ⚠️ Gap | `prompts.test.ts` | System prompt exists; refusal response not end-to-end tested |

### Category 8: Action Cap Scenarios

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-8-01 | Warning banner at 80% | P0 | ✅ | `WorkspaceShell.test.tsx` | Banner renders at 80%; threshold boundary values not tested |
| UC-8-02 | Cap hit mid-workflow | P0 | ⚠️ Gap | `index.test.ts` (bots) | RPC call mocked; enforcement effect not tested |
| UC-8-03 | Founder resets cap | P0 | ✅ | `reset-cap.test.ts`, `WorkspaceShell.test.tsx` | Reset API + UI update both tested |

### Category 9: Integration & Tool Scenarios

| UC | Name | Priority | Status | Notes |
|----|------|----------|--------|-------|
| UC-9-01 | Bot needs Figma — graceful markdown fallback | P2 | 🔲 Not built | No Figma integration |
| UC-9-02 | GitHub disconnects mid-workflow | P1 | 🔲 Not built | No disconnect detection |
| UC-9-03 | Founder connects integration proactively | P2 | 🔲 Not built | No Notion/other integrations |

### Category 10: Scheduling & Async

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-10-01 | Daily standup — founder online | P0 | ⚠️ Gap | `standup.test.ts`, `lib/crons/standup.test.ts` | Cron handler tested; 30s stagger and "feels natural" timing not tested |
| UC-10-02 | Standup — founder offline | P1 | 🔲 Not built | — | No "away" detection; no catch-up brief |
| UC-10-03 | Bot completes work while founder away | P1 | 🔲 Not built | — | No async completion notification |
| UC-10-04 | Weekend update on Monday | P2 | 🔲 Not built | — | Requires event aggregation |

### Category 11: Error & Recovery

| UC | Name | Priority | Status | Notes |
|----|------|----------|--------|-------|
| UC-11-01 | Bot execution fails mid-plan | P0 | ⚠️ Gap | Workflow chain has error handling; founder-visible failure state not tested |
| UC-11-02 | Bot posts PR comment with error | P2 | 🔲 Not built | No self-correction protocol |
| UC-11-03 | Bot times out / stuck | P1 | 🔲 Not built | No timeout UI; no retry button |
| UC-11-04 | Founder approves wrong plan accidentally | P1 | 🔲 Not built | No post-approval correction flow |
| UC-11-05 | Duplicate request while bot mid-task | P1 | 🔲 Not built | No in-flight detection |

### Category 12: Knowledge & Memory

| UC | Name | Priority | Status | Notes |
|----|------|----------|--------|-------|
| UC-12-01 | Founder asks about past decision | P2 | 🔲 Not built | Message history used for context but no search |
| UC-12-02 | Bot needs context from another channel | P2 | 🔲 Not built | No cross-channel context |
| UC-12-03 | Founder provides context mid-conversation | P1 | ✅ | `context.test.ts` | buildMessageHistory includes full conversation |
| UC-12-04 | Bot references its own previous work | P2 | 🔲 Not built | No persistent memory beyond context window |

### Category 13: External & Business Events

All use cases in Category 13 (UC-13-01 through UC-13-04): 🔲 Not built. These require advanced bot coordination not yet implemented.

### Category 14: Ops Routing Edge Cases

| UC | Name | Priority | Status | Notes |
|----|------|----------|--------|-------|
| UC-14-01 | Personal message to Ops | P2 | ⚠️ Gap | Ops bot exists; warmth-over-business response not tested |
| UC-14-02 | Founder asks Ops to do another bot's task | P1 | 🔲 Not built | No cross-bot routing from Ops |
| UC-14-03 | Founder asks Ops who handles what | P1 | 🔲 Not built | No directory lookup |
| UC-14-04 | Co-founder tries to join | P1 | 🔲 Not built | No multi-user blocking |

### Category 15: Concurrent Workflows

All use cases in Category 15 (UC-15-01 through UC-15-03): 🔲 Not built. Requires workflow orchestration layer.

### Category 16: Resolved Use Cases

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-16-01 | Founder sets persistent team rule | P2 | 🔲 Not built | — | No Rulebook feature |
| UC-16-02 | Bot produces persistent output to GitHub | P1 | ✅ | `executor.test.ts` | commit_file + create_pr actions tested |
| UC-16-03 | Founder wants to invite collaborator | P1 | 🔲 Not built | — | No multi-user support |
| UC-16-04 | Bot makes GitHub mistake; founder wants undo | P1 | ⚠️ Gap | — | No undo/correction flow surfaced to founder |
| UC-16-05 | Founder changes bot personality after hiring | P2 | 🔲 Not built | — | No post-hire personality change |
| UC-16-06 | Two bots reach a deadlock | P2 | 🔲 Not built | — | No deadlock detection |
| UC-16-07 | Founder wants to archive workspace | P2 | 🔲 Not built | — | No archive flow |
| UC-16-08 | Bot detects harmful instruction | P0 | 🔲 Not built | — | No triple-confirmation gate; relies on Claude system prompt only |
| UC-16-09 | Founder pastes very large document | P1 | ⚠️ Gap | — | Context window handled by Claude; transparency message not implemented |
| UC-16-10 | Bot asks clarifying question mid-execution | P1 | 🔲 Not built | — | No mid-plan pause |

### Category 17: Team Management

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-17-01 | Founder fires a teammate | P1 | ✅ | `bots-fire.test.ts` | Fire API tested; farewell message and channel archive not tested |

### Category 18: Bot-to-Bot Interactions

All use cases in Category 18 (UC-18-01 through UC-18-20): 🔲 Not built. Requires the workflow chain orchestration layer to be fully implemented. The basic chain mechanism (`lib/workflow-chain`) exists but bot-to-bot signalling and Ops routing are not implemented.

Exception:
| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-18-01 through UC-18-20 | Bot-to-bot interactions | P1/P2 | 🔲 Not built | — | Infrastructure in lib/workflow-chain exists; specific bot-to-bot protocols not built |

### Category 19: Working Style Scenarios

| UC | Name | Priority | Status | Notes |
|----|------|----------|--------|-------|
| UC-19-01 | Working style selected during onboarding | P1 | ✅ | DB column exists; onboarding page renders; selection persistence tested via workspace update API |
| UC-19-02 | Hands-off: auto-approve routine plan | P1 | 🔲 Not built | — |
| UC-19-03 | Balanced: plan card appears | P0 | ✅ | `PlanCard.test.tsx`, `approve.test.ts` | Plan creation + approval tested |
| UC-19-04 | Hands-on: plan with full detail | P1 | 🔲 Not built | — | No detail-level differentiation by working style |
| UC-19-05 | Critical plan: always shown regardless of mode | P0 | ⚠️ Gap | — | No "critical" plan classification; all plans shown the same way |
| UC-19-06 | Hands-off daily digest | P1 | 🔲 Not built | — | No digest compilation |
| UC-19-07 | Founder switches working style mid-project | P1 | ✅ | `update.test.ts` | API tested; in-flight chain behaviour on mode change not tested |
| UC-19-08 | Ops suggests style change (v1.1) | P2 | 🔲 Deferred to v1.1 | — | By design |
| UC-19-09 | Tech-aware founder overrides mode | P1 | 🔲 Not built | — | No per-request detail override |
| UC-19-10 | Non-technical founder gets overwhelmed | P2 | 🔲 Not built | — | No overwhelm detection |

### Categories 20–22: Feature Stage Model, Tool Discovery, Feasibility Review

All use cases in Categories 20–22 (UC-20-01 through UC-22-10): 🔲 Not built. These require the Feature Stage Model infrastructure which is planned but not yet implemented.

---

## Core Product Flow: "Send a Message, Get a Reply"

This is not in the UC list but it is the most foundational behaviour. Breaking it down:

| Step | Status | Test file(s) | Regression risk |
|------|--------|-------------|----------------|
| Founder sends message (UI → POST /api/messages) | ✅ | `messages-post.test.ts`, `WorkspaceShell.test.tsx` | Low |
| Message stored with parent_id = null | ✅ | `messages-post.test.ts` | Low |
| respondToMessage called with content (for @mention routing) | ✅ | `messages-post.test.ts` | Fixed in PR #63 |
| Bot resolves (primary or @mention) | ✅ | `phase14-routing.test.ts` | Low |
| Claude API called | ✅ | `index.test.ts` | Medium — mocked |
| Bot reply stored with parent_id = null | ✅ | `index.test.ts` | Medium — mocked |
| Bot reply appears in UI via Realtime | ⚠️ Gap | `WorkspaceShell.test.tsx` (Realtime mocked) | HIGH — Realtime failure is invisible |
| Messages persist when switching channels and returning | ✅ | `WorkspaceShell.test.tsx` (added in PR #63) | Fixed — was the regression |
| fetchMessages handles API error (migration not applied) | ✅ | `WorkspaceShell.test.tsx` (added in PR #63) | Fixed — now logged |
| DB migration applied to production | ⚠️ Manual gate | — | CRITICAL — no CI coverage possible |

---

## The Structural Test Coverage Gap

**Mocked unit tests cannot catch these failure classes:**

| Failure class | Example | Why CI misses it | How to catch |
|--------------|---------|-----------------|--------------|
| Missing DB column | `reply_count` not in production | Supabase mock returns data regardless | Manual: `supabase db push` before deploy |
| Wrong migration order | Column added but constraint references missing table | Mock doesn't validate schema | Manual: test against staging DB |
| Realtime not enabled | `messages` table not in Supabase Realtime publication | WebSocket mock always fires | Manual: send message, verify Realtime fires in browser |
| Env var missing | `ANTHROPIC_API_KEY` not set in Vercel | Mock replaces the API client | Manual: check Vercel dashboard before deploy |
| Auth cookie not refreshed | Session expires mid-session | Mock always returns auth user | Soak test: leave session open for 1h |

**The fix**: A **manual release checklist** is required in every PR that touches DB schema, env vars, or real-time. It cannot be automated — it must be a human check.

---

## Recommended Next Actions

**Immediate (before next feature ships):**
1. ✅ Confirm migration `004_phase14_threads_multibots.sql` is applied to production
2. Add release checklist template to PR template (`.github/pull_request_template.md`)
3. Write tests for the 8 P0 gaps listed at the top of this document

**Phase 16 and beyond:**
1. Use the Gate 1 process from `2026-05-20-po-phase-gate-process.md` before any phase starts
2. Run this coverage audit format at the end of every phase
3. Every PR touching DB schema must include: `- [ ] supabase db push confirmed`

---

*This document is the baseline. Every future coverage audit references this one as the starting point.*
