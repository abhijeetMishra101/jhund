# Full Vision Gap Analysis — Self-Sustaining AI Team

**Date**: 2026-05-26
**Author**: Product Owner
**Trigger**: Founder demands full vision before guinea pig test. No shortcuts.

---

## The Standard We Are Measuring Against

The full vision is not "bots that answer questions." It is this:

> The founder states a goal. The AI team picks it up, coordinates internally, produces real deliverables, ships code to GitHub, and reports back — without the founder managing each step. The founder's job is to steer and approve, not to supervise.

The guinea pig test makes this concrete: take the fashion pipeline (M1 done, M2–M6 pending), put it inside Jhund, and have the AI team build M2 through M6 with the founder doing as little hand-holding as possible.

Everything below is measured against that standard.

---

## What We Actually Have Today

| Capability | Reality |
|---|---|
| Bots respond in their channel | ✅ Works |
| Bot reads last 20 messages for context | ✅ Works |
| Bot can propose GitHub action (founder approves) | ✅ Works |
| Bot can create PR, issue, commit file, comment | ✅ Works |
| Feature advances through 7-stage pipeline | ✅ Works |
| Dispatch: stage advance → bot receives 🔔 in channel | ✅ Works |
| Bot responds to 🔔 with "I'll get started" | ✅ Works |
| Bot stops there. Nothing actually gets done. | ✅ Also works. |

That last line is the problem. The dispatch system exists. The pipeline exists. The bots exist. But the loop is not closed. The founder still has to manage every step manually.

---

## Gap 1 — Bots Cannot Read the Codebase

**What exists**: Bots can write to GitHub (commit_file, create_pr, create_issue, comment). They cannot read any file from GitHub.

**What the full vision requires**: When the Backend Developer bot picks up M2, it needs to read M1's code before writing a single line. Without read access, it is writing blind. It will invent structure that conflicts with what exists.

**Concrete failure in the guinea pig test**: Backend bot gets dispatched to build M2. It writes an implementation that duplicates M1's data models, uses a different naming convention, and breaks the M1 import chain. The founder discovers this three review cycles later.

**What needs to be built**: A `read_file` GitHub action type in the executor + a `read_github_file` bot tool that lets bots fetch file contents from the connected repo before proposing writes.

**Severity**: P0 blocker. Cannot do the guinea pig test without this.

---

## Gap 2 — No Bot-to-Bot Communication

**What exists**: Bots respond to the founder in their channel. Bots respond to the 🔔 dispatch message in their channel. That is all.

**What the full vision requires**: When the Architect bot completes the ADR for M2 and advances to Stage 5, the Backend Developer bot should receive that ADR as context — not just a "🔔 Stage 5 is starting" notification. When the Backend bot has a question about the data model, it should be able to surface it to the Architect, not just to the founder.

**Concrete failure in the guinea pig test**: The Architect posts a beautiful ADR in #engineering. Stage advances. The Backend bot receives the dispatch message. It has NO idea what the Architect decided. It reads only the last 20 messages in its own channel — the ADR is in a completely different channel it has never seen.

**What needs to be built**: 
- The dispatch handoff message must include a summary of the previous stage's output (not just "Stage 5 is starting")
- Bots need a `read_channel_history` capability to pull context from a specific channel before responding
- OR: a shared artifact store (see Gap 3)

**Severity**: P0 blocker. Without this, every stage transition loses context. The AI team is not a team — it is a collection of isolated bots.

---

## Gap 3 — No Artifact Passing Between Stages

**What exists**: When the Architect "completes" Stage 4, it writes a message in its channel. That message is the deliverable. It is a chat message. It lives in #engineering. Nothing links it to the feature. Nothing makes it accessible to the next stage.

**What the full vision requires**: Each stage produces a concrete artifact committed to GitHub:
- Stage 2 (Requirements): a requirements doc at `docs/features/[feature-name]/requirements.md`
- Stage 3 (Design): wireframes/spec at `docs/features/[feature-name]/design.md`
- Stage 4 (Architecture): ADR at `docs/architecture/[feature-name]-adr.md`
- Stage 5 (Build): code + PR
- Stage 6 (QA): test results doc + sign-off

**Concrete failure in the guinea pig test**: No artifact, no continuity. The backend bot builds whatever it interprets the feature to mean, not what the Architect designed.

**What needs to be built**:
- Convention for feature artifact paths in GitHub
- Dispatch handoff includes the artifact path (e.g. "Architecture ADR is at `docs/architecture/m2-adr.md`")
- Bots instructed by system prompt to write their output to GitHub, not just chat

