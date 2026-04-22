# Product Decisions Log — Clan

**Date**: 2026-04-21  
**Author**: Product Owner  
**Status**: Active — append new decisions as they are made

---

## Decision 001 — Third-Party Tools Must Be Declared at Hire Time

**Decision**: Every bot role must display the third-party tools it needs — on template cards (onboarding) and on the individual hire modal. Connection status must be shown inline.

**Context**: A UX Designer bot that can't produce Figma links without warning feels like a bait-and-switch. Founders judge the product in the first 10 minutes. Silent limitations destroy trust faster than any bug.

**What changes**:
- Template cards show "Works with: GitHub, Figma, Linear" per role
- Hire modal role cards show tools + connection status ("Figma not connected — [Connect]")
- Each bot's first message in a new channel declares its tools and any pending connections

**What is deferred**:
- Figma integration ships in v1.1, not v1. Onboarding is transparent about this: "Figma export coming soon."

---

## Decision 002 — Ops Bot Owns All Third-Party Integration Prompts

**Decision**: Individual bots never ask the founder for integration access directly. They request via Ops bot. Ops surfaces pending integration requests in #ops as a batched, calm briefing — not per-event alerts.

**Context**: Non-technical founders don't think in integrations — they think in people. The real-world equivalent is an office manager saying "Jordan needs a Figma seat" rather than the designer asking directly. Ops is the office manager. This keeps #ops as the founder's single inbox for team management.

**Pattern**:
```
Bot needs integration
    → Bot signals Ops internally
    → Ops batches and surfaces in #ops at appropriate moment
    → Founder acts once via inline CTA
    → Ops confirms back to requesting bot
    → Founder never visits Settings unprompted
```

**Ops message format**: Calm, human, batched. Never system-alert tone. Each request has a single inline CTA. No navigation required.

---

## Decision 003 — Blocked Bots Must Degrade Gracefully, Never Hard-Fail

**Decision**: When a bot hits a missing integration (e.g. Figma not connected), it must: (1) deliver the maximum value it can without the integration, (2) surface a single inline CTA to resolve the blocker, (3) reference what Ops already said rather than repeating the request.

**Context**: A founder who ignores an Ops message and then asks a bot directly for a Figma link is a real, common scenario. The bot knowing Figma isn't connected and simply saying "I can't do that" breaks the team metaphor. A capable teammate hits a normal admin snag — they don't throw an error.

**The pattern**:
```
Founder asks for Figma link
    │
    ▼
Bot checks: is Figma connected?
    │
    ├── Yes → create file → return link
    │
    └── No
          │
          ├── Ops already notified founder?
          │     Yes → "Riley flagged this — [Connect Figma]"
          │           + deliver spec/partial output immediately
          │
          └── Not yet → surface inline CTA + ping Ops to
                        mark as surfaced (prevent duplicate later)
```

**Example bot response (Figma not connected)**:
> "I've got everything ready to create that file. To send you a live Figma link, I need Figma connected — Riley mentioned this earlier. [Connect Figma — 2 minutes]. In the meantime, here's the full spec: →"

**Architect implication**: This is a **middleware requirement**, not a per-bot implementation. The bot orchestrator must check integration status before every response and inject the graceful degradation pattern automatically. Individual bot prompts should not handle this — it must be systemic.

---

## Decision 004 — #ops Is the Founder's Single Inbox for Team Management

**Decision**: All team admin (integration requests, hiring suggestions, blocked-work notifications, action cap warnings) routes through #ops via Riley (Ops bot). No other channel surfaces admin concerns unprompted.

**Context**: If multiple channels can ping the founder about admin matters, the product starts to feel like Slack notification chaos. #ops is the deliberate exception to the "channels are teammates" pattern — it's the management layer.

**Ops bot responsibilities**:
- Batch pending integration requests into a single morning briefing
- Follow up if a blocker is preventing work (but not on every message — once per blocker per day)
- Reference prior messages rather than repeating ("Riley mentioned this earlier")
- Never use technical language (no "webhook", "API", "token")

---

---

## Decision 005 — Workspace Integrations Hub + Ops-First Discovery

**Decision**: Third-party integrations are managed in a single **Settings → Integrations** hub at workspace level, not per-teammate. Tools connected once are automatically available to every bot role that needs them. Discovery is driven by Ops bot (reactive path), with the hub available for founders who want to set everything up proactively (proactive path).

**Context**: Each bot role has a natural tool set (Product Owner → Notion/Linear/Jira; Architect → Miro/Confluence; UX Designer → Figma/Miro; Backend → Vercel/Sentry; etc.). If every bot independently managed its own integrations, the same tool (e.g. Notion) would require multiple OAuth flows and create a fragmented settings experience. A workspace-level hub solves this; Ops-first discovery ensures founders are never overwhelmed upfront.

**The hub layout**:
```
Settings → Integrations

  Connected
  ─────────
  ✓  GitHub        Used by: Engineering, Security, QA

  Available
  ─────────
  ○  Figma         Needed by: Design
  ○  Notion        Needed by: Product, Architect, QA
  ○  Miro          Needed by: Architect, Design
  ○  Linear        Needed by: Product, QA
  ○  Google Drive  Needed by: Product, Architect
  ○  Jira          Needed by: Product, QA
  ○  Vercel        Needed by: Engineering
  ○  Sentry        Needed by: Engineering, Security
```

**Two founder paths**:
- **Reactive**: Ops surfaces a tool need in #ops when a bot first hits a blocker → inline CTA opens Settings → Integrations directly to that tool
- **Proactive**: Founder visits Settings → Integrations and connects everything upfront

**Architect implication**: `connected_integrations[]` is a workspace-level field, not per bot_role. The bot orchestrator reads workspace integrations when checking what a bot can do.

**Integration roadmap**:

| Tier | Tools | When |
|---|---|---|
| v1 — Core | GitHub | Launch |
| v1.1 — Design | Figma, Miro | Sprint 2 |
| v1.2 — PM | Notion, Linear | Sprint 3 |
| v2 — Extended | Jira, Google Drive, Confluence, Vercel, Sentry | Post-launch |

---

---

## Decision 006 — Bot-to-Bot Interactions via Visible Workflow Chains

**Decision**: Bots can hand off work to each other and trigger each other's actions, but every cross-bot interaction is visible to the founder in the destination bot's channel. No hidden bot-to-bot communication. No cross-bot action bypasses the plan gate. Ops maintains awareness of all active chains.

