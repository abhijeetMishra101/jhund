# Phase 7 — GitHub Write Permissions: System Design

**Date**: 2026-05-08  
**Author**: Architect  
**Status**: Ready for build  
**Effort**: S (~1 week)  
**Branch**: `feat/phase-7-github-write`

---

## Goal

Approved plan cards must actually execute on GitHub. Currently the executor
code exists and is correct, but the GitHub App has only read permissions —
every Octokit write call silently fails with 403.

This phase also adds two new webhook event types (`check_run` and `release`)
that were unhandled before.

---

## What Is Already Built (Do Not Rebuild)

| Module | Status |
|---|---|
| `lib/github/executor.ts` — create_pr, create_issue, comment_pr, comment_issue | ✅ Code complete, blocked on App permissions |
| `lib/github/events.ts` — summariseEvent for pull_request, issues, push, installation | ✅ Complete |
| `lib/github/router.ts` — label-filtered trigger routing | ✅ Complete |
| `app/api/webhooks/github/route.ts` — HMAC verification, routing, async respondToMessage | ✅ Complete |
| `lib/github/triggers.ts` — seedDefaultTriggers for PR/issue events | ✅ Complete, needs two new rows |
| All existing tests at 95%/80% coverage thresholds | ✅ Enforced by vitest |

---

## Step 1 — GitHub App Permission Update (Manual Config, No Code)

Update the GitHub App at `github.com/settings/apps/[app-slug]` to add:

| Permission | Level |
|---|---|
| Pull requests | Read & write |
| Issues | Read & write |
| Contents | Read & write (needed to create/push branches for PRs) |
| Checks | Read (for `check_run` webhook events) |
| Metadata | Read (already set) |

Subscribe to two new webhook events:
- `check_run`
- `release`

**This is the only config change.** Once permissions are updated and the App
is reinstalled on the test repo, `executePlanActions()` will work without any
code changes to the executor.

---

## Step 2 — New Code: check_run and release Event Support

### 2a. `lib/github/events.ts` — extend `summariseEvent`

Add two new cases. Both return plain-English strings, no jargon.

```
check_run (action: completed, conclusion: failure):
  "CI check '{name}' failed on branch '{branch}' in {repo}"

check_run (action: completed, conclusion: success):
  "CI check '{name}' passed on branch '{branch}' in {repo}"

release (action: published):
  "Version {tag_name} was released in {repo}"

release (any other action):
  "A release event occurred in {repo}"
```

All other check_run conclusions (cancelled, skipped, timed_out) should be
summarised as the failure case — they all warrant Engineering attention.

### 2b. `lib/github/events.ts` — extend `extractLabels`

No change needed for check_run or release — neither carries labels.
Return `[]` for both.

### 2c. `lib/github/triggers.ts` — extend `seedDefaultTriggers`

Add two new default trigger rows for startup and enterprise templates:

| event_type | label_filter | target_channel | notes |
|---|---|---|---|
| `check_run` | null | engineering channel | CI failures → Sam investigates |
| `release` | null | ops channel | Release published → Riley announces |

These rows are idempotent (seed only if no triggers exist for the workspace,
same guard already in place).

### 2d. `app/api/webhooks/github/route.ts` — no change needed

The webhook handler already calls `summariseEvent()` and `routeGithubEvent()`
generically. Once `summariseEvent` handles `check_run` and `release`, the
handler works automatically.

---

## Step 3 — Testing Requirements

**Non-negotiable**: coverage thresholds must not drop. New code must be
tested before the PR is mergeable.

### Unit tests — `lib/github/events.test.ts` (extend existing file)

Add test cases for:
- `summariseEvent('check_run', { action: 'completed', check_run: { conclusion: 'failure', name: 'Lint', check_suite: { head_branch: 'main' } }, repository: { full_name: 'owner/repo' } })` → contains "failed"
- `summariseEvent('check_run', { action: 'completed', check_run: { conclusion: 'success', ... } })` → contains "passed"
- `summariseEvent('check_run', { action: 'completed', check_run: { conclusion: 'timed_out', ... } })` → treated as failure
- `summariseEvent('release', { action: 'published', release: { tag_name: 'v1.2.3' }, repository: { full_name: 'owner/repo' } })` → contains "v1.2.3" and "released"
- `summariseEvent('release', { action: 'deleted', ... })` → fallback string, no crash
- `extractLabels` on a `check_run` payload → returns `[]`

### Unit tests — `lib/github/triggers.test.ts` (extend existing file)

