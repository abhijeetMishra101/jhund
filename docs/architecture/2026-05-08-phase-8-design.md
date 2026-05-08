# Phase 8 — Action Cap Enforcement

Date: 2026-05-08  
Branch: `feat/phase-8-action-cap`

## Problem

The current cap implementation in `lib/bots/index.ts` calls `increment_action_count` before every Claude response. This means **chat messages count against the cap** and the bot goes silent entirely at the limit — founders can't even talk to their team.

The product intent (UC-8-02) is:
- **Planning / conversation always works** — cap should never silence a bot
- **GitHub execution is what counts** — each approved action that touches GitHub costs one action
- **80% warning** — when 80% used, post a one-time Ops system message and amber UI bar (bar already done)
- **Reset flow** — founder can reset the counter (admin action; eventual billing hook)

## Current State

| Location | Current behaviour | Correct behaviour |
|---|---|---|
| `lib/bots/index.ts` `respondToMessage` | Increments cap before chat reply | Remove — chat is free |
| `lib/github/executor.ts` `executePlanActions` | No cap check | Add cap check + increment |
| `app/api/plans/[id]/approve/route.ts` | No cap check | No change needed (executor owns it) |
| `app/api/workspace/route.ts` | Returns `actions_used` / `action_cap` | Add a new `POST /api/workspace/reset-cap` sibling |
| `app/w/[slug]/WorkspaceShell.tsx` | Increments `actionsUsed` optimistically when bot message arrives | Increment only when a plan is executed (remove on-message increment) |

## Changes

### 1. `lib/bots/index.ts`
Remove the `increment_action_count` RPC call and the `ActionCapExceededError` entirely.  
`respondToMessage` should never touch the action counter.

### 2. `lib/github/executor.ts`
After fetching `plan` and `installation`, before executing actions:

```typescript
// Check and increment action cap atomically
const { data: allowed } = await supabase.rpc('increment_action_count', {
  p_workspace_id: workspaceId,
})
if (!allowed) throw new ActionCapExceededError()

// Check if we just crossed 80% — post one-time Ops message if so
const { data: ws } = await supabase
  .from('workspaces')
  .select('actions_used, action_cap')
  .eq('id', workspaceId)
  .single()

if (ws) {
  const pct = ws.actions_used / ws.action_cap
  if (pct >= 0.8 && pct < 0.9) {   // only in the 80-89% band to avoid spam
    // post system message to the plan's channel
  }
}
```

Export `ActionCapExceededError` from `lib/github/executor.ts` (move it from bots).

### 3. `app/api/workspace/reset-cap/route.ts` (new)
`POST` — authenticated, service client, sets `actions_used = 0` for the user's workspace.

```
POST /api/workspace/reset-cap
→ 200 { ok: true, actions_used: 0, action_cap: N }
→ 401 if unauthenticated
→ 404 if no workspace
```

### 4. `app/w/[slug]/WorkspaceShell.tsx`
Remove the optimistic `setActionsUsed(used + 1)` on bot message arrival (currently increments on every bot message, not on GitHub action execution). The counter is refreshed by the polling `GET /api/workspace` every 5s — that's sufficient.

### 5. Frontend: Reset button
Add a "Reset action counter" button in the workspace header or a settings panel, calling `POST /api/workspace/reset-cap`. Show a confirmation before calling. Refresh the counter after success.

## DB Migration
No schema change required. `actions_used` column already exists.  
`increment_action_count` RPC already exists and works correctly.

## Test Plan

### Unit / integration tests

**`__tests__/lib/github/executor.test.ts`** (extend):
- `executePlanActions` returns early with `ActionCapExceededError` when RPC returns false
- `executePlanActions` posts 80% warning Ops message when `actions_used/action_cap` crosses 80%
- No duplicate 80% warning when already ≥90%

**`__tests__/lib/bots/index.test.ts`** (extend):
- `respondToMessage` does NOT call `increment_action_count`
- `respondToMessage` succeeds even when a separate mock RPC would have returned false

**`__tests__/api/workspace/reset-cap.test.ts`** (new):
- Returns 200 `{ ok: true }` and sets `actions_used = 0`
- Returns 401 when unauthenticated
- Returns 404 when no workspace found

**`__tests__/components/WorkspaceShell.test.tsx`** (extend):
- Does NOT increment `actionsUsed` optimistically when bot message arrives

### Coverage gate
Must maintain ≥ 95% statements/lines/functions, ≥ 80% branches.

## Definition of Done
- [ ] Cap check removed from `respondToMessage`
- [ ] Cap check + increment added to `executePlanActions`
- [ ] 80% warning message posted to channel on first crossing
- [ ] `POST /api/workspace/reset-cap` implemented
- [ ] Optimistic counter increment removed from WorkspaceShell
- [ ] Reset button wired in UI
- [ ] All new tests passing
- [ ] `npm run test:coverage` passes at thresholds
- [ ] `npm run typecheck` passes
- [ ] PR opened: `feat: phase 8 action cap enforcement`
