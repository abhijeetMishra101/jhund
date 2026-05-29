# Phase 21 — Pre-Phase Coverage Plan

**Date**: 2026-05-29  
**Author**: Product Owner  
**Branch**: `feat/phase-21-autonomy`  
**Features**: `list_directory` tool + Confidence-gated auto-approve

---

## 1. Use Case List

### Feature 1 — `list_directory`

| ID | Use Case | Priority | Reason |
|----|----------|----------|--------|
| UC-21-01 | Bot calls `list_directory` on a valid path and receives a list of file and folder names | P0 | Core behaviour — if this doesn't work the feature is dead |
| UC-21-02 | Bot chains `list_directory` followed by `read_github_file` in the same conversation to locate and read the right file without the founder specifying a path | P0 | This is the entire purpose of the feature; absence breaks the navigation gap promise |
| UC-21-03 | Bot calls `list_directory("")` (empty string = repo root) to orient itself from scratch | P0 | Bots will start here when they have no path hint — must not error |
| UC-21-04 | Bot calls `list_directory` on a path that does not exist — receives a plain-English error, channel message is still delivered, no 500 or unhandled crash | P0 | Graceful degradation is a hard requirement; a crash on bad input would surface to the founder as a broken channel |
| UC-21-05 | Response from `list_directory` includes `name`, `path`, and `type` fields for every entry | P1 | Claude needs all three fields to decide its next step; missing `type` causes it to blindly read directories |
| UC-21-06 | `list_directory` called on a path that points to a single file (not a directory) — server returns an error message rather than crashing | P1 | Octokit returns an object not an array for files; the guard must handle this |
| UC-21-07 | `list_directory` does NOT increment the action counter | P0 | Defined in the design doc — treats it the same as `read_github_file`; if it counted, bots would burn budget just exploring |
| UC-21-08 | Bot resolves `list_directory` and `read_github_file` in the same read-loop pass (both tool types handled in one `Promise.all` iteration) | P1 | Mixed-type passes are the normal navigation pattern; if only one type is resolved per pass, the loop wastes 2x the turns |
| UC-21-09 | Read loop terminates (does not run forever) even if Claude keeps calling `list_directory` on every iteration | P1 | Max 5 iterations applies; otherwise a misbehaving bot could stall the channel indefinitely |

**P0 rationale summary**: UC-21-01, 02, 03, 04, 07 are P0 because they represent the complete happy path + the single most dangerous failure mode (crash on bad input) + the budget invariant. Without any one of these working, the feature either does nothing or actively breaks the product.

---

### Feature 2 — Confidence-gated Auto-Approve