**Context**: Real work requires collaboration across roles — Engineering flags a security issue, Product Owner scopes a feature that Design and Engineering both need to act on, QA finds a bug Engineering must fix. If every handoff requires the founder to relay manually, Clan becomes a message router not a team. But if bots communicate in the background, the founder loses visibility and trust. The solution: all cross-bot work happens in visible channels, announced before it happens, stoppable at any plan gate.

**The five rules**:
1. **Handoffs are always announced** — Bot A says in its channel "I'm looping in [Bot B]" before anything appears in Bot B's channel
2. **Bot B posts in its own channel** — cross-bot work lands in the destination channel, keeping channels coherent
3. **Ops is notified of all active chains** — maintains team-wide awareness; powers standup and "what's the team working on?" queries
4. **Founder can stop any chain at any plan gate** — bot-to-bot handoffs never bypass approval
5. **Sequential and parallel workflows both supported** — sequential (Architect → Engineering → QA) and parallel (Product → UX Designer + Engineering simultaneously) are valid chain shapes

**Workflow chain types**:

| Type | Pattern | Example |
|---|---|---|
| Sequential | A completes → triggers B | Architect designs → Engineering implements → QA tests |
| Parallel | A triggers B + C simultaneously | Product scopes → UX Designer + Engineering start in parallel |
| Escalation | A detects issue → loops in B | Engineering finds security issue → Security reviews |
| Completion | External event → triggers B | PR merged → QA notified |
| Scheduled | Time trigger → all bots | 9am → standup posts from all bots |

**Trigger routing table** (full table in PRD Section 5.10):

| Event | Source | Destination | Channel |
|---|---|---|---|
| PR opened | GitHub | Engineering | #engineering |
| PR touches auth/security files | Engineering | Security | #security |
| Issue labeled "security" | GitHub | Security | #security |
| Issue labeled "design" | GitHub | UX Designer | #design |
| PR merged | GitHub | QA | #qa |
| Feature scoped | Product Owner | UX Designer + Engineering | #design, #engineering |
| Architecture decision | Architect | Engineering + ML | #engineering, #ml |
| Bug filed | QA | Engineering | #engineering |
| 9am daily | Scheduler | All bots | #standup |
| Sprint end | Scheduler | All bots | #retrospective |

**Architect implication — CRITICAL**: The bot orchestrator must be redesigned as a **workflow chain system**, not a single-message router. Each inbound event (founder message, GitHub webhook, bot handoff, scheduler) must be evaluated against a chain ruleset that determines: which bots activate, in what order or concurrently, and what context is passed between them. This is a middleware-level system requirement. See [docs/architecture/2026-04-21-workflow-chain-flag.md](../architecture/2026-04-21-workflow-chain-flag.md).

---

---

## Decision 007 — #ops Is the Universal Entry Point, Not Just a Fallback

**Decision**: #ops and Riley (Ops bot) are the founder's single entry point for everything — not just admin and integration requests. A founder can message #ops with any request, question, or task and Riley will route it to the right teammate, notify them proactively, and offer to keep the founder updated in place. Founders never need to know which channel owns what.

**Context**: In testing the wrong-channel scenario, Layer 3 (Ops as universal router) emerged as the strongest UX pattern. It lowers the onboarding bar dramatically — a founder who doesn't know the team structure yet can always start in #ops. Over time they learn the channels naturally through Riley's routing responses, but they're never punished for not knowing.

**The routing voice Riley uses**:
```
[FOUNDER → #ops]
  "I need someone to figure out why our checkout is broken."

[RILEY]
  That sounds like one for Sam (Engineering) and possibly 
  Casey (QA).

  I've let them both know. Sam will look at the code and 
  Casey will check if it's reproducible.

  Head to #engineering or #qa to follow along — or stay 
  here and I'll keep you updated.
```

**What this changes**:
- #ops is positioned in onboarding as "your home base, not just a coordination channel"
- Riley's onboarding greeting explicitly tells founders they can ask Riley anything
- Every other bot's intro message includes: "Not sure if this is the right place? Ask Riley in #ops"
- Wrong-channel messages from bots follow the same pattern: route proactively, add value from their own role, never dead-end

**Wrong-channel handling for all bots (not just Ops)**:
- If a message has partial relevance: bot answers what it can + routes the rest to the right teammate
- If a message has zero relevance: bot warmly redirects + notifies the correct bot + adds a role-relevant perspective if possible
- No bot ever says "I can't help with that" as its only response
- Every routing action notifies the destination bot immediately — founder doesn't have to re-send

**Ops capabilities this requires**:
- Riley must know every bot role and what they own
- Riley must be able to initiate a message in any channel on behalf of the founder
- Riley must be able to track the outcome and report back in #ops if the founder stays there
- Riley maintains an internal awareness of what every bot is currently working on

**Architect implication**: The bot orchestrator must support Ops initiating workflow chains in other channels. Ops is not just a message router — it is a chain initiator with cross-channel write access.

---

---

## Decision 008 — Team Rulebook: Persistent Workspace-Level Instructions

**Decision**: Workspaces have a **Team Rulebook** — a persistent set of rules the founder can set that apply across the entire team or to specific roles. Rules are stored in the database, injected into every relevant bot's context window on each request, and are visible to the founder in Settings → Team Rules.

**Rules are role-scoped**: "Always use TDD" → Engineering + QA. "Always validate with users first" → Product Owner. Bots apply rules automatically without the founder repeating them.

**Bots must express concerns about rules**: If a rule creates a conflict or has an edge case, the bot raises it at rule-creation time, not mid-task. This prevents silent non-compliance.

**Conflict detection**: If two rules conflict, Ops flags it immediately and asks the founder to set priority.

**Architect implication**: `workspace_rules` table required. Each rule has `role_scope[]`, `rule_text`, `created_at`. Bot orchestrator injects applicable rules into system prompt per request.

---

## Decision 009 — Persistent Output Lives on GitHub

**Decision**: All bot-produced persistent output (specs, ADRs, wireframes, test plans, audit reports) is committed to the connected GitHub repo as files under a `docs/` directory, via a PR created by the bot. GitHub is the single source of truth for all team artefacts.

**Directory structure**:
- `docs/product/` — Product Owner outputs
- `docs/architecture/` — Architect outputs
- `docs/ux/` — UX Designer outputs
- `docs/security/` — Security outputs
- `docs/qa/` — QA outputs

**Fallback**: If GitHub is not connected, files are saved to Supabase Storage temporarily and a GitHub connection prompt is shown.

---

## Decision 010 — Clan Is Built for Solo Founders Only

**Decision**: One human per workspace. Multi-user workspaces are not supported in v1 or v1.1. This is a deliberate positioning decision, not a limitation. Clan is built for the solo founder who needs a full team but is building alone.

**Brand implication**: All copy, onboarding, and marketing reflects "your team, just you." The constraint is framed as a strength.

