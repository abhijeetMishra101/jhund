# Phase 19 — Role Memory & Decision Accountability

**Date**: 2026-05-26
**Author**: Product Owner
**Status**: Spec — awaiting Architect design before engineering begins

---

## The Insight That Drove This Phase

The founder's interaction with the PO and Architect roles in Claude Code *is* the product. Every time the founder had to say "did you update the docs?" or "shouldn't we capture this?" — that is the exact friction their customers will feel in Jhund.

The current roles are **reactive**: they respond well but do not close the loop. A decision made in conversation evaporates unless the founder manually chases documentation and follow-through.

This phase makes roles **accountable**: every decision triggers automatic documentation, every cross-role dependency triggers automatic notification, and no founder should ever have to remind a role to do something that naturally follows from a decision already made.

---

## Problem Statement

### What happens today
```
Founder ──asks──▶ Role ──responds──▶ (conversation ends)
                                           │
                                    Founder manually:
                                    - reminds role to doc it
                                    - asks other roles to follow up
                                    - checks if actions were taken
```

### What should happen
```
Founder ──asks──▶ Role ──responds──▶ Role captures decision
                                           │
                                    Role auto-updates its docs
                                           │
                                    Role triggers downstream roles
                                           │
                                    Role confirms completion
                                    (unprompted)
```

---

## Core Concepts

### 1. Decision Recognition
A **decision** is any output from a role that:
- Scopes work (in/out of a phase)
- Sets a priority or sequence
- Assigns ownership to a role
- Defers something with a documented reason
- Changes an existing plan or doc

Opinions, analysis, and recommendations are **not** decisions until the founder confirms them. The role must distinguish between "here's my thinking" and "we've decided."

### 2. Decision Log
A single append-only record of all decisions across all roles.

**Location**: `docs/decisions/YYYY-MM-DD-decision-log.md` (one file per day)

**Format per entry**:
```
## [TIMESTAMP] [ROLE] — [DECISION TITLE]
**Decided**: [one sentence — what was agreed]
**Triggered by**: [founder message or prior decision]
**Docs updated**: [list of files changed]
**Downstream actions**: [what other roles were notified and why]
**Confirmed by founder**: yes / implicit (no objection) / pending
```

### 3. Role Action Contracts
Each role has a defined set of **"if decision, then action"** rules that execute automatically — without the founder needing to ask.

#### Product Owner Contract
| Decision type | Auto-action |
|--------------|-------------|
| Feature scoped in/out | Update `docs/strategy/` + notify Architect |
| Phase prioritised or deferred | Update phase coverage doc + update Phase 18 plan |
| Use case list finalised | Share with Architect before engineering starts |
| Post-phase gate outcome | Write coverage audit doc + flag gaps to relevant engineer |

#### Architect Contract
| Decision type | Auto-action |
|--------------|-------------|
| Tech decision made | Write ADR in `docs/architecture/` |
| Phase design finalised | Notify Backend + Frontend + Test Engineer |
| Blocker identified | Escalate to PO immediately with options |
| Sequencing changed | Update phase plan + notify affected roles |

#### Backend Developer Contract
| Decision type | Auto-action |
|--------------|-------------|
| Implementation complete | Notify Test Engineer for coverage check |
| Schema change | Write migration + notify Architect |
| API endpoint added | Update `docs/architecture/api-contracts.md` |

#### Test Engineer Contract
| Decision type | Auto-action |
|--------------|-------------|
| Coverage gap found | Notify relevant engineer + block merge |
| New use case untested | Add to gap list + escalate to PO |

### 4. Cross-Role Trigger Chain
```
PO decides phase scope
    └──▶ Architect gets use case list
              └──▶ Backend/Frontend get design doc
                        └──▶ Test Engineer gets use case list for coverage
                                  └──▶ PO gets coverage audit
```

No role waits to be asked. Each role acts on receiving output from the prior role.

---

## Product Implication: This Is Also a Feature

This is not just how we run our development process. **This is what Jhund should do for founders.**

When a founder makes a decision with Riley (ops), Riley should:
1. Post a summary to #ops
2. Notify Sam (#engineering) if it affects the build
3. Notify Alex (#product) if it affects the roadmap
4. Confirm back to the founder: "Done — Sam and Alex have been briefed"

The founder should never have to relay information between their own bots.

**This means Phase 19 has two deliverables:**
1. Fix the development roles (Claude Code slash commands) to follow the accountability contracts
2. Build the same capability into the Jhund product itself (bot-to-bot decision relay)

---

## Use Cases (P0 = must work, P1 = important, P2 = nice to have)

| ID | Use Case | Priority |
|----|----------|----------|
| UC-19-01 | PO makes a scope decision → docs/strategy/ updated in same session without being asked | P0 |
| UC-19-02 | Architect makes a tech decision → ADR written automatically | P0 |
| UC-19-03 | PO decision that affects engineering → Architect is notified in the same session | P0 |
| UC-19-04 | Phase gate outcome → coverage doc written, gaps escalated automatically | P0 |
| UC-19-05 | Founder makes a product decision with a bot → relevant other bots are briefed automatically | P1 |
| UC-19-06 | Decision log is searchable — founder can ask "what did we decide about X?" | P1 |
| UC-19-07 | Decisions have explicit confirmation state (confirmed / implicit / pending) | P2 |
| UC-19-08 | Founder can see a full timeline of decisions across all roles | P2 |

---

## What This Phase Does NOT Include

- Real-time push notifications between roles (that's WebSocket work, separate)
- Autonomous role-to-role conversations without founder awareness (founder stays in the loop)
- Overriding founder decisions (roles propose, founders approve)

---

## Success Metrics

- Zero instances of the founder having to remind a role to update documentation
- Every cross-role dependency is triggered within the same session as the decision
- Decision log is accurate enough that a new team member could reconstruct the full product history from it

---

## Dependencies

- Phase 18 must be complete (product stable) before Phase 19 engineering begins
- Architect to produce technical design for the decision capture mechanism
- Test Engineer to define how "role accountability" is tested

---

## Sequencing

```
Phase 17  ← complete
Phase 18  ← in progress (v1.1 fixes)
Phase 19  ← next (role accountability — this spec)
```

Phase 19 is both a **process fix** (how we run development) and a **product feature** (what founders experience in Jhund). Both must ship together.