**Severity**: P0 blocker. Chat messages are ephemeral. Artifacts are not.

---

## Gap 4 — Plan Approval Is Required for Every GitHub Action

**What exists**: Every single GitHub action — including committing a docs file — requires the founder to read a plan and click Approve.

**What the full vision requires**: The founder should not be approving every file commit. They should be approving PRs to main. The approval gate exists to prevent bad code from shipping — not to make the founder a bottleneck on every piece of documentation.

**Concrete failure in the guinea pig test**: M2–M6 = approximately 30–50 GitHub actions (design docs, architecture docs, multiple commits, PRs, issue comments). The founder has to personally approve every single one. This is not "self-sustaining." This is the founder doing the job of a CI/CD system.

**What needs to be built**:
- Auto-approve categories: commits to `docs/`, commits to `bot/` feature branches
- Founder-approve categories: PRs to `main`, force push, anything irreversible
- A setting per workspace: "auto-approve commits to non-main branches"

**Severity**: P0 blocker. Upgraded from P1 by founder decision 2026-05-26. A self-sustaining team that requires the founder to approve every file commit is not self-sustaining. The approval gate must exist at the PR-to-main boundary, not at every intermediate write.

---

## Gap 5 — Bots Have No Workspace-Specific Context

**What exists**: Every bot's system prompt contains the Jhund system prompt + the role's generic instructions (e.g. "You are the Backend Developer"). The system prompt knows nothing about the specific project inside the workspace.

**What the full vision requires**: For the fashion pipeline, every bot needs to know:
- What is the fashion trend pipeline? What does it do?
- What is the tech stack? (Python, what modules, what data sources)
- What has M1 already built? What conventions does it establish?
- What are M2–M6 supposed to do at a high level?

Without this, asking the Backend bot to build M2 is like hiring a developer on their first day, giving them no onboarding, and asking them to ship a feature.

**Concrete failure in the guinea pig test**: Backend bot proposes a Python module using Flask when M1 uses FastAPI. QA bot writes tests using unittest when the codebase uses pytest. Every bot improvises independently.

**What needs to be built**:
- Workspace context field: a free-text "About this project" that gets injected into every bot's system prompt
- OR: a pinned `CONTEXT.md` file in GitHub that bots fetch and prepend to their context window

**Severity**: P0 blocker. This is the difference between a team that knows the project and strangers who just showed up.

---

## Gap 6 — No PR Review Loop

**What exists**: A bot creates a PR. The GitHub webhook is wired up and can receive events. What happens when the founder or another bot leaves a review comment on the PR? Currently: nothing. The webhook receives the event and ignores it.

**What the full vision requires**: When the founder comments "this function needs error handling" on a PR, the Backend Developer bot should receive that review, understand the requested change, commit a fix to the same branch, and reply to the review comment.

**Concrete failure in the guinea pig test**: Bot creates a PR for M2. Founder reviews it and requests three changes. Bot is silent. Founder has to message the bot directly in #engineering and describe the changes again manually.

**What needs to be built**:
- Webhook handling for `pull_request_review` and `pull_request_review_comment` events
- Route to the bot that owns the PR's branch
- Bot responds by reading the comment, the diff, and proposing a fix commit

**Severity**: P1. PRs without a review loop require the founder to manually relay every review comment.

---

## Gap 7 — Autonomous Work Is Still One-Shot, Not Iterative

**What exists**: Bot receives dispatch → posts one response → stops. If the work requires multiple steps (read codebase → design module → write tests → implement → write PR description), the bot cannot chain those steps. It does one thing and waits.

**What the full vision requires**: The Backend bot receives the Stage 5 dispatch for M2. It:
1. Reads the architecture ADR from GitHub
2. Reads M1's relevant modules
3. Writes the M2 implementation (potentially across multiple files)
4. Runs a self-check ("does this conflict with M1?")
5. Commits all files
6. Opens a PR with a full description referencing the ADR
7. Advances the feature to Stage 6
8. Notifies QA

Currently the bot can do step 6 (if asked in one message) or step 7 (if asked). It cannot do the full sequence autonomously.

**What needs to be built**:
- Extended `max_tokens` + multi-turn autonomous loop in `respondToMessage`
- Bot can call multiple tools in sequence within one dispatch
- Potentially: an "agent loop" mode where the bot keeps working until it calls `advance_feature_stage`