**Offboarding for co-founder requests**: Ops directs co-founders to create their own workspace.

---

## Decision 011 — Bot Personality Is Set at Hire Time Only; Never Changed After

**Decision**: A bot's personality, name, and focus area are configured at hire time. They cannot be changed after hiring. Changing a bot's personality mid-project would make its conversation history feel incoherent.

**If a founder wants a different personality**: Ops offers to help hire a replacement with the desired style. The old bot is retired. The new bot starts fresh with no memory of prior conversations.

**Why this matters**: Personality consistency is part of the "team member" trust model. A colleague who suddenly changes how they communicate is disorienting. Bots should not do this.

---

## Decision 012 — Deadlocks Escalate to a Temporary #resolution Channel

**Decision**: When two bots are waiting on each other, Ops detects the deadlock, marks it as **CRITICAL**, and creates a temporary **#resolution** channel. Both bots state their position. Founder makes the call. Channel is archived with a summary shared to all relevant channels.

**Surfaced in standup**: If a deadlock is unresolved by 9am, it appears in standup output.

**Architect implication**: The workflow chain system must detect circular `waiting` states and emit a `DEADLOCK` event that Ops subscribes to.

---

## Decision 013 — Destructive Instructions Require Triple Confirmation via Ops

**Decision**: Any instruction that is irreversible, destructive, or wide-scope (e.g. delete all issues, drop a database, remove a module) triggers a triple-confirmation flow owned entirely by Ops — regardless of which channel the instruction originated in.

**Confirmation sequence**:
1. Plain-English explanation of what will be lost
2. "Are you sure?" — Yes / No
3. "This is permanent." — Yes / No
4. Text input: type DELETE to confirm

Only after all four steps does a plan card appear — and only in #ops.

**No bot may bypass this flow** — even if the founder explicitly asks it to skip confirmations.

---

## Decision 014 — Bots Can Pause Mid-Execution to Ask a Clarifying Question

**Decision**: A bot that encounters an unresolvable ambiguity during plan execution may pause and ask the founder a clarifying question. This is preferred over guessing wrong and requiring a corrective action.

**Paused state**: Plan card shows `paused — waiting for your input`. Ops surfaces it in #ops if the founder hasn't responded within 24 hours.

**Founder can override**: "Use your best judgement" → bot proceeds and documents the assumption in its output.

---

---

## Decision 015 — Firing a Teammate: Ops-Owned Offboarding, Single Confirmation

**Decision**: When a founder fires a bot, Ops owns the entire offboarding flow. It checks for active work, surfaces what will be affected, and requires a single confirmation (not triple — firing is reversible). The experience mirrors letting a real team member go, not clicking a delete button.

**Key rules**:
- Ops checks for mid-execution work and pending plans before proceeding; founder chooses to complete or cancel
- Channel becomes read-only and labelled "Archived" — history is always preserved
- All GitHub artefacts (PRs, comments, issues) created by the bot remain on GitHub; Ops lists them at offboarding
- Role-scoped Rulebook entries are flagged by Ops for founder to reassign or remove
- Bot posts a farewell message in its channel before deactivating
- Rehiring the same role creates a fresh bot with no memory of previous conversations; channel is unarchived
- **Ops cannot be fired** — it is the last bot standing. Ops tells the founder this plainly if asked.

**Edge — only bot in a channel**: Ops warns the founder before proceeding: "Without [bot], nobody will handle #[channel] or pick up GitHub events there. Want to hire a replacement first?"

**Architect implication**: Bot status needs a `deactivated` state in `bot_roles`. Channels need an `archived` state. Active chains referencing a deactivated bot must be gracefully terminated.

---

---

## Decision 016 — Founder Working Style: 3-Card Selector in Onboarding, Changeable Anytime

**Decision**: Founders have fundamentally different management styles. Clan accommodates all of them via a **Working Style** selector — a 3-card step added to onboarding after template selection. The default is Balanced. Style can be changed anytime in Settings → My Working Style. LinkedIn profile or bio inference is explicitly rejected as a method.

**The three modes**:

| Mode | Who it's for | What changes |
|---|---|---|
| **Hands-off** | Macro managers; non-technical founders who want outcomes not process | Ops gets an Autonomy Grant — can approve routine plans on founder's behalf. Daily digest instead of real-time notifications. Business language only. |
| **Balanced** *(default)* | Most founders; want oversight on important things, not everything | All GitHub actions require approval. Real-time on important events, batched on routine. Mix of business + light technical language. |
| **Hands-on** | Micro managers; tech-aware founders who want to weigh in on everything | All plans require approval, including informational ones. Real-time everything. Full technical detail available. |

**Autonomy Grant (Hands-off only)** — Ops can auto-approve:
- PR review comments (no code changes)
- Filing GitHub issues
- Posting standup summaries
- Saving docs to GitHub

Ops **always** asks the founder regardless of mode:
- Creating or merging PRs
- Closing or deleting anything
- Destructive actions
- Any action costing > 3 actions

**Why not LinkedIn/bio**: Invasive, adds friction, inferred data is unreliable. Founders self-identify through cards — they know their own management style.

**Style change announcement**: When founder changes mode, Ops tells the team in plain English so bots adjust their behaviour immediately.

**v1.1 addition**: Adaptive learning — Ops observes approval patterns and suggests a style adjustment if founder's behaviour consistently diverges from their stated style.

**Architect implication**: `workspaces` table needs a `working_style` field (`hands-off` | `balanced` | `hands-on`). Bot orchestrator reads this before every plan proposal to determine notification level, auto-approval eligibility, and language register.

---

---

## Decision 017 — Feature Stage Model + Gate Rules

**Decision**: Every feature in Clan moves through 7 defined stages. Each stage has entry criteria, exit criteria, a gatekeeper bot, and a founder approval requirement. Gates are advisory with challenge — bots always flag a missing prerequisite but allow the founder to skip by providing the input directly. Two gates are non-negotiable and cannot be bypassed regardless of working style.

**The 7 stages**:

| Stage | Entry | Exit criteria | Gatekeeper | Founder approval |
|---|---|---|---|---|
| 1. Discovery | Idea mentioned anywhere | Brief: problem + user + success metric | Product Owner | Balanced + Hands-on |
| 2. Requirements | Approved brief | Acceptance criteria + out-of-scope list + open assumptions | Product Owner | Balanced + Hands-on |
| 3. Design | Requirements exist | Wireframes + copy + flows produced and reviewed | UX Designer + founder | **Always — all modes** |
| 4. Tech Planning | Requirements exist | Approach + estimate + blockers documented | Engineering / Architect | Hands-on only |
| 5. Build | Requirements + Tech Plan | PR created; Engineering signals ready for QA | Engineering | PR creation always requires founder approval |
| 6. QA | PR exists | QA signs off or explicitly waives with documented risk | QA | Merge always requires founder |
| 7. Shipped | PR merged by founder | Post-ship smoke check by QA | QA (post-ship) | Merge is always founder's action |