Add test cases verifying:
- After `seedDefaultTriggers(workspaceId)` with startup template, `check_run` and `release` trigger rows exist
- After `seedDefaultTriggers(workspaceId)` with blank template, no `check_run` or `release` rows exist
- Idempotency: calling seed twice does not double-insert (existing guard must cover new rows)

### Integration tests — `__tests__/api/webhooks/github.test.ts` (extend existing file)

Add test cases verifying:
- POST with `x-github-event: check_run`, valid signature, valid payload → `routeGithubEvent` called with `'check_run'`; returns 200 `{ ok: true }`
- POST with `x-github-event: release`, valid signature, valid payload → `routeGithubEvent` called with `'release'`; returns 200 `{ ok: true }`
- POST with `x-github-event: check_run`, **invalid** signature → returns 401

### Integration tests — `__tests__/api/plans/approve.test.ts` (extend existing file)

Add test cases verifying:
- POST /api/plans/[id]/approve with a valid `comment_pr` action → calls `octokit.rest.issues.createComment` with correct args
- POST /api/plans/[id]/approve with a valid `create_pr` action → calls `octokit.rest.pulls.create` and `octokit.rest.git.createRef`
- POST /api/plans/[id]/approve when GitHub returns 403 (missing write permission) → plan status set to `failed`, error message stored

The 403 case is new — executor currently has no error state. Add it (see below).

---

## Step 4 — Executor Error Handling (New)

The executor currently has no error path. If a GitHub write call fails (403,
404, network timeout), the plan stays `pending` forever. That is unacceptable.

Add error handling to `executePlanActions`:

```
try:
  execute all actions
  mark plan status = 'executed'
catch error:
  mark plan status = 'failed'
  store error.message in plans.error_message column (new column)
  insert system message in channel: "Sam ran into a problem: {plain-English error}. You can try again."
```

**New DB column**: `plans.error_message TEXT NULL` — add via Supabase migration.
No new table required.

**Plain-English error mapping** (in executor):
- 403 → "GitHub didn't allow the action. Check that the Clan App has the right permissions on your repo."
- 404 → "The branch or file couldn't be found on GitHub. It may have been deleted."
- Any other → "Something went wrong on GitHub's side. Try again in a minute."

---

## Module Boundaries

```
lib/github/
  events.ts       ← ADD: check_run and release cases to summariseEvent
  triggers.ts     ← ADD: check_run and release rows in seedDefaultTriggers
  executor.ts     ← ADD: try/catch → plan.status='failed', error_message, system message

app/api/
  webhooks/github/route.ts   ← NO CHANGE (generic handler)
  plans/[id]/approve/route.ts ← NO CHANGE (calls executor)

DB migrations/
  add_plans_error_message.sql ← NEW: ALTER TABLE plans ADD COLUMN error_message TEXT
```

---

## Test Coverage Contract

All new code paths must be covered before PR merges. The CI gate already
enforces 95% statement/line/function and 80% branch. No exceptions.

Specific coverage targets for Phase 7 additions:

| File | New lines | Must be tested |
|---|---|---|
| `lib/github/events.ts` (check_run, release cases) | ~20 | ✅ Unit |
| `lib/github/triggers.ts` (2 new rows) | ~10 | ✅ Unit |
| `lib/github/executor.ts` (error handling) | ~30 | ✅ Integration (via approve endpoint) |
| DB migration | 1 SQL statement | N/A (Supabase migration, not testable) |

---

## Definition of Done — Phase 7

- [ ] GitHub App has `issues: write`, `pull_requests: write`, `contents: write` on the test repo
- [ ] Approved plan card with `comment_pr` action posts a real comment on GitHub
- [ ] Approved plan card with `create_pr` action opens a real PR on GitHub
- [ ] `check_run.completed` webhook with `conclusion: failure` routes to engineering channel
- [ ] `release.published` webhook routes to ops channel
- [ ] Failed executor sets plan to `failed` with plain-English error, posts system message
- [ ] All existing CI checks still green (vitest 95%/80% thresholds)
- [ ] New test cases for check_run, release, and executor error path pass
- [ ] PR merged to main, Vercel deploy succeeds

---

## Blockers

1. **GitHub App reinstall required** after adding write permissions — existing installations don't auto-update. Founder must go to Settings → GitHub Apps and approve the new permission scope. This is a one-time founder action, not a code change.

2. **Supabase migration** for `plans.error_message` must run before deploy. Use the Supabase dashboard SQL editor or migration file — not a code change, but must happen before the approve endpoint uses the new column.
