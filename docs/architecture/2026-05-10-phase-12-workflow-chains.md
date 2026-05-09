# Phase 12 — Workflow Chains

**Date**: 2026-05-10
**Lead role**: ML/Agent Engineer + Backend Developer
**Branch**: `feat/phase-12-workflow-chains`
**Duration**: ~4–5 hours

---

## Context

Currently, a GitHub event routes to exactly one bot in one channel. Workflow chains allow a single event to trigger a sequential or parallel handoff between multiple bots — e.g. a merged PR first triggers Sam (engineering review) then automatically hands off to Casey (QA test checklist).

This is what makes Clan feel like a team rather than a single chatbot.

---

## What a Chain Is

```
GitHub Event
     │
     ▼
[Trigger Rules] ──── matches ────▶ Chain Definition
                                        │
                              ┌─────────┴─────────┐
                              │                   │
                         Sequential           Parallel
                              │                   │
                         Bot A runs          Bot A + Bot B
                         Bot B runs              run at once
                         (after A done)
```

A chain definition lives in the `github_triggers` table — extended with `chain_order` and `chain_type` columns.

---

## DB Migration

```sql
ALTER TABLE github_triggers
  ADD COLUMN IF NOT EXISTS chain_order   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chain_type    TEXT    NOT NULL DEFAULT 'parallel'
    CHECK (chain_type IN ('sequential', 'parallel')),
  ADD COLUMN IF NOT EXISTS chain_group   TEXT;
  -- chain_group: null = standalone trigger; same string = part of same chain
```

**Example seed data** (startup template, on `pull_request` event):

| event_type | channel | chain_group | chain_type | chain_order |
|---|---|---|---|---|
| pull_request | #engineering | `pr-review` | sequential | 0 |
| pull_request | #qa | `pr-review` | sequential | 1 |

This means: PR event → Sam in #engineering responds first → after Sam's response is saved → Casey in #qa responds.

---

## Module: `lib/workflow-chain/`

### `lib/workflow-chain/index.ts`

```typescript
export interface ChainStep {
  channelId: string
  workspaceId: string
  chainGroup: string | null
  chainType: 'sequential' | 'parallel'
  chainOrder: number
}

// Groups route matches into chains, sorts by order
export function buildChains(matches: ChainStep[]): ChainStep[][]

// Executes chains: parallel steps run concurrently, sequential steps run in order
export async function executeChain(steps: ChainStep[]): Promise<void>
```

### Execution rules

**Parallel** (same chain_group, chain_type = 'parallel'):
- All bots in the group receive the event simultaneously
- `Promise.all([respondToMessage(ch1), respondToMessage(ch2)])`

**Sequential** (same chain_group, chain_type = 'sequential'):
- Bot at order=0 runs first; wait for its message to be saved
- Then bot at order=1 runs; it can read order=0's response as context
- `for (const step of orderedSteps) { await respondToMessage(step.channelId, ...) }`

**Cross-bot announcement**:
Before each handoff in a sequential chain, post a system message in the receiving channel:
> `"📨 Sam finished their review — Casey, your turn."`

---

## Webhook Handler Update

Replace the current flat `Promise.all(matches.map(...))` in `app/api/webhooks/github/route.ts` with chain-aware execution:

```typescript
// Before (flat):
await Promise.all(matches.map(({ channelId, workspaceId }) => respondToMessage(...)))

// After (chain-aware):
const steps = buildChains(matches)
await executeChain(steps)
```

The router (`lib/github/router.ts`) must be updated to return `ChainStep[]` instead of `RouteMatch[]` — adding the chain fields from `github_triggers`.

---

## Seed Default Chains

Update `lib/templates/triggers.ts` (or `seed.ts`) to seed chain definitions for startup + enterprise templates:

**Startup template chains**:

| Chain | Event | Step 0 | Step 1 | Type |
|---|---|---|---|---|
| `pr-review` | pull_request | #engineering (Sam) | #qa (Casey) | sequential |
| `security-alert` | issues (label: security) | #security (Morgan) | #ops (Riley) | parallel |

**Enterprise template**: same as startup plus:

| Chain | Event | Step 0 | Step 1 | Type |
|---|---|---|---|---|
| `feature-shipped` | release | #engineering (Sam) | #product (Alex) | sequential |

**Blank template**: no chains (founder configures via Riley conversation).

---

## Standup Upgrade (replaces Phase 11 MVP standup)

With chains available, upgrade the standup cron to collect responses:

1. Riley triggers each bot's standup update via sequential chain (chain_group = 'standup')
2. After all bots respond in their own channels, Riley reads each response
3. Riley posts a collected summary in #standup:

```
Good morning ☀️ Here's what the team is up to today:

**Sam** (Engineering): Reviewing the auth PR, then starting on the webhooks refactor.
**Alex** (Product): Finishing the roadmap doc, meeting with founders at 2pm.
**Casey** (QA): Running regression suite on the new release branch.
```

---

## Tests

### `__tests__/lib/workflow-chain/index.test.ts`
- `buildChains()` groups steps by chain_group correctly
- `buildChains()` returns standalone steps (chain_group=null) as single-step chains
- `buildChains()` sorts sequential steps by chain_order
- `executeChain()` runs parallel steps concurrently (both called, not awaited sequentially)
- `executeChain()` runs sequential steps in order (step 1 starts after step 0 resolves)
- `executeChain()` posts handoff announcement before each sequential step after step 0
- `executeChain()` continues remaining steps if one step throws (error logged, not rethrown)

### `__tests__/api/webhooks/github.test.ts` (extend existing)
- PR event with sequential chain → steps executed in order
- PR event with parallel chain → steps executed concurrently
- Mixed chains in same workspace → each chain group executes independently

---

## Definition of Done

- [ ] DB migration run (`chain_order`, `chain_type`, `chain_group` columns)
- [ ] `lib/workflow-chain/index.ts` implemented
- [ ] `lib/github/router.ts` updated to return `ChainStep[]`
- [ ] Webhook handler updated to use `executeChain()`
- [ ] Default chains seeded for startup + enterprise templates
- [ ] Phase 11 standup cron upgraded to use collected summary
- [ ] All tests written and passing
- [ ] `npm run typecheck` passes
- [ ] `npm run test:coverage` passes at existing thresholds
- [ ] PR opened: `feat: phase 12 workflow chains`