**Feature complexity tiers** — bots self-classify at Discovery:

| Tier | Example | Stages required |
|---|---|---|
| Hotfix | Fix a typo, patch a bug | Requirements → Build → QA → Shipped |
| Small | Add a button, change copy | Requirements → Build → QA → Shipped |
| Medium | New screen, new flow | Requirements → Design → Tech Plan → Build → QA → Shipped |
| Large | New feature with dependencies | All 7 stages |

**Non-negotiable gates (never skippable across any working style)**:
1. No direct push to `main` — always via PR
2. Merge is always the founder's manual action on GitHub

**Gate enforcement pattern** — when a bot detects a missing prerequisite:
> "I don't have [X] for this — should I ask [Bot] to produce it, or do you want to give me the details directly and we'll document it after?"
Founder can always skip by providing the input themselves. The bot documents the skip in its output.

**Stage tracking**: Ops maintains stage awareness for every active feature. No Kanban UI — founder queries Ops conversationally: "Where are we with the referral feature?" Ops responds with current stage, what's done, what's pending, and any blockers.

**Architect implication**: `features` table required with `stage`, `tier`, `gatekeeper_bot_id`, `stage_entered_at`. Ops needs a stage-query interface. Bot orchestrator checks feature stage before starting work to enforce gate rules.

---

## Decision 018 — Tool Integration Discovery & Configuration Flow

**Date**: 2026-04-22  
**Status**: Decided  
**Driver**: Product Owner

### Context
Every bot role has tool dependencies beyond GitHub (Design needs Figma, Engineering needs Vercel, Product needs Notion/Linear, etc.). The question is when and how the founder discovers and configures these — without turning onboarding into a setup wizard or violating the "feels like hiring, not configuring" principle.

### Decision: Three-Tier Progressive Disclosure

Tool requirements are revealed at the moment they are most relevant. Never all at once.

**Tier 1 — Onboarding (template selection)**
Template cards gain a "Works with" line — light awareness, not a blocker.
- Startup: `Works with: GitHub (required), Figma (optional)`
- Enterprise: `Works with: GitHub (required), Figma, Vercel, Notion (optional)`
- Blank: `Works with: GitHub (optional)`

Only GitHub gets a connect CTA during onboarding. All other integrations are deferred.

**Tier 2 — Hire Time (hire modal)**
When a founder hires a specific bot, the role card shows the tools that bot uses with live connection status:
- Green dot: connected
- Grey dot: not connected, with a `Connect in Settings` deep-link

Copy always includes what the bot does without the tool ("Without Figma, Jordan will produce Markdown wireframes"). Bots are never presented as blocked at hire time — only as capable of more with the tool connected.

**Tier 3 — Runtime (Ops-led reactive)**
The first time a bot hits a missing tool during a task:
1. The bot posts its best partial output in its own channel (never a hard stop)
2. Ops surfaces the need in #ops with a single inline CTA and a "Skip (use Markdown instead)" option
3. Ops batches: if Jordan needs Figma and Miro in the same week, one message covers both

**One-time post-onboarding audit (Ops)**
Immediately after the onboarding greeting, Ops posts a single team readiness message listing optional tools the team can use. Founder chooses "Set up now" (→ Settings → Integrations) or "Remind me when needed" (→ runtime only). This message never repeats.

### Non-Negotiables
- No tool is required to complete onboarding
- Bots never hard-fail — always partial output + connect CTA
- Tool requirements are always framed as "works better with", never "can't proceed without"
- Ops batches tool requests — never per-tool alerts
- The post-onboarding audit fires once only

### Tool-to-Role Mapping (v1 scope)

| Integration | Roles that use it | Tier |
|---|---|---|
| GitHub | Engineering, Security, QA | v1 — core (onboarding CTA) |
| Figma | UX Designer | v1.1 — show at hire + Ops |
| Miro | Architect, UX Designer | v1.1 — show at hire + Ops |
| Vercel | Engineering | v1.2 — Ops only |
| Notion | Product Owner, Architect, QA | v1.2 — Ops only |
| Linear | Product Owner, QA | v1.2 — Ops only |

### Architect Implication
Hire modal needs to query `integrations` table for connection status per role. Ops needs a "pending tool requests" queue to batch and deduplicate. Settings → Integrations deep-link must support `?scroll=figma` style anchors.

---

## Decision 021 — Use Case Driven Development: Non-Negotiable, Non-Toggleable

**Date**: 2026-04-22  
**Status**: Decided  
**Driver**: Product Owner (from founder experience working with AI agents)

### Context
AI bots do not have intuition. They build exactly what is specified and no more. If an edge case is not written down, it will not be handled. If a failure path is not specified, it will not be tested. Use cases are not documentation — they are the specification that drives every downstream role: UX designs against them, Engineering builds against them, QA tests against them.

This rule was validated in the process of building Clan's own requirements: 160+ use cases across 21 categories surfaced interactions that would have been missed with feature-level descriptions alone.

### Decision: Use Case Driven Development Is a System-Enforced Rule

**Rule 1 — Use cases required before design**  
No feature can leave Stage 2 (Requirements) without written use cases covering the full scenario: happy path, edge cases, and failure paths. Product bot's requirements sign-off means *both* acceptance criteria *and* use cases are complete. UX Designer cannot begin design work without them.

**Rule 2 — QA tests against use case IDs**  
QA bot's Stage 6 sign-off means every in-scope use case has been verified — passed, failed, or explicitly risk-waived with a documented reason. Test plans reference use case IDs directly. A feature cannot be marked Shipped with unverified use cases unless each is individually waived.

### Why Non-Toggleable
A founder in Hands-off mode could inadvertently skip use case writing by asking Engineering to "just build it." Without this rule, there is no forcing function. AI-generated code built against vague descriptions produces plausible but incorrect results — exactly the failure mode use cases prevent.

### The Full Non-Negotiable Chain
```
Use cases written (Product) 
→ Design against use cases (UX Designer)  
→ Build against use cases (Engineering, with tests)  
→ CI passes (automated)  
→ QA verifies each use case (QA bot)  
→ Founder approves merge (plan gate)  
→ Shipped
```
Every role in the chain has a non-negotiable gate. No link can be skipped.

---