| ID | Use Case | Priority | Reason |
|----|----------|----------|--------|
| UC-21-10 | Bot proposes a change to a `docs/` file with `confidence: 'auto'` — the action executes without the founder clicking Approve | P0 | Core feature promise; if this doesn't work the whole feature is moot |
| UC-21-11 | Bot proposes a change to a `__tests__/` file with `confidence: 'auto'` — the action executes without the founder clicking Approve | P0 | Second stated safe path; must work identically to docs/ |
| UC-21-12 | Bot proposes a change to a `lib/` file with `confidence: 'auto'` — the server rejects auto-approve, falls back to normal plan chip, founder must click Approve | P0 | Server-side whitelist is the entire safety guarantee; if code files auto-execute, a rogue or confused bot can overwrite production code silently |
| UC-21-13 | Bot proposes a `create_pr` action with `confidence: 'auto'` — server rejects auto-approve, falls back to normal plan chip | P0 | PR creation is explicitly out of scope for auto-approve; always needs founder review |
| UC-21-14 | Bot proposes a `create_issue` action with `confidence: 'auto'` — server rejects auto-approve, falls back to normal plan chip | P1 | Same rule as create_pr; lower priority only because issues are less consequential than PRs |
| UC-21-15 | When an action is auto-executed, a system message `"⚡ Auto-executing: {description}"` appears in the channel before the execution runs | P0 | Founder visibility is a design principle (Design Principle 3); absence means founder has no idea what ran |
| UC-21-16 | Auto-executed action is recorded in the `plans` table with `status: 'auto_executed'` and `auto_approved: true` | P0 | Audit trail is a hard requirement (Design Principle 2); without this the founder cannot review what the bot did |
| UC-21-17 | Auto-executed action increments the action counter exactly once | P0 | Budget invariant from Goal G4; auto ≠ free is explicit in the design |
| UC-21-18 | Founder can view the auto-executed plan entry in the plans table (plan is not hidden or deleted) | P1 | Audit purpose — lower priority than the row existing at all (UC-21-16) |
| UC-21-19 | Bot proposes a batch of 4 or more `commit_file` actions with `confidence: 'auto'` — server rejects auto-approve (max 3 file rule), falls back to plan chip | P1 | Prevents bulk silent rewrites; design doc specifies the 3-file cap explicitly |
| UC-21-20 | Bot proposes a `commit_file` on a `bot/` branch for a `docs/` file — auto-approve succeeds (branch name check passes) | P1 | Branch must start with `bot/` — valid case that combines all allowlist rules |
| UC-21-21 | Bot proposes a `commit_file` on `main` branch with `confidence: 'auto'` — server rejects (branch does not start with `bot/`), falls back to plan chip | P0 | Bots must never auto-commit directly to main; this is the most dangerous failure mode in the feature |
| UC-21-22 | When `isAutoApprovable()` returns false for any reason, the action silently falls back to the normal plan chip — no error message, no broken channel state | P1 | Graceful fallback is essential UX; founder should just see the usual Approve chip |
| UC-21-23 | `plans` row `auto_approved_at` timestamp is set when the action executes (not null) | P1 | Data completeness for audit; `auto_approved` is P0 but the timestamp is P1 — nice to have for debugging |
| UC-21-24 | Bot proposes a `.test.ts` file change (not under `__tests__/`) with `confidence: 'auto'` — server allows it (file ends in `.test.ts`, matches safePaths regex) | P2 | Edge case; the regex covers this but it is not the primary stated path — testing the regex boundary |
| UC-21-25 | Bot proposes a `.md` file change outside `docs/` (e.g. `README.md` at root) with `confidence: 'auto'` — server allows it (ends in `.md`) | P2 | Another regex boundary; valid but low business risk either way |

**P0 rationale summary**: UC-21-10, 11 are the two concrete happy-path promises. UC-21-12, 13, 21 are the three most dangerous failure modes (code file auto-execute, PR auto-execute, main branch auto-commit). UC-21-15, 16 are the visibility and audit trail guarantees. UC-21-17 is the budget invariant. All eight must pass before the feature ships.

---

## 2. Infrastructure / Deployment Gates

These items cannot be verified by CI. They must be confirmed by a human before the feature branch is merged to production.

| Gate | What to check | Risk if skipped |
|------|--------------|-----------------|
| DB migration: `auto_approved` column | Run `ALTER TABLE plans ADD COLUMN auto_approved boolean NOT NULL DEFAULT false;` on the production Supabase instance | `index.ts` will throw a column-not-found error on every auto-approve attempt; entire bot response fails |
| DB migration: `auto_approved_at` column | Run `ALTER TABLE plans ADD COLUMN auto_approved_at timestamptz;` on production | Auto-execute flow errors on insert; channel message never delivered |
| DB migration: `status` enum extension | Add `'auto_executing'` and `'auto_executed'` to the `plans.status` enum in production | Inserting a plan row with the new status throws a Postgres enum error; bot crashes mid-response |
| Migration order | All three migrations must be applied before the code deploy — not after | If code ships first, every `propose_github_action` call will fail until migrations catch up |
| Verify migration applied | After applying, run `SELECT column_name FROM information_schema.columns WHERE table_name = 'plans';` and confirm `auto_approved` and `auto_approved_at` appear | Silent runtime failure with cryptic Supabase errors |

---

## 3. What Unit Tests Cannot Cover (manual smoke tests required)

These behaviours require a live GitHub connection and a running Supabase instance. They cannot be faked with mocks in CI.

### Smoke Test A — `list_directory` against a real repo

1. Connect a test workspace to a GitHub repo.
2. Send the bot: "Update the README inside lib/bots".
3. Observe that the bot calls `list_directory("lib/bots")` in the server logs.
4. Observe that the bot follows up with `read_github_file` on one or more files from the listing.
5. Observe that the bot eventually proposes a file change — without the founder specifying the file path.