**Severity**: P0 blocker for true self-sustaining. P1 for guinea pig test (founder can manually trigger each step).

---

## Gap 8 — Decision Accountability (Phase 19 — Not Built)

**What exists**: A spec document. No code.

**What the full vision requires**: When the Architect decides "M2 will use a vector database for embeddings," that decision is:
- Recorded with the reason
- Linked to the feature
- Accessible to other bots (so Backend doesn't accidentally choose a different DB)
- Visible to the founder in a #decisions channel

**Concrete failure in the guinea pig test**: Three architectural decisions are made in three separate chat threads. The Backend bot contradicts the first decision because it only sees the last 20 messages. The founder has to manually re-explain the constraint.

**Severity**: P1. The guinea pig test is survivable without it but decisions will be lost and the founder will spend time re-explaining things already decided.

---

## Gap 9 — No Long-Term Memory Across Sessions

**What exists**: Bots see the last 20 messages in their channel. Older messages are archived and invisible. Each new session starts with no memory of previous sessions beyond what's in those 20 messages.

**What the full vision requires**: The Backend bot worked on M2 last week. This week it needs to continue M3. It should know what it built, what decisions it made, what the PR URL was, what review comments were addressed.

**Concrete failure in the guinea pig test**: Fashion pipeline is a multi-week project. By the time the bot works on M4, the M2 context is completely gone. The bot will make inconsistent decisions.

**What needs to be built**:
- Summarisation pass: when a feature advances a stage, store a summary of what was decided/built as structured data linked to the feature
- Inject that summary into the bot's context window when working on that feature

**Severity**: P1 for guinea pig test (M2–M6 may fit in a few sessions). P0 for any real multi-week project.

---

## Gap 10 — Infrastructure Gaps (Phase 18 Incomplete)

| Item | Status | Severity |
|---|---|---|
| SMTP / magic link reliability (18-C) | Not built — parked | P0. Login is broken under load. |
| `channel_members` auto-seed for new workspaces (18-D) | Not built | P1. Every new workspace needs manual SQL. |

---

## Summary: What Must Be Built Before the Guinea Pig Test

> **Founder decision 2026-05-26**: All 5 core gaps are P0. Guinea pig gate does not open until all 5 are working end-to-end. No exceptions.

### P0 — Guinea Pig Gate Blockers (all 5 must be done)

| # | Gap | Phase | Estimated |
|---|---|---|---|
| 1 | GitHub code reading — `read_file` bot tool | Phase 20 | 1 session |
| 2 | Bot-to-bot context passing on stage dispatch | Phase 21 | 1 session |
| 3 | Artifact convention — docs committed to GitHub per stage | Phase 21 | 0.5 session |
| 4 | Workspace-specific bot context — `CONTEXT.md` injection | Phase 22 | 0.5 session |
| 5 | Auto-approve non-main commits — remove friction for intermediate writes | Phase 23 | 1 session |
| + | SMTP reliability (18-C) | Phase 18 remaining | 0.5 session (config) |
| + | `channel_members` auto-seed (18-D) | Phase 18 remaining | 0.5 session |

**Total to guinea pig gate**: ~5 sessions

### P1 — Full Vision (after guinea pig gate)

| Gap | Phase | Estimated |
|---|---|---|
| PR review loop (comment → bot responds) | Phase 24 | 1 session |
| Decision accountability / `record_decision` tool | Phase 19 | 1 session |
| Long-term memory (feature summary injection) | Phase 25 | 1 session |

**Total P1 effort**: ~3 sessions

### P2 — Full vision, not needed for guinea pig test

| Gap | Notes |
|---|---|
| Autonomous multi-step work loop | Bots chain 5+ tool calls without pausing |
| Team templates | "Software Startup" = pre-wired channels + roles |
| Codebase indexing / RAG | Semantic search across repo |
| Goal-setting (not task-giving) | "Build M2 by Friday" → bot self-organises |
| Multi-user workspaces | Not just the founder |
| Billing / action tiers | Monetisation |

---

## Revised Distance to Guinea Pig Test

```
Before this analysis (what we thought):   ████████████░  90%

After this analysis (what is true):        ████████░░░░░  60%

The 30% we were missing = Gap 1 + Gap 2 + Gap 3 + Gap 5.
Every one of those is a P0. Without them, the guinea pig
test is the founder playing telephone between isolated bots.
That is not "self-sustaining AI team." That is expensive chat.
```

---

## Phase Sequence to Guinea Pig Gate

```
Phase 18 remaining  SMTP (18-C) + channel_members seed (18-D)      0.5 session
Phase 20            GitHub read access — read_file bot tool          1 session
Phase 21            Artifact dispatch — context + docs per stage     1.5 sessions
Phase 22            Workspace context — CONTEXT.md injection         0.5 session
Phase 23            Auto-approve — non-main commits skip modal       1 session
────────────────────────────────────────────────────────────────────────────────
🦆 Guinea pig gate  Fashion pipeline M2: bot reads → designs →       Manual gate
                    commits → advances → next bot continues
────────────────────────────────────────────────────────────────────────────────
Phase 19            Decision accountability — record_decision tool   1 session
Phase 24            PR review loop                                   1 session
Phase 25            Long-term memory — feature summary injection     1 session
────────────────────────────────────────────────────────────────────────────────
Full vision gate    Founder states goal, team ships it               Ongoing
```

## Use Cases Per Phase (Pre-Phase Gate)

### Phase 18 Remaining

**UC-18C-01** [P0]: Founder clicks magic link and is logged in within 60 seconds  
**UC-18D-01** [P0]: New workspace is created → all hired bots are auto-added to their primary channel without SQL

### Phase 20 — GitHub Read Access

**UC-20-01** [P0]: Bot can read any file from the connected GitHub repo by path  
**UC-20-02** [P0]: Bot reads an existing module before proposing changes — no hallucinated imports  
**UC-20-03** [P0]: Bot surfaces a `read_file` result inline in its response ("I checked `src/m1/collector.py` and found...")  
**UC-20-04** [P1]: Bot gracefully handles file not found (path error, branch mismatch)  
**UC-20-05** [P1]: Bot reads multiple files in one dispatch (e.g. reads M1 module + requirements doc)

### Phase 21 — Artifact Dispatch

**UC-21-01** [P0]: When Stage 4 (Architecture) advances, the dispatch message to Stage 5 (Build) includes the path to the ADR committed in Stage 4  
**UC-21-02** [P0]: Bot at Stage 5 reads the ADR path from the dispatch message, fetches it, and uses it as context  
**UC-21-03** [P0]: Each stage's bot commits its output to a predictable path: `docs/features/[slug]/[stage]-[name].md`  
**UC-21-04** [P0]: Founder can see the artifact path in the pipeline view for each feature stage  
**UC-21-05** [P1]: If a bot's artifact commit fails, dispatch is not sent and founder is notified

### Phase 22 — Workspace Context

**UC-22-01** [P0]: Founder can set a project description in workspace settings ("This is the fashion trend pipeline…")  
**UC-22-02** [P0]: That description is injected into every bot's system prompt on every call  
**UC-22-03** [P0]: Bot responses reference project-specific details, not generic Jhund boilerplate  
**UC-22-04** [P1]: Founder can update the context and all bots reflect it immediately (no re-hire needed)  
**UC-22-05** [P1]: Context is capped at 500 tokens — if longer, truncated with a warning

### Phase 23 — Auto-Approve

**UC-23-01** [P0]: A bot committing to a `bot/*` branch does not show the plan approval modal — it executes immediately  
**UC-23-02** [P0]: A bot opening a PR to `main` ALWAYS shows the plan approval modal — no exceptions  
**UC-23-03** [P0]: A bot creating an issue shows the plan approval modal  
**UC-23-04** [P0]: Founder can see in workspace settings which action types are auto-approved  
**UC-23-05** [P1]: Auto-approved actions still appear in the conversation as a confirmation message ("✅ Committed `docs/features/m2/design.md` to `bot/m2-design`")  
**UC-23-06** [P1]: Founder can disable auto-approve entirely from settings — reverts to requiring approval for everything

**Total to guinea pig gate**: ~4 sessions of engineering
**Total to full vision (P0+P1)**: ~8 sessions of engineering

---

## What This Means for the Founder

The product today is a very good **AI conversation layer** with a **pipeline tracker**. That is genuinely useful and further along than most competitors.

It is not yet a **self-sustaining team**. The gap is not cosmetic. The core loop — bot picks up work, reads context, does the work, passes it to the next bot — does not exist. Every handoff still requires the founder.

Build the P0 phases above and the guinea pig test becomes real. Skip them and the guinea pig test is a demo, not a proof.

---

*Saved: `docs/strategy/2026-05-26-full-vision-gap-analysis.md`*
*Next action: Architect to review Gap 1–3 and propose technical designs for Phases 20–22.*