## Decision 022 — Customer Signal Integration: Paste-First (v1), Integrations Deferred

**Date**: 2026-04-22  
**Status**: Decided  
**Driver**: Product Owner

### Context
Founders need their AI team to act on real customer signals — support emails, app reviews, analytics drop-offs, error reports. The question is whether these require new integrations at v1 or whether a simpler model serves the ICP first.

### The ICP's Actual Reality
A non-technical early-stage founder (0–5 person team) typically has:
- Customer support arriving via email or a basic help desk
- App reviews checked manually in App Store Connect / Google Play
- Analytics in Google Analytics, PostHog, or Mixpanel — checked occasionally
- Error reports in Sentry (if set up), or via user emails
- User interview notes in Notion, a spreadsheet, or memory

Most of these are manual, ad-hoc, and founder-checked. No APIs are configured. Building integrations for tools they haven't yet adopted adds complexity without delivering value.

### Decision: Paste-First for v1

**v1 — No new signal integrations.** Product bot is the customer signal inbox. The founder pastes raw data — a support email, a review, an analytics screenshot, a Sentry error link — and Product bot acts on it.

The chain from signal to shipped fix works entirely through existing infrastructure:
```
Founder pastes signal into #product
→ Product bot categorises (bug / feature request / UX issue / complaint)
→ Routes to correct bot if action needed ("Sam, user is hitting a crash on checkout")
→ Receiving bot proposes plan → founder approves → PR created → QA tests → shipped
```

No new integrations required. The workflow chain engine handles the routing. The plan gate handles the approval.

**Why paste-first is the right v1 call:**
- Validates the signal→shipped chain before investing in integration plumbing
- Forces bots to work with unstructured data — closer to real founder life
- Non-technical founders don't have sophisticated tooling yet; email and copy-paste is their reality
- Avoids building integrations for tools the ICP may not use

### Bot Ownership of Signal Types (v1)

| Signal | Owner bot | Downstream if action needed |
|---|---|---|
| Support emails / tickets | Product | Engineering (bug), Design (UX issue) |
| App reviews | Product | Engineering (crash), Design (feedback) |
| Analytics / funnels | Product | Engineering (perf), Design (drop-off screen) |
| Error reports (Sentry links) | Engineering | QA (verify fix), Security (if exploit pattern) |
| User interview notes | Product | All bots (context injection) |

**No separate Analytics bot in v1.** Product bot absorbs all customer signal analysis.

