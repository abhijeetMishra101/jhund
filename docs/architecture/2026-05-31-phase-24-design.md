# Phase 24 — Autonomous Work Loop + Auto-Derive Context

**Date:** 2026-05-31  
**Status:** Approved for implementation  
**Scope:** Two deliverables — 23b (auto-derive context) + 24 (autonomous work loop)

---

## Problem

### 24: Bots stop after one action

Current loop structure in `respondToMessage`:
```
read_loop (up to 5 file reads)
  → ONE action tool call
  → STOP
```

A bot dispatched to "implement feature X" can read files, then take exactly one action, then stops. The founder has to re-trigger it for every subsequent step. This is not autonomous.

What the Guinea Pig Gate requires:
```
read files → commit doc → commit another file → commit code → open PR
```
That is 4 actions. Today the bot does 1.

### 23b: Founder must manually type project context

The Settings textarea (Phase 23a) asks non-technical founders to write a technical description. The GitHub repo is already connected — README + package.json contain exactly what bots need. The founder should never have to touch this.

---

## Solution Overview

```
Phase 23b: GitHub connect callback
  └── reads README.md + package.json from repo
  └── writes bot_context to workspaces table (if not already set)
  └── founder never touches Settings for this

Phase 24: Extended work loop in respondToMessage
  └── after each auto-approvable action, feed ✅ result back to Claude
  └── Claude continues working (more reads, more commits)
  └── loop exits on: create_pr (founder gate), advance_feature_stage,
      plain text, or safety cap
```

---

## Phase 23b: Auto-Derive Context on GitHub Connect

### New file: `lib/github/derive-context.ts`

```typescript
export async function deriveWorkspaceContext(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string | null>
```

**Logic:**
1. Fetch `README.md` via `octokit.rest.repos.getContent({ path: 'README.md' })` — decode base64, take first 1500 chars
2. Fetch `package.json` if it exists — extract `name`, `description`, and key dependency names (`next`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, etc.)
3. Synthesise:
   ```
   Project: <package.name or repo name>
   <package.description if present>
   Stack: <detected deps as comma list>
   
   <first 1500 chars of README>
   ```
4. Return `null` if README doesn't exist (Ops bot nudge handles this — UC-23b-04)
5. Cap at 3000 chars (within the 3200 API limit)

### Change: `app/api/github/callback/route.ts`

After `seedDefaultTriggers(userRow.workspace_id)`:

```typescript
// Derive and save workspace context from README + package.json
// Only set if bot_context is not already set — preserves manual overrides
const { data: ws } = await serviceClient
  .from('workspaces')
  .select('bot_context')
  .eq('id', userRow.workspace_id)
  .single()

if (!ws?.bot_context) {
  const context = await deriveWorkspaceContext(octokit, owner, repo)
  if (context) {
    await serviceClient
      .from('workspaces')
      .update({ bot_context: context })
      .eq('id', userRow.workspace_id)
  }
}
```

**Guard:** Never overwrites an existing `bot_context`. If the founder has typed something in Settings, it stays.

**Failure mode:** If README fetch fails (private repo permission, network), log and skip silently — bots still work without context.

---

## Phase 24: Autonomous Work Loop

### Core change: extend the loop in `respondToMessage`

**Current:**
```
MAX_READ_ITERATIONS = 5
loop:
  if readBlocks.length > 0 → resolve reads, continue
  else → break
```

**New:**
```
MAX_WORK_ITERATIONS = 10   (reads + actions combined)
loop:
  if readBlocks.length > 0 → resolve reads, continue   (unchanged)
  
  else if propose_github_action AND confidence='auto' AND isAutoApprovable:
    → execute actions via executePlanActions
    → post ⚡ system message (existing)
    → feed tool_result back to Claude: "✅ Done: <description>"
    → continue loop
  
  else → break   (create_pr, advance_stage, create_feature, text, etc.)
```

### Tool result format for executed actions

When the work loop executes an auto-approvable action, it provides this back to Claude:

```
✅ Executed: <plain_english_description>
Actions completed: commit_file → docs/features/my-feature/spec.md on bot/my-feature
```

This tells Claude exactly what was done so it can plan the next step without re-reading.

### Exit conditions (no change to existing behaviour)

| Condition | Behaviour |
|-----------|-----------|
| `propose_github_action` with `create_pr` | Breaks loop → creates plan chip → **founder must approve** ✅ |
| `propose_github_action` non-auto-approvable | Breaks loop → creates plan chip → founder gate ✅ |
| `advance_feature_stage` | Breaks loop → stage advances → dispatches next bot |
| `create_feature` | Breaks loop → handled by existing code |
| `record_decision` | Breaks loop → handled by existing code |
| `document_discussion` | Breaks loop → handled by existing code |
| Plain text | Breaks loop → bot message stored |
| `MAX_WORK_ITERATIONS` reached | Breaks loop → surfaces "I'm still working, check back" message |

### The founder gate is never weakened

`create_pr` is NOT auto-approvable. It is NOT handled in the work loop. A bot that commits 10 files autonomously must still open a PR through the plan chip that the founder approves. This is intentional and preserved.

### Safety cap

`MAX_WORK_ITERATIONS = 10` covers:
- Up to 5 file reads (existing cap, each counts as 1)
- Up to 5 action steps (commit_file, patch_github_file, etc.)

If exceeded: store a system message "I've done a lot of work but need to pause — ask me to continue if needed." Do NOT throw. Do NOT leave the plan in a broken state.

### No new DB columns

The work loop executes existing plan rows via `executePlanActions`. No schema changes required for Phase 24.

---

## Module Map

```
lib/github/derive-context.ts          NEW — README + package.json → context string
app/api/github/callback/route.ts      MODIFIED — call deriveContext after repo connect
lib/bots/index.ts                     MODIFIED — extend work loop (MAX_READ → MAX_WORK)
```

No changes to:
- `lib/github/executor.ts`
- `lib/bots/auto-approve.ts`
- `lib/bots/tools.ts`
- `lib/workflow-chain`
- `lib/feature-stages`

---

## What Phase 25 Still Needs (not in scope here)

- **Bot-to-bot messaging**: Bot A asking Bot B a question mid-task
- **Escalation to founder**: `escalate_to_founder` tool when bot is blocked
- **Founder notification on PR**: push notification when PR is ready

Phase 24 gets a bot to the PR-creation step autonomously. Phase 25 handles blocked states and inter-bot communication.

---

## Implementation Order

1. `lib/github/derive-context.ts` — new file, pure function, easy to test
2. `app/api/github/callback/route.ts` — call deriveContext after seedDefaultTriggers
3. `lib/bots/index.ts` — extend work loop
4. Tests:
   - `__tests__/lib/github/derive-context.test.ts` — README parsing, package.json extraction, null on missing README
   - `__tests__/lib/bots/index.test.ts` — work loop chains 2 auto-approved commits, stops at create_pr
   - `__tests__/api/github/callback.test.ts` — context derived and saved on connect

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Bot runs 10 actions on wrong branch, making a mess | All auto-approvable actions write to `bot/*` branches only — never to main |
| Context derivation reads private files | Only reads README.md and package.json — both are standard public-facing files |
| Infinite loop if Claude keeps requesting reads | MAX_WORK_ITERATIONS hard cap; surfaces message to founder |
| Large README bloats token cost | Cap at 3000 chars (first pass); system prompt still cached |