**What CI cannot cover**: the actual Octokit call, real 404 responses from GitHub for bad paths, and the bot's decision to navigate progressively.

### Smoke Test B — Auto-approve actually commits to GitHub

1. Send the bot a task that touches only a `docs/` file on a `bot/` branch.
2. Observe the `"⚡ Auto-executing: …"` message in the channel.
3. Open GitHub and confirm the commit appears on the `bot/` branch.
4. Confirm the founder was never shown an Approve chip.

**What CI cannot cover**: actual GitHub commit creation, the real round-trip from `executePlanActions` through Octokit, and the commit appearing in the GitHub UI.

### Smoke Test C — Action counter incremented after auto-approve

1. Note the current action count for the workspace before the smoke test.
2. Trigger one auto-approved commit (Smoke Test B).
3. Reload the workspace and confirm the action counter increased by exactly 1.

**What CI cannot cover**: the Supabase RPC `increment_action_count` interacting with the real counter row — mocks in unit tests only confirm the call was made, not that the counter actually changed.

### Smoke Test D — Code file falls back to Approve chip

1. Ask the bot to make a change to a file in `lib/`.
2. Even if the bot sends `confidence: 'auto'`, confirm an Approve chip appears in the channel.
3. Confirm no auto-execution system message was posted.

**What CI cannot cover**: the full message rendering pipeline that produces the Approve chip UI element.

---

## 4. Post-Phase Audit Template

After implementation is complete, the PO fills in this checklist before marking the phase done.

### Feature 1 — `list_directory`

- [ ] UC-21-01: `list_directory` on a valid path returns name/path/type for each entry — unit test exists and passes
- [ ] UC-21-02: Bot chains list + read in one conversation without founder specifying path — unit test exists and passes
- [ ] UC-21-03: `list_directory("")` root call works — unit test or smoke test confirmed
- [ ] UC-21-04: Bad path returns plain-English error, no crash — unit test exists and passes
- [ ] UC-21-07: Action counter NOT incremented after `list_directory` — unit test exists and passes
- [ ] UC-21-08: Mixed `list_directory` + `read_github_file` in one loop pass — unit test exists and passes
- [ ] UC-21-09: Read loop terminates at 5 iterations max — confirmed in test or code review
- [ ] Smoke Test A completed — bot navigated to correct file without founder help (date: ________)

### Feature 2 — Confidence-gated Auto-Approve

- [ ] UC-21-10: `docs/` file auto-executes — unit test exists and passes
- [ ] UC-21-11: `__tests__/` file auto-executes — unit test exists and passes
- [ ] UC-21-12: `lib/` file falls back to plan chip — unit test exists and passes
- [ ] UC-21-13: `create_pr` falls back to plan chip — unit test exists and passes
- [ ] UC-21-15: `"⚡ Auto-executing: …"` system message posted before execution — unit test exists and passes
- [ ] UC-21-16: `plans` row written with `status: 'auto_executed'` and `auto_approved: true` — unit test exists and passes
- [ ] UC-21-17: Action counter incremented exactly once per auto-execute — unit test exists and passes
- [ ] UC-21-21: `main` branch auto-approve rejected — unit test exists and passes
- [ ] Smoke Test B completed — commit visible on GitHub without Approve click (date: ________)
- [ ] Smoke Test C completed — action counter incremented by 1 (date: ________)
- [ ] Smoke Test D completed — `lib/` change showed Approve chip (date: ________)

### Deployment Gates

- [ ] DB migration `auto_approved` column applied to production
- [ ] DB migration `auto_approved_at` column applied to production
- [ ] DB migration `status` enum extended with `'auto_executing'` and `'auto_executed'` in production
- [ ] Migrations confirmed applied via schema inspection query
- [ ] Code deploy ran AFTER all three migrations were applied

### Sign-off

- [ ] All P0 use cases have automated tests
- [ ] All four smoke tests passed
- [ ] All deployment gates confirmed
- [ ] No new P0 gaps introduced (regression check: existing executor and plan chip tests still pass)

**PO sign-off date**: ________________  
**Notes**: 
