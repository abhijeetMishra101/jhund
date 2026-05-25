# Phase 19 — Role Decision Accountability: Architecture Design

**Date**: 2026-05-26
**Author**: Architect
**Status**: Design — ready for engineering handoff
**Depends on**: Phase 18 complete, product stable

---

## Two Parallel Tracks

Phase 19 has two distinct delivery tracks that share the same underlying concept but different implementation surfaces.

```
Track A: Development Process
  Fix Claude Code slash command roles to self-document
  and trigger cross-role actions automatically

Track B: Product Feature
  Build the same capability into Jhund itself —
  bots relay decisions to other bots without founder prompting
```

Both tracks are designed here. Track A is simpler and can ship first.

---

## Track A: Development Role Accountability

### Current Architecture
Slash command roles (`/role-product-owner`, `/role-architect`, etc.) are stateless prompt templates. They respond to input and stop. No persistent memory, no automatic follow-through.

### Target Architecture

Each role gains two new behaviours:

**1. Decision Detection**
At the end of every role response, the role evaluates:
> "Did this session produce a decision (not just analysis)?"

If yes → write to decision log + update owned docs + trigger downstream.

**2. Owned Document Map**
Each role has a declared set of documents it owns and must keep current:

```
/role-product-owner owns:
  docs/strategy/YYYY-MM-DD-*.md
  docs/decisions/ (all entries tagged [PO])

/role-architect owns:
  docs/architecture/YYYY-MM-DD-*.md
  docs/decisions/ (all entries tagged [ARCH])

/role-backend-developer owns:
  docs/architecture/api-contracts.md (API section)
  docs/decisions/ (entries tagged [BE])

/role-test-engineer owns:
  docs/strategy/YYYY-MM-DD-phase-N-coverage.md
  docs/decisions/ (entries tagged [TEST])
```

### Decision Log Schema

**File**: `docs/decisions/YYYY-MM-DD-decisions.md`
One file per day, append-only.

```markdown
## HH:MM [ROLE] — Decision Title

**Decided**: One sentence summary of the decision.
**Context**: What prompted this decision.
**Docs updated**:
- docs/strategy/... (what changed)
- docs/architecture/... (what changed)
**Downstream triggers**:
- [ ] Architect notified: [reason]
- [ ] Backend notified: [reason]
**Confirmed**: yes / implicit / pending
```

### Role Skill Updates Required

Each role's skill file (`projectSettings:role-*`) gains a mandatory closing section:

```markdown
## Closing Protocol (MANDATORY — runs after every response)

1. **Decision check**: Did this session produce a decision?
   - If no → state clearly "No decision made this session"
   - If yes → proceed to steps 2-4

2. **Update owned docs**: Write or update the relevant doc in docs/strategy/ or
   docs/architecture/. Do not wait to be asked.

3. **Append to decision log**: Add entry to docs/decisions/YYYY-MM-DD-decisions.md

4. **Trigger downstream**: Identify which other roles are affected and state
   explicitly what they need to do next. If in the same session, invoke them.
```

### Implementation Steps (Track A)

1. Create `docs/decisions/` directory with a README
2. Update each role skill file to add the Closing Protocol section
3. Write a `docs/decisions/2026-05-26-decisions.md` bootstrapping all decisions made to date (retroactive log)
4. Test: run a role session, confirm doc updates happen without prompting

---

## Track B: Jhund Product Feature — Bot Decision Relay

### Problem
When a founder makes a decision with one bot, other bots that should know about it don't — unless the founder manually relays it. This creates information silos between bots in the same workspace.

### Design: Decision Relay System

#### New DB table: `decision_events`
```sql
CREATE TABLE decision_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_channel_id uuid NOT NULL REFERENCES channels(id),
  decided_by  text NOT NULL,  -- bot role_key that surfaced the decision
  summary     text NOT NULL,  -- one-sentence decision summary
  affected_roles text[],      -- role_keys that should be notified
  notified_at timestamptz,    -- when downstream bots were briefed
  created_at  timestamptz DEFAULT now()
);
```

#### New bot tool: `record_decision`
```typescript
{
  name: 'record_decision',
  description: 'Record a decision made in this conversation and notify relevant teammates.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One sentence: what was decided' },
      affected_roles: {
        type: 'array',
        items: { type: 'string' },
        description: 'role_keys of bots who need to know about this decision'
      },
      notify_now: { type: 'boolean', description: 'Post to affected channels immediately' }
    },
    required: ['summary', 'affected_roles']
  }
}
```

