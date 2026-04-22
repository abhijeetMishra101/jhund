# Architect Flag — Workflow Chain System Required

**Date**: 2026-04-21  
**From**: Product Owner  
**To**: Architect  
**Priority**: CRITICAL — blocks build start  
**Status**: Requires ADR before implementation

---

## The Problem with the Current Design

The system design in [2026-04-21-system-design.md](./2026-04-21-system-design.md) treats the bot orchestrator as a **single-message router**:

```
Founder message → getBotForChannel() → respondToMessage() → done
```

This model cannot support what the product now requires: **bots triggering other bots**, parallel workflows, completion events, and scheduled chains. The orchestrator needs to be redesigned as a workflow chain engine before a single line of implementation code is written.

---

## What the Product Requires

From Product Decision 006 and PRD Section 5.9–5.10, the following trigger types must be supported:

| Trigger type | Example |
|---|---|
| Founder → Bot | Founder messages Engineering |
| GitHub event → Bot | PR opened → Engineering auto-responds |
| Bot → Bot (escalation) | Engineering detects security issue → Security activates |
| Bot → Bot (parallel) | Product scopes feature → UX Designer + Engineering activate simultaneously |
| Bot → Bot (completion) | PR merged → QA activates |
| Scheduler → All bots | 9am → standup posts |

The current single-message model handles only the first type. The other five are undesigned.

---

## Required Architecture Changes

### 1. Replace `respondToMessage()` with a Chain Evaluator

Every inbound event (message, webhook, handoff, schedule tick) must pass through a **chain evaluator** that asks:

```
Given this event + context, which bots should activate?
In what order (sequential) or simultaneously (parallel)?
What context should be passed to each?
```

The chain evaluator reads from a `workflow_rules` table (or config), not hardcoded logic.

### 2. New Data Model: `workflow_chains`

```sql
workflow_chains (
  id              uuid PK,
  workspace_id    uuid FK → workspaces,
  trigger_type    text,     -- 'github_event' | 'bot_handoff' | 'scheduled' | 'founder_message'
  trigger_payload jsonb,    -- raw event data
  status          text,     -- 'active' | 'paused' | 'completed' | 'stopped'
  initiated_by    text,     -- bot_role_id or 'founder' or 'scheduler'
  created_at      timestamptz
)

workflow_chain_steps (
  id              uuid PK,
  chain_id        uuid FK → workflow_chains,
  bot_role_id     uuid FK → bot_roles,
  channel_id      uuid FK → channels,
  status          text,     -- 'pending' | 'active' | 'waiting_approval' | 'done' | 'stopped'
  message_id      uuid NULL FK → messages,
  plan_id         uuid NULL FK → plans,
  position        int,      -- for sequential ordering
  parallel_group  int NULL, -- steps with same group run simultaneously
  context_passed  jsonb,    -- what the triggering bot passed to this step
  created_at      timestamptz
)

workflow_rules (
  id              uuid PK,
  workspace_id    uuid FK → workspaces,
  trigger_event   text,     -- 'pr.opened' | 'issue.labeled' | 'pr.merged' | 'bot.handoff' | ...
  trigger_filter  jsonb,    -- e.g. { "label": "security" } or { "files_pattern": "auth/**" }
  target_roles    text[],   -- which bot role keys activate
  chain_type      text,     -- 'sequential' | 'parallel'
  is_system_rule  boolean,  -- system rules ship with templates; founder rules are custom
  created_at      timestamptz
)
```

### 3. Ops Awareness Layer

Ops bot must be able to query active chains at any time to answer:
- "What is the team working on right now?"
- "Is anything blocked?"
- "What happened this week?"

This requires Ops to read `workflow_chains` + `workflow_chain_steps` — not just `messages`.

### 4. Chain Pause / Stop

Founders must be able to pause or stop a chain without rejecting every plan individually (OQ-004). The chain evaluator must respect `workflow_chains.status = 'paused'` and halt step activation until resumed.

### 5. Parallel Execution

Steps with the same `parallel_group` must activate concurrently. The chain is only `completed` when all parallel steps resolve. This requires async coordination — a simple sequential queue is not sufficient.

### 6. Security File Detection (OQ-005)

When Engineering bot processes a PR, it must determine whether to escalate to Security. Two options to evaluate:

| Option | How | Tradeoff |
|---|---|---|
| File path patterns | Match PR changed files against config patterns (`auth/**`, `*.key`, `security/**`) | Fast, cheap, misses novel patterns |
| LLM judgement | Engineering bot's Claude call includes a "should security review this?" instruction | Slower, more accurate, uses an action |

Recommend: file path patterns as default (zero action cost); LLM escalation as opt-in.

---

## Questions for the Architect to Resolve (ADR Required)

1. **Queue technology**: The current design uses Vercel Cron + Supabase Edge Functions for async. Is this sufficient for parallel chain execution, or is a proper queue (e.g. Inngest, Trigger.dev) needed?

2. **Chain evaluation timing**: Does the chain evaluator run synchronously in the API route, or is it always async? Synchronous is simpler but blocks the response. Async is correct but adds complexity.

3. **Context passing between steps**: When Engineering hands off to Security, what context is passed? Full thread history? Just the PR diff? A structured summary? This affects Claude context window usage per step.

4. **Cycle prevention**: What prevents an infinite loop if two bots trigger each other? The workflow rules table needs a cycle-detection constraint.

5. **Action cap accounting for chains**: If a chain activates 3 bots and each uses 1 action, does the chain cost 3 actions or 1? Product Owner says 3 (one per bot activation), but this needs confirming before the cap UI is built.

---

## Requested Output from Architect

An **ADR** covering:
- Chosen architecture for the workflow chain engine
- Queue/async technology decision
- Data model confirmation or revision
- Answer to the 5 questions above

This ADR must be written and reviewed before the Backend Developer begins implementation of the bot orchestrator module.

---

## Reference Documents

- [Product Decisions Log — Decision 006](../strategy/2026-04-21-product-decisions.md)
- [PRD — Sections 5.9 and 5.10](../strategy/2026-04-21-prd.md)
- [Current System Design (to be revised)](./2026-04-21-system-design.md)