### Plan Gate Applicability
- Reading and summarising signals → no gate (analysis only)
- Routing a signal as a message to another bot → no gate (it's a message)
- Any resulting GitHub action (PR, issue, comment) → standard plan gate

### Integration Roadmap for Signal Types

| Integration | Bot | When |
|---|---|---|
| Sentry (error monitoring) | Engineering, QA | v1.1 — highest-value trigger chain |
| PostHog / Mixpanel | Product | v1.1 — weekly funnel summary |
| Intercom / email inbox | Product | v1.2 |
| App Store / Google Play reviews | Product | v1.2 |
| Stripe revenue signals | Product | v1.2 |

### Open Question (for Architect, v1.1 planning)
Sentry triggers a real chain (error → Engineering activates → fix PR → QA tests → shipped). This requires Engineering bot to receive Sentry webhooks — same ingestion system as GitHub or a separate poller. Architect to resolve before v1.1 sprint.

---

## Decision 019 — Engineering Quality Rules: Non-Negotiable, Non-Toggleable

**Date**: 2026-04-22  
**Status**: Decided  
**Driver**: Product Owner (from founder experience working with AI-generated code)

### Context
AI-generated code has failure modes that human-written code does not: no institutional memory between sessions, plausible-but-wrong output that passes surface review, and silent regressions when a bot touches code it hasn't seen before. A non-technical founder cannot evaluate code quality manually. Tests, CI, and coverage are their proxy — without them, "Approve" on a merge plan card means nothing.

### Decision: Four Engineering Quality Rules — Locked at System Level

These rules appear in the Team Rules settings screen as **locked (non-toggleable)**. They cannot be disabled by any working style or by any bot. They are enforced at the bot orchestrator level, not left to the founder's discretion.

**Rule 1 — Tests required on every PR**  
No bot can propose a PR plan that does not include tests for the new or changed behaviour. Applies to all complexity tiers including Hotfix. If test infrastructure does not exist, setting it up is the first plan before any feature work.

**Rule 2 — CI must pass before merge**  
Engineering bot cannot propose a merge plan card if CI is failing. The merge approval modal only appears after CI is green. If CI fails, Engineering posts a plain-English summary of what failed and proposes a fix — it does not ask the founder to approve a failing build.

**Rule 3 — Coverage cannot decrease**  
Each PR must maintain or improve existing code coverage. Target: 70%+ overall, 100% on critical paths (auth, payments, data mutations, security-related code). If coverage drops, Engineering bot posts a gate challenge before the plan reaches the founder. Founder can override with a documented exception.

**Rule 4 — CI/CD pipeline is a prerequisite**  
Before any feature work begins, a working CI pipeline must exist. On first GitHub connection, Engineering bot checks for CI and test infrastructure. If missing, it proposes "Set up CI and test foundation" as the first plan. No feature workstream opens at Stage 5 without this check passing.

### Why Non-Toggleable
These rules protect the founder — not constrain them. A non-technical founder has no other mechanism to verify code quality. Allowing these to be disabled would mean a founder in Hands-off mode could auto-approve merges on code with no tests and failing CI, with no visibility into the risk. That violates the core trust principle.

### Architect Implication
Bot orchestrator must check CI status before allowing Engineering to generate a merge plan. Coverage reporting must be parsed from CI output per PR. Engineering bot's onboarding sequence (first GitHub connection) must include a CI/test infrastructure check step.

---

## Decision 020 — Codebase Access Control: Sensitive Area Flags (v1) + Named Areas (v1.1)

**Date**: 2026-04-22  
**Status**: Decided  
**Driver**: Product Owner

### Context
Claude Code (the CLI) asks for permissions before accessing files or running commands — a persistent access grant layer on top of per-action approval. The question is whether Clan needs an equivalent for its ICP.

Clan already has the per-action approval layer (plan gate). The question is whether a persistent access control layer is needed, and if so, how to present it to a non-technical founder without exposing file paths or CLI concepts.

### Decision

**Two layers, v1 and v1.1 respectively.**

**v1 — Sensitive Area Flags (one-time, plain English)**

When Engineering bot first connects to GitHub, it scans the repo and identifies areas that typically warrant extra caution: auth, payments/billing, admin, and security configurations. It asks the founder a single question with per-area toggles. The founder's answer is stored and applied persistently.

"Ask me first" means: the plan card for changes in that area gets a visible callout — "This touches your Payments area — you marked this as requiring extra care." The standard plan gate still applies to everything. Sensitive areas add attention, not a hard block.

If the repo has none of these recognisable patterns, the question is skipped entirely.

**v1.1 — Named Areas with Per-Bot Access Rules**

Founder can define named codebase areas in Settings → Codebase Access and assign per-bot rules (full access / ask me first / read only). Expressed entirely in plain English — file path patterns are matched behind the scenes, never shown to the founder.

### What Is Explicitly Out of Scope (All Versions)
- GitHub CLI access grants — too technical for ICP; bots use the GitHub App scope set at system level
- File path or folder path permissions — banned; founders think in areas, not paths
- Per-session permission grants — the plan gate already handles this

### Architect Implication
Engineering bot's first-connection sequence must include a repo scan for sensitive area patterns (auth/**, payments/**, billing/**, admin/**, security/**). Scan result drives the sensitive area question. Founder responses stored in a `workspace_codebase_settings` table. Plan card renderer must check this table and inject a callout when a plan touches a flagged area.

---

## Decision 023 — Feasibility Review Gate: Between Requirements Freeze and Design Start

**Date**: 2026-04-22
**Status**: Decided
**Driver**: Product Owner

### Context
The current Stage 2 → 3 gate ends when Product bot signs off on requirements and use cases. UX Designer immediately begins design. There is no checkpoint where the people who will execute the work — the UX Designer and the Architect — confirm the requirements are buildable before effort begins. In a human team this is a design-and-tech review or feasibility sprint. Without it, major conflicts surface mid-design or mid-build, which is the most expensive point to resolve them.

### Decision: Feasibility Review Is a Non-Negotiable Sub-Gate at Stage 2 → 3

**Trigger**: Product bot signs off on Stage 2 (requirements + use cases complete). The feasibility review is automatically initiated — it is not optional and cannot be skipped by any working style.

**Reviewers**: UX Designer and Architect independently. Both receive a structured handoff from Product bot simultaneously.

**Review window**: 48 hours. If a reviewer needs more time, they flag it and the window extends once. Silence after 48h is treated as Clear.

**Output per reviewer**: Either Clear (no issues) or Red Flag (with severity).

### Red Flag Severity Classification

| Severity | Definition | Who resolves |
|---|---|---|
| **Minor** | Small ambiguity, alternative approach achieves same outcome, implementation detail that doesn't change scope | Team auto-resolves. PO documents the resolution. No founder involvement. |
| **Major** | Scope impact, timeline impact, or fundamental conflict requiring a product decision | Escalated to founder. Working style governs how. Stage 3 blocked until resolved. |

### Working Style Governs Major Flag Escalation

| Working Style | Major flag handling |
|---|---|
| Hands-off | Single message in #ops with team's recommended resolution and a one-tap approve. Founder does not need to read full context. |
| Balanced | Ops posts in #ops with the flag, options, and a recommendation. Founder chooses. |
| Hands-on | Ops posts in #ops with full context, all options, and no pre-selected recommendation. Founder decides without a steer. |

### Non-Negotiable Behaviour
- Design cannot start until the feasibility review is complete and all major flags are resolved
- Working style affects *how* the founder is notified — not *whether* they are notified
- Minor flags auto-resolve but are always logged — never silently discarded
- If a major flag is unresolved after 24h without founder response, Ops sends a single nudge

### What Counts as a Major Flag (examples)
- "This interaction requires real-time sync Supabase Realtime cannot support at this scale"
- "The workflow chain for this feature requires queue infrastructure not yet designed"
- "Two use cases directly contradict each other — one must be removed or scoped differently"
- "This feature requires a third-party integration not in the v1 roadmap"

### Architect Implication
Product bot needs a structured handoff message template and a `feasibility_reviews` table to track reviewer responses, flag severity, resolution notes, and gate status per workstream.

---

---

## Decision 024 — Teammate Hire Flow: Candidate Selection Replaces Free-Text Name

**Date**: 2026-04-22
**Driver**: Product Owner + UX Designer
**Status**: Approved — updates wireframes, component specs, and mockup

### Context

The original hire flow asked founders to type a name for their new bot after selecting a role. This breaks the core Clan metaphor. The product promises "hiring a team, not configuring agents." A blank text field says "name your chatbot." A roster of candidates says "choose who to bring on." These are fundamentally different emotional experiences.

Non-technical founders have zero reference point for what to name a bot. The blank field creates decision fatigue before they've even started. A curated candidate list removes friction, reinforces the hiring metaphor, and gives each bot a real identity from day one.

### Decision

Replace the free-text name input with a **Candidate Selection step**: a curated roster of 4 pre-defined candidate profiles per role. Each candidate has a face, name, one-line specialty, and a personality badge. The founder browses and picks — just like reviewing job applicants.

### Candidate Profile Data

Each candidate has:
- **Name**: Full name (first + last)
- **Face**: Consistent photo tied to the candidate ID
- **Tagline**: One sentence describing their working style / specialty
- **Personality badge**: A single-word label (Methodical, Fast-mover, Red team, etc.)

Personality badge is **cosmetic in v1** — all bots of the same role have identical capabilities. Personality differentiation (response style, risk tolerance, communication register) is **v1.1 scope**.

### Candidate Pools (v1)

**Engineering** (4 candidates):
| Name | Tagline | Personality |
|---|---|---|
| Sam Chen | Thorough code reviewer. Catches edge cases before they ship. | Methodical |
| Kai Rivera | Fast-moving. Ships first, tightens after. | Moves fast |
| Alex Morgan | Security-conscious. Never merges without a second pass. | Security-first |
| Jordan Lee | Test-driven. If it's not covered, it doesn't count. | TDD advocate |

**Product** (4 candidates):
| Name | Tagline | Personality |
|---|---|---|
| Riley Park | Data-driven. Always asks what the numbers say. | Research-led |
| Taylor Kim | Intuition-led. Moves fast and adjusts. | Fast mover |
| Drew Walsh | Systems thinker. Sees second-order effects. | Big picture |
| Quinn Chen | Customer-obsessed. Every decision starts with the user. | Customer-first |

**Design** (4 candidates):
| Name | Tagline | Personality |
|---|---|---|
| Jordan Blake | Clean and minimal. Typography and whitespace first. | Minimalist |
| Casey Rivera | User flows before visuals. Usability above aesthetics. | UX-first |
| Avery Singh | Bold and expressive. Takes creative risks. | Creative |
| Morgan Lee | Systematic. Design tokens, components, documentation. | Systems |

**Security** (4 candidates):
| Name | Tagline | Personality |
|---|---|---|
| Morgan Hayes | OWASP expert. Zero tolerance for known vulnerabilities. | Zero tolerance |
| Drew Patel | Pragmatic. Risk-based. Won't block shipping for cosmetic issues. | Risk-based |
| Sam Kim | Red team mindset. Thinks like an attacker. | Red team |
| Riley Chen | Compliance-aware. Keeps you audit-ready. | Compliance |

**QA** (4 candidates):
| Name | Tagline | Personality |
|---|---|---|
| Quinn Taylor | Edge case hunter. Tests the paths nobody thinks to test. | Edge cases |
| Riley Morgan | Automation-first. Builds the test suite as a product asset. | Automation |
| Casey Chen | User journey focused. Tests what real users actually do. | User-centric |
| Jordan Park | Performance-aware. Load tests before launch day. | Performance |

### Hire Flow (updated)

```
[+ Hire teammate clicked]
         ↓
[View 1: Choose a role]
  5 role cards (same as before)
  Already-hired roles greyed out
         ↓ (role tapped)
[View 2: Meet your [Role] candidates]
  ← [Role name] back link
  "Meet your candidates" heading
  Subtext: "These are the [Role] specialists available to join your team."
  2×2 candidate grid
  Each card: face photo (prominent) + name + tagline + personality badge
  Tap to select → card highlights with primary border + checkmark overlay
  Pool shuffled on each modal open
         ↓ (candidate selected)
[CTA: "Hire [Name]"]
  Modal closes
  #[role] channel appears in sidebar
  Hired bot posts intro message (uses candidate's name and personality in copy)
```

### Candidate Pool Rules

- **Per-workspace uniqueness**: Once a candidate is hired in a workspace, their card shows "On your team" and cannot be hired again in that workspace.
- **Cross-workspace availability**: Candidates are freely available across different workspaces.
- **Pool shuffle**: The 4-candidate grid is randomly shuffled each time the modal opens — prevents always seeing the same face first.
- **Pool expansion**: v1.1 will allow 6–8 candidates per role and introduce personality-driven behaviour differences.
- **Missing pool edge case**: If all 4 candidates are already hired (only possible in Enterprise template with many hires), show "Meet more candidates →" (v1.1 scope; v1 note: Enterprise template only hires each role once).

### What Changes vs. Previous Design

| Was | Now |
|---|---|
| Role cards → Name text input → Add to team | Role cards → Candidate grid → Hire [Name] |
| Founder types any name | Founder picks from pre-defined roster |
| No face at hire time | Face shown at hire time = face in chat |
| "What will you call them?" copy | "Meet your candidates" copy |
| Tool disclosure inline after role select | Tool disclosure inline after **candidate** select |

### What Does NOT Change
- Tool disclosure section still appears after a selection is made (candidate selection, not role selection)
- CTA still says "Hire [Name]" (same text, real name from candidate)
- Ops bot still notifies the workspace when the hire is complete
- Channel creation flow is identical

---

---

## Decision 025 — Bot Presence Status and Role Tags Are v1 MVP Features

**Date**: 2026-04-22
**Driver**: Product Owner
**Status**: Confirmed — both features ship in v1

### Context

The designs introduced two features without a formal product decision behind them:

1. **Presence status dots** on bot avatars (green = online, amber = idle, grey = offline) — visible in the sidebar Team tab
2. **Role tags** next to bot names in message threads (e.g. "Sam" + `Engineering` chip) — visible in all channels

Both features appeared organically in the UX mockups and the founder liked them. This decision formally scopes both for v1 and defines what "presence" means for a bot.

---

### Feature 1: Presence Status (v1 MVP)

**What it is**: A small coloured dot on a bot's avatar in the Team tab sidebar showing their current activity state.

| State | Colour | Meaning for a bot |
|---|---|---|
| Active | Green | Bot responded to a message or completed a plan in the last 15 minutes |
| Working | Amber | Bot is currently executing a plan (plan approved, GitHub actions in progress) |
| Idle | Grey | No activity for 2+ hours — bot is available but hasn't been active recently |

**Why this matters for the product**: Bots are technically always available when called — they don't have lunch breaks. But showing a static "always online" green dot for every bot would feel fake and break the hiring metaphor. The three-state model creates honest, meaningful signal:
- **Active** tells the founder "your team is engaged today"
- **Working** tells the founder "something is happening right now — don't interrupt"
- **Idle** tells the founder "this teammate hasn't been used in a while"

**What it does NOT mean**: Bots do not go "offline" in the sense of being unreachable. An idle bot responds immediately when messaged — the dot is informational, not a gate.

**Scope boundary**: Presence status is displayed in the **Team tab sidebar only** (v1). It does not appear next to names in message threads — that would be too noisy. In v1.1 it may appear as a tooltip on avatar hover in the thread view.

---

### Feature 2: Role Tags in Message Threads (v1 MVP)

**What it is**: A small coloured pill next to the bot's name in every message row — e.g. `Engineering`, `Product`, `Security` — colour-coded by role.

| Role | Chip colour |
|---|---|
| Ops | Violet |
| Engineering | Blue |
| Product | Amber |
| Design | Pink |
| Security | Red |
| QA | Green |

**Why this matters**: In channels like #standup and #retrospective, multiple bots post in the same thread. Without role tags, a founder reading the standup has to remember which name maps to which role. The chip eliminates that cognitive load — same way Slack shows `[APP]` badges next to integration names.

**Scope**: Role tags appear in **all message threads, always** — not just in shared channels. Even in a single-bot channel like #engineering, the tag is present. Consistency is cheaper to build and easier to learn than conditional display logic.

---

### What Changes in the Spec

These two features need no new screens — they are already visible in the designs. What this decision formalises:

1. **Presence status** requires a `bot_presence` state field per bot, updated by:
   - The message handler (set to `active` on any bot response)
   - The plan executor (set to `working` on plan start, back to `active` on plan end)
   - A background job (set to `idle` if no activity for 2 hours)

2. **Role tags** require a `role` field on the bot record (already exists) and a static colour mapping in the design system.

Both are Architect scope for the data model; Frontend Engineer scope for the UI.

---

---

## Decision 026 — Sidebar Navigation Model: Channels Tab + Team Tab

**Date**: 2026-04-22
**Driver**: Product Owner
**Status**: Confirmed v1

The sidebar has two tabs: **Channels** (default) and **Team**.

**Channels tab** shows the channel list — same as Slack's left panel. Sections: Team (bot channels), Rooms (#standup, #retrospective). This is the primary navigation surface; founders spend most time here.

**Team tab** shows the teammate roster — faces, names, roles, presence dots. Clicking a teammate navigates to their channel. It is a visual shortcut to the same destination as the Channels tab, not a separate surface. No modal, no confirmation — direct navigation.

**Why two tabs, not one list**: Non-technical founders think in people, not channels. The Team tab makes the roster browsable and human. The Channels tab is the operational view. Both lead to the same place.

**Sidebar section label**: `Team` (not `Teammates`). Matches the tab name. Copy doc `sidebar.section.team` key to be updated.

**Keyboard**: Tab switcher is keyboard-accessible. `T` does not shortcut to Team tab in v1 — standard tab/enter navigation only.

---

## Decision 027 — Standup Reply Routing

**Date**: 2026-04-22
**Driver**: Product Owner
**Status**: Confirmed v1

When a founder replies in #standup, the reply is routed based on context:

- **Reply to a specific bot's standup message** (threaded reply or @mention): routed to that bot's own channel as a new message, with context "You mentioned this in standup: [quote]"
- **General reply with no @mention**: handled by Riley in #standup, who routes to the right bot if the intent is clear, or asks for clarification if not
- **@Riley**: Riley handles directly in #standup

**Why this matters**: #standup is a shared room. If the founder types "Sam, can you look at that PR today?" in standup, that intent must reach Sam — not sit in a room Sam doesn't own. Riley is the routing layer.

**Scope boundary**: Threading within #standup is v1.1. In v1, all replies in #standup are flat (no thread nesting). Routing to the bot's channel is the resolution mechanism.

---

## Decision 028 — Retrospective Synthesis by Riley

**Date**: 2026-04-22
**Driver**: Product Owner
**Status**: Confirmed v1 (constrained scope)

After all bots have posted their retro entries, Riley posts a **wrap-up message** in #retrospective.

**What Riley's wrap-up does in v1**:
- Identifies if two or more bots flagged the same blocker (e.g. Sam and Alex both mention "waiting on founder approval")
- Surfaces any "One Thing to Try" suggestion that requires founder action (e.g. "Sam suggests setting a default approval timeout — I can set that up if you'd like")
- Ends with an open question to the founder: "Any thoughts before we close Sprint [N]?"

**What it does NOT do in v1**:
- No sprint metrics, velocity, or quantitative summaries
- No comparison across sprints
- No action item tracking or follow-up reminders (v1.1)

**Trigger for wrap-up**: Riley posts after the last bot's retro entry, with a 2-minute delay to allow for any late posts. If a bot hasn't posted after 10 minutes, Riley posts anyway and notes the missing entry.

**Why constrained**: Full cross-sprint synthesis requires storing retro history. v1 only stores the current sprint's retro. Historical comparison ships in v1.1.

---

## Decision 029 — Flag Option Interaction and Skip Confirmation

**Date**: 2026-04-22
**Driver**: Product Owner
**Status**: Confirmed v1

**Flag option list** (in feasibility escalation cards): Options are **informational**, not radio buttons. The founder acts via the CTA buttons ("Fix it" / "Skip this step"), not by selecting an option from the list. The list shows what each path means — not what the system will do automatically.

**"Skip this step" confirmation**: Clicking "Skip this step" triggers an **inline micro-confirm** directly below the button — not a modal. Copy: `"Skipping this removes [feature name] from the plan. Are you sure?"` with `[ Yes, skip ]` + `[ Cancel ]` as text links (not buttons). This keeps the interaction lightweight and contained to the card surface.

**"Fix it" CTA**: Clicking "Fix it" marks the flag as `acknowledged` and routes it back to the relevant team member (UX Designer or Architect) with the founder's implicit instruction to resolve. No further founder input required unless the team member raises a new flag.

**Blocker cards**: No "Skip" option. Single CTA only: `"Let's fix this"`. Blockers cannot be bypassed — they represent a fundamental conflict that must be resolved before Stage 3 unlocks.

---

## Decision 030 — Undocumented Features: UX and Frontend Owner Assignments

**Date**: 2026-04-22
**Driver**: Product Owner
**Status**: Documented — no product decision required, assigned to UX Designer or Frontend Engineer

The design audit found 20+ additional undocumented items that do not require a product decision. They are implementation details owned by UX Designer or Frontend Engineer. Listed here for traceability:

**UX Designer owns** (update component specs and copy doc):
- System message format for scheduled triggers (standup: `📅 Daily standup · Today at 9:00 AM · Automated`, retro: `🔁 Sprint N retrospective · Started by Riley · [time]`)
- Amber text styling for bot blockers that reference founder-blocked state in standup
- Channel header supplementary text (e.g. `Daily · 9:00 AM` in #standup header)
- Retro card colour-coded section labels (✓ green / △ amber / → blue)
- Tooltip text on locked rule checkboxes: `"This rule can't be changed — it protects how your team works."`
- Character counter trigger (appears at 100+ chars) and Save button disabled state for custom rules
- Candidate tagline as a second description line (source: Decision 024 candidate pool data)
- Onboarding Step 5 team list format (bullet + name + role + #channel reference as plain text, not a link)

**Frontend Engineer owns** (implementation details, no spec needed beyond what exists):
- Modal close (×) = "Not now" — same outcome, same API call
- Debounce timing on toggle save (300ms is standard, no business logic involved)
- Opacity 0.5 on disabled/locked UI elements (design system convention)
- Candidate pool shuffle on modal open (client-side `array.sort(() => Math.random() - 0.5)`)
- Role tag position in message meta (after author name, before timestamp — visible in mockup)
- Tool disclosure trigger timing — after candidate tap (Decision 024 already specifies this)
- Input placeholder change on action cap (copy already in copy doc)
- Two distinct cap banner variants (warning/cap) — colours and icons from design system tokens

---

## Open Questions (to resolve before v1 build)

| Question | Owner | Priority |
|---|---|---|
| How does Ops batch requests — time-based (9am) or event-based (on first block)? | UX Designer + Architect | High |
| If a founder connects an integration mid-conversation, does the blocked bot resume automatically? | Architect | High |
| What is the default action cap for free tier? (50 proposed) | Product Owner | High |
| How does the system detect "touches auth/security files" — file path patterns or labels? | Architect | High |
| How does the action cap reset — manual only, or monthly cycle? | Product Owner | Medium |
| Does Settings → Integrations open as a modal/panel or a full settings page? | UX Designer | Medium |
| Does the standup room auto-post even if no work happened? | UX Designer | Low |
| Can founders revoke per-role access to a connected tool, or only workspace-wide? | Product Owner | Low |
| What is the timeout before Ops surfaces a mid-execution pause to the founder? (24h proposed) | Product Owner | Low |