#### Decision relay flow
```
1. Founder makes decision with Alex (#product)
2. Alex calls record_decision({
     summary: "Dark Mode deferred to v1.2",
     affected_roles: ["backend", "design"],
     notify_now: true
   })
3. System inserts decision_events row
4. If notify_now:
   - POST to #engineering: "📋 Decision from #product: Dark Mode deferred to v1.2"
   - POST to #design: "📋 Decision from #product: Dark Mode deferred to v1.2"
   - respondToMessage() called for each channel — bots acknowledge and adjust
5. Alex confirms to founder: "Done — Sam and Jordan have been briefed."
```

#### Decision channel: #decisions
A new system channel `#decisions` receives every `decision_events` row as a message. This gives the founder a single feed of all decisions across all bots — searchable, chronological.

```
#decisions
──────────────────────────────────
📋 [Alex → Sam, Jordan]
   Dark Mode deferred to v1.2.
   Engineering and Design have been briefed.

📋 [Riley → Alex]
   New workspace template "Agency" approved.
   Alex to add roles to backlog.

📋 [Sam → Casey]
   PR #71 merged. QA sign-off needed on ThreadPanel.
   Casey has been notified.
```

### New API Endpoints

```
POST /api/decisions
Body: { summary, affected_roles, notify_now, source_channel_id }
- Inserts decision_events row
- If notify_now: calls postHandoffMessage + respondToMessage for each affected channel
- Returns: { decision_id, notified_channels[] }

GET /api/decisions?workspace_id=X
- Returns all decisions for workspace, newest first
- Used by #decisions channel view and future search
```

### System Prompt Update for All Bots

Add to every bot's system prompt:

```
When a decision is made in this conversation — not just discussed, but decided —
call the record_decision tool. A decision is: something scoped in or out,
a priority set, an owner assigned, or a plan changed.

After calling the tool, confirm to the founder:
"[Summary of decision]. I've briefed [names of notified teammates]."

Do not wait to be asked to document or relay a decision.
```

---

## Module Boundaries

```
lib/decisions/
  index.ts          — recordDecision(), getDecisions(), notifyAffectedChannels()
  types.ts          — DecisionEvent, DecisionRelayResult

app/api/decisions/
  route.ts          — POST + GET handlers

lib/bots/
  tools.ts          — add RECORD_DECISION_TOOL alongside existing tools
  index.ts          — handle record_decision tool use in respondToMessage()

app/w/[slug]/components/
  DecisionsPanel.tsx — #decisions channel view (future — Phase 19B)
```

---

## DB Migration

**File**: `supabase/migrations/007_decision_events.sql`

```sql
CREATE TABLE decision_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  decided_by       text NOT NULL,
  summary          text NOT NULL,
  affected_roles   text[] NOT NULL DEFAULT '{}',
  notified_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX decision_events_workspace_idx ON decision_events(workspace_id, created_at DESC);
```

---

## Sequencing Within Phase 19

```
Week 1: Track A (process fix — no product risk)
  - Add Closing Protocol to all role skills
  - Create docs/decisions/ directory + retroactive log
  - Test: run PO + Architect sessions, confirm self-documentation

Week 2: Track B, Part 1 (product feature)
  - Migration 007
  - lib/decisions/ module
  - RECORD_DECISION_TOOL
  - respondToMessage() handler
  - POST /api/decisions

Week 3: Track B, Part 2
  - GET /api/decisions
  - #decisions system channel seeded at workspace creation
  - Messages posted to #decisions from decision_events
  - System prompt updates for all bot roles

Week 4: Integration + smoke test
  - End-to-end: founder decision → bots briefed → #decisions shows entry
  - Test Engineer coverage audit
  - PO phase gate
```

---

## Roles Needed

| Role | Task |
|------|------|
| ML / Agent Engineer | RECORD_DECISION_TOOL + system prompt updates + respondToMessage handler |
| Backend Developer | Migration 007 + lib/decisions/ + API routes |
| Frontend Engineer | #decisions channel view (Phase 19B, can defer) |
| Test Engineer | Use case coverage for all UC-19-* items |
| Product Owner | Phase gate — use case list + post-phase coverage audit |

---

## Definition of Done

- [ ] Track A: PO and Architect roles self-document every decision without prompting
- [ ] Track A: Decision log exists and is accurate
- [ ] Track B: `record_decision` tool available to all bots
- [ ] Track B: Affected bots receive relay message and auto-respond
- [ ] Track B: #decisions channel shows full decision history
- [ ] Track B: Founder sees confirmation "I've briefed [names]" after every decision
- [ ] Migration 007 applied to production
- [ ] All UC-19-* use cases covered by tests or manual smoke test
- [ ] CI green, coverage thresholds maintained
