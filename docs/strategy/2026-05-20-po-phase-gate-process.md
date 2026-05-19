# PO Phase Gate Process

**Date**: 2026-05-20
**Author**: Product Owner
**Status**: Active — applies from Phase 16 onward (retroactively audited for Phases 1–15 in the companion document)

---

## Why This Exists

In Phase 15 a regression shipped that caused messages to disappear when a founder switched channels and returned. The root cause was a mocked test suite passing while a production DB column was missing. The Supabase Realtime subscription masked the failure until the subscription was torn down — at which point the fetch failed silently and the founder saw an empty screen.

This happened because:
1. No one owned the gap between "CI is green" and "founder can use the product"
2. No test covered the full "send message → switch channel → return → messages visible" roundtrip
3. A deployment step (`supabase db push`) was not listed as a release gate
4. The PO approved the phase without a structured coverage check

This document formalises the process so it cannot happen again.

---

## The Core Principle

> **Green CI ≠ works for the founder.**
>
> Unit tests with mocked infrastructure verify code shape, not runtime correctness.
> A missing DB column, an unrun migration, or an unset env var will never fail in CI.
> They will always fail for the founder.
>
> The PO owns the gap.

---

## Two Gates Per Phase

### Gate 1 — Before Implementation (Pre-Phase)

The PO produces a **use case list** before any code is written.

**Format for each use case:**

```
UC-[phase]-[number] — [short name]
Priority: P0 / P1 / P2
Trigger: [what the founder does or what system event fires]
Expected: [what the founder observes — in plain English, no technical terms]
Edge: [what can go wrong and how it should be handled]
Infrastructure dependency: [DB migration / env var / external service / none]
```

**Priority definitions:**
- **P0**: The product is broken without this. Blocks merge.
- **P1**: Important — founder will notice the absence. Should ship with the phase.
- **P2**: Nice to have. Can defer to the next phase with documented reason.

**Rules:**
- Every use case is written as a **founder-observable behaviour**, not a technical task
- Infrastructure dependencies are listed explicitly — they are release gates, not afterthoughts
- The list is shared with the Architect and engineers **before coding starts**
- No phase starts without a PO-signed use case list

---

### Gate 2 — After Implementation (Post-Phase)

The PO runs a **coverage audit** against the use case list.

**For each use case, assign one of:**

| Status | Meaning |
|--------|---------|
| ✅ Covered | Implemented AND has an automated test that would catch a regression |
| ⚠️ Gap | Implemented but no test covers it — regression would be invisible in CI |
| 🔲 Deferred | Not implemented this phase — documented reason required |
| ❌ Broken | Implemented but not working correctly — blocks merge |

**Two categories that automated tests structurally cannot cover:**

| Category | What it is | How to handle |
|----------|-----------|---------------|
| **Deployment steps** | DB migrations, env vars, secrets, external service config | Manual release checklist in the PR — engineer signs off before merge |
| **Real-time behaviour** | WebSocket events, Supabase Realtime, Pusher subscriptions | Manual smoke test — founder-visible path tested by hand before merge |

**Release checklist template (required in every PR touching DB or infra):**
```
## Release Checklist
- [ ] Migration applied to production (`supabase db push` run and confirmed)
- [ ] All required env vars set in Vercel dashboard
- [ ] Supabase Realtime enabled for new tables (if applicable)
- [ ] Smoke test: [specific founder-visible path] verified manually
```

**Merge rules:**
- Any P0 use case that is ⚠️ Gap or ❌ Broken **blocks merge**
- P1 gaps are documented and tracked — PO decides whether to block or defer
- P2 gaps are recorded — no block
- Deployment steps are **always P0** — no exceptions

---

## Coverage Audit Document Format

Save to `docs/strategy/YYYY-MM-DD-phase-N-coverage.md`

```markdown
# Phase N — Use Case Coverage Audit

**Phase**: N — [phase name]
**Audit date**: YYYY-MM-DD
**Auditor**: Product Owner

## Summary

| Status | Count |
|--------|-------|
| ✅ Covered | N |
| ⚠️ Gap | N |
| 🔲 Deferred | N |
| ❌ Broken | N |

## P0 gaps or broken (blocks merge): [list or "none"]

## Coverage Table

| UC | Name | Priority | Status | Test file(s) | Notes |
|----|------|----------|--------|-------------|-------|
| UC-N-01 | ... | P0 | ✅ | `__tests__/...` | |
| UC-N-02 | ... | P0 | ⚠️ | — | No test for channel switch roundtrip |
...

## Deployment Gates

| Item | Required action | Confirmed? |
|------|----------------|-----------|
| Migration X | `supabase db push` | [ ] |
| Env var Y | Set in Vercel dashboard | [ ] |

## Deferred Use Cases

| UC | Reason | Target phase |
|----|--------|-------------|
| UC-N-03 | Requires workflow chain infra not ready | Phase N+2 |
```

---

## What Counts as "Covered"

A use case is ✅ Covered only if it has a test that would **fail if the behaviour regressed**.

**Counts:**
- Unit test with mocked Supabase that verifies the correct query structure ← **only if the query shape matters**
- Integration test that exercises the full request/response cycle
- E2E test that fires from the UI and verifies founder-visible output
- Test that explicitly covers the error/edge case, not just the happy path

**Does NOT count:**
- A test that mocks the entire dependency chain and only checks shape
- A test that passes regardless of whether the DB column exists
- A test that verifies "the fetch was called" but not "the message appeared"

**The diagnostic question:** *If a developer deletes the key line of production code this use case depends on, does this test fail?* If yes: ✅. If no: ⚠️.

---

## Roles and Accountability

| Responsibility | Owner |
|---------------|-------|
| Write use case list before phase | Product Owner |
| Review list and flag infra blockers | Architect |
| Add release checklist to PR | Backend/Frontend Engineer |
| Run coverage audit after phase | Product Owner |
| Fix P0 gaps before merge | Engineer (whichever role owns the code) |
| Sign off on deployment gates | Product Owner (after engineer confirms) |

---

## Starting Point

The Phase 1–15 retroactive audit is in `docs/strategy/2026-05-20-phases-1-15-coverage-audit.md`.

Every phase from 16 onward uses this process from the start, not after the fact.
