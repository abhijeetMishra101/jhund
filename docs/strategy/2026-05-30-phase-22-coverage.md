# Phase 22 — Pre-Phase Coverage Plan: `patch_github_file`

**Date**: 2026-05-30
**Author**: Product Owner
**Branch**: `feat/phase-22-patch-file`
**Priority**: P0 — safety-critical, blocks further bot editing work
**Triggered by**: PR #93 incident — Sam deleted 521 lines of `lib/bots/index.ts` by submitting a partial file via `commit_file`

---

## Why This Is Phase 22 (Phase Renumbering)

The original Phase 22 was "Workspace Context — CONTEXT.md injection." That work is deferred to Phase 23.

This fix is promoted ahead of it because **bots can silently destroy production code today**. Every bot edit on a file larger than ~200 lines is a live risk. No other feature work is safe to ship until this is resolved.

---

## Root Cause (for the record)

1. `readGithubFile` truncates responses at 8,000 characters — so large files are only partially visible to the bot
2. `commit_file` performs full-file replacement — if the bot writes back a partial version, the rest is silently deleted
3. No server-side guard existed to catch this

The fix: introduce `patch_github_file` (surgical string replacement) and restrict `commit_file` to new-file creation only.

---

## 1. Use Case List

### Feature 1 — `patch_github_file` tool

| ID | Use Case | Priority | Reason |
|----|----------|----------|--------|
| UC-22-01 | Bot patches an existing file by supplying `old_string` + `new_string` — only the matched section changes, the rest of the file is preserved exactly | P0 | Core promise of this phase — surgical edit that cannot destroy surrounding code |
| UC-22-02 | `patch_github_file` rejects when `old_string` is not found in the current file — returns a plain-English error, no commit is made | P0 | Must fail loudly rather than silently apply a wrong patch |
| UC-22-03 | `patch_github_file` rejects when `old_string` matches more than once — returns an error asking for a more specific string | P0 | Ambiguous match means the wrong section could be replaced |
| UC-22-04 | Bot successfully patches a 700+ line file by reading only the relevant section and supplying exact surrounding context as `old_string` | P0 | This is the failure mode from PR #93 — must be provably fixed |
| UC-22-05 | `patch_github_file` fetches the current file from GitHub, applies the patch, and commits atomically — race condition cannot overwrite concurrent changes silently | P1 | Concurrent bot edits are uncommon today but the pattern must be correct |
| UC-22-06 | Error message on failed match explicitly tells the bot: "Read the file again and use the exact text" | P1 | Bot self-correction depends on a clear, actionable error message |
| UC-22-07 | `patch_github_file` works on any branch (not just `bot/`) — branch passed as parameter | P1 | Must not be restricted to auto-approve branches; founders may review the PR anyway |

### Feature 2 — `commit_file` restriction to new files only

| ID | Use Case | Priority | Reason |
|----|----------|----------|--------|
| UC-22-08 | `commit_file` rejects with a clear error if the file already exists on the target branch | P0 | Closes the PR #93 failure mode permanently — cannot accidentally overwrite |
| UC-22-09 | `commit_file` still succeeds for files that do not yet exist on the branch | P0 | Bot must still be able to create new files; restriction is update-only |
| UC-22-10 | The `commit_file` tool description in the bot's tool list is updated: "Use this only to create a new file. To edit an existing file, use `patch_github_file`." | P0 | If Claude doesn't know the rule, it will keep using the wrong tool |
| UC-22-11 | When `commit_file` is called on an existing file and rejected, the error message tells the bot which tool to use instead | P1 | Without this the bot loops helplessly rather than self-correcting |

---

## 2. Infrastructure / Deployment Gates

No DB migrations required. This is a purely code-level change.

| Gate | What to check | Risk if skipped |
|------|--------------|-----------------|
| Tool prompt update | `lib/bots/tools.ts` description for `commit_file` must be updated before deploy | Bot ignores the new tool and continues using `commit_file` for edits |
| System prompt update | Bot system prompts should reference `patch_github_file` for edits | Same risk as above — behaviour change requires prompt change |

---

## 3. What Unit Tests Cannot Cover (manual smoke test required)

### Smoke Test E — `patch_github_file` against a real file

1. Ask a bot to add a comment to a specific function in an existing file (something small).
2. Confirm the bot uses `patch_github_file` (not `commit_file`) in the plan.
3. Approve the plan.
4. Open GitHub — confirm only the targeted lines changed, the rest of the file is intact.
5. Confirm file line count before and after matches (± the added lines only).

**What CI cannot cover**: actual Octokit fetch + patch + commit round-trip, GitHub's response to an ambiguous `old_string`, and the bot's tool selection behaviour in a live conversation.

### Smoke Test F — `commit_file` new-file guard

1. Ask a bot to edit an existing file using natural language that would previously have triggered `commit_file`.
2. Confirm the bot either uses `patch_github_file` OR if it still tries `commit_file`, confirm the server rejects it with a clear error.
3. Confirm the existing file is unchanged on GitHub.

---

## 4. Post-Phase Audit Template

### Feature 1 — `patch_github_file`

- [ ] UC-22-01: Patch preserves surrounding file content — unit test exists and passes
- [ ] UC-22-02: `old_string` not found → reject, no commit — unit test exists and passes
- [ ] UC-22-03: Ambiguous `old_string` (multiple matches) → reject — unit test exists and passes
- [ ] UC-22-04: 700+ line file patched correctly — unit test with large fixture exists and passes
- [ ] UC-22-06: Error message is actionable ("Read the file again...") — confirmed in test assertions
- [ ] Smoke Test E completed — real GitHub file patched surgically (date: ________)

### Feature 2 — `commit_file` restriction

- [ ] UC-22-08: `commit_file` on existing file → rejected — unit test exists and passes
- [ ] UC-22-09: `commit_file` on new file → succeeds — unit test exists and passes
- [ ] UC-22-10: Tool description updated in `lib/bots/tools.ts` — confirmed in code review
- [ ] Smoke Test F completed — existing file not overwritten (date: ________)

### Sign-off

- [ ] All P0 use cases have automated tests
- [ ] Both smoke tests passed
- [ ] PR #93 failure mode is provably impossible (test covers the exact scenario)
- [ ] No regression on existing `commit_file` new-file creation

**PO sign-off date**: 2026-05-30
**Notes**:
