# Execution Plan — Clan MVP

**Date**: 2026-04-22  
**Author**: Architect  
**Audience**: All roles + Founder  
**Status**: Approved for execution  

---

## How to Read This Document

Each **Phase** is a self-contained build session. Phases run sequentially. At the end of each phase there is an **Approval Gate** — a moment where you (the founder) review output and explicitly say "continue." Nothing in the next phase starts until the gate is cleared.

**You will be poked at:** pre-flight setup, end-of-phase gates, and any mid-session blocker that only a human can unblock (credentials, GitHub App install, test repo access).

**Estimated total**: 10–14 days of Claude Code sessions. You are present for ~2–4 hours total across all gates. The rest is execution.

---

## Pre-Flight — What You Must Do Before Session 1

These are the only actions that require your human hands. Do them once, in order. Claude Code cannot proceed without them.

| # | Action | Where | Output needed |
|---|---|---|---|
| PF-1 | Create a **Supabase project** (free tier) | supabase.com | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| PF-2 | Get an **Anthropic API key** | console.anthropic.com | `ANTHROPIC_API_KEY` |
| PF-3 | Register a **GitHub App** on your account | github.com/settings/apps | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` |
| PF-4 | Create a **Vercel project** linked to the Clan repo | vercel.com | `VERCEL_PROJECT_URL` |
| PF-5 | Add all secrets to Vercel Environment Variables | Vercel dashboard | — |
| PF-6 | Create a **test GitHub repo** (`clan-test-app`) | github.com | Repo URL for webhook testing |

**GitHub App permissions required (minimum scope):**
- Repository: `Contents: Read`, `Pull requests: Write`, `Issues: Read`
- Webhooks: `pull_request`, `issues`, `push`

**⛔ Gate PF**: Share all env var keys in the session before Phase 1 begins. Session 1 will not write a line of code until `.env.local` is confirmed populated.

---

## Architecture Decision: Workflow Chain Engine (ADR-004)

Before code starts, this pre-existing flag must be resolved.

**Problem** (`workflow-chain-flag.md`): The current system design treats the bot orchestrator as a single-message router. The product requires bot→bot handoffs, parallel activations, completion triggers, and scheduled chains. Retrofitting this after Phase 3 would require a full rewrite.

**Decision**: Build the workflow chain engine **from Phase 3 onwards** — not as a retrofit. The `workflow_chains` table and chain evaluator are implemented in Phase 3 alongside the first bot, not added later.

**Chain evaluator rule**: Every inbound event (founder message, webhook, scheduler tick, bot handoff) passes through a single `evaluateChain(event, workspaceId)` function that returns `{ bots: BotActivation[], mode: 'sequential' | 'parallel' }`. No bot activates outside this path.

This adds ~1 session to Phase 3 but prevents a 3-session rewrite in Phase 5.

**ADR-004 status**: Resolved. Workflow chain engine is a Phase 3 deliverable, not deferred.

---

## Phase Overview

```
Phase 0 — Repo & Project Shell         Session 1       ~4 hours
Phase 1 — Database & Auth              Session 2       ~4 hours
Phase 2 — Onboarding Flow              Sessions 3–4    ~6 hours
Phase 3 — Workspace + Bot Core         Sessions 5–6    ~8 hours
Phase 4 — Plan Gate                    Session 7       ~5 hours
Phase 5 — GitHub Integration           Sessions 8–9    ~6 hours
Phase 6 — Full Team + Rooms            Sessions 10–11  ~6 hours
Phase 7 — Hire, Settings, Ops Bot      Session 12      ~5 hours
Phase 8 — Security + Tests             Session 13      ~4 hours
Phase 9 — UX Polish + Deploy           Session 14      ~4 hours
```

---

## Phase 0 — Repo & Project Shell

**Role**: Architect + Backend Developer  
**Goal**: Working Next.js project with all tooling configured, deployable to Vercel with a health check.

### Deliverables

- [ ] `npx create-next-app@latest clan --typescript --tailwind --app` scaffolded
- [ ] ESLint + Prettier configured
- [ ] `shadcn/ui` initialised; `button`, `input`, `dialog`, `badge`, `separator`, `avatar` installed
- [ ] Supabase JS client configured (`lib/supabase/client.ts`, `lib/supabase/server.ts`)
- [ ] Anthropic SDK installed (`@anthropic-ai/sdk`)
- [ ] Octokit installed (`@octokit/rest`)
- [ ] `.env.local.example` with all required keys documented
- [ ] `/api/health` route returns `{ status: 'ok', timestamp }` — used by CI
- [ ] Vercel deployment succeeds from `main`
- [ ] GitHub Actions CI: `lint → typecheck → build` on every PR

### Module stubs (empty files with typed interfaces, no implementation)

```
lib/
  auth/index.ts
  channels/index.ts
  bots/orchestrator.ts
  bots/chain-evaluator.ts
  plan-gate/index.ts
  github/index.ts
  templates/index.ts
```

### ⛔ Gate 0 — Founder reviews

- Vercel preview URL loads (even if it's a blank page)
- CI is green on the initial commit
- You confirm `.env.local` has all 6 pre-flight secrets populated

---

## Phase 1 — Database & Auth

**Role**: Backend Developer  
**Goal**: All tables created, RLS enabled, magic-link sign-in working end-to-end.

### Deliverables

**Supabase migrations** (in `supabase/migrations/`):

```
001_workspaces.sql        — workspaces, users
002_channels.sql          — channels
003_messages.sql          — messages (with indexes on channel_id + created_at)
004_bot_roles.sql         — bot_roles
005_plans.sql             — plans (state machine constraint: CHECK status IN (...))
006_github.sql            — github_installations, github_triggers
007_workflow_chains.sql   — workflow_chains, workflow_steps (ADR-004)
008_rls.sql               — Row Level Security policies (workspace isolation)
```

**RLS policy rule**: Every table with `workspace_id` must have a policy that restricts reads/writes to `auth.uid()` matching the workspace owner. No exceptions.

**Auth flow** (`app/(auth)/`):

- `/auth` — email input + magic link send
- `/auth/callback` — Supabase redirect handler → redirects to `/onboarding` or `/[workspace]`
- `middleware.ts` — protects `/[workspace]/**`; unauthenticated → `/auth`

**Verified behaviours**:
- Magic link email delivers within 10 seconds (Supabase default SMTP is fine for dev)
- Expired link shows friendly re-send page (no error codes)
- Session persists across page refreshes (Supabase auto-refresh — resolves OQ-010)
- Navigating to a protected route unauthenticated redirects cleanly

### Open question resolved

**OQ-010** (Supabase session auto-refresh): Supabase JS v2 uses `detectSessionInUrl` + automatic PKCE refresh. No custom refresh logic needed. `createServerClient` in middleware handles server-side session propagation. **Resolved.**

### ⛔ Gate 1 — Founder reviews

- Sign up with your real email, receive magic link, confirm it works
- Session persists on page refresh
- You can see the database tables in Supabase dashboard

---

## Phase 2 — Onboarding Flow

**Role**: Frontend Engineer + Backend Developer  
**Goal**: Complete 5-step onboarding that seeds a workspace and routes to the main app.

### Steps

| Step | Route | Component | API call |
|---|---|---|---|
| 1 | `/onboarding/start` | Company name input | — |
| 2 | `/onboarding/template` | Template picker (3 cards) | — |
| 3 | `/onboarding/style` | Working style (3 cards) | — |
| 4 | `/onboarding/github` | GitHub App install + skip | `/api/github/install` |
| 5 | `/onboarding/meet-team` | Riley's greeting + CTA | `POST /api/workspace/setup` |

**`POST /api/workspace/setup`** creates:
1. `workspaces` row
2. All channels for the selected template
3. All `bot_roles` rows with system prompts from `lib/templates/`
4. Seeds Riley's intro message into the `messages` table for #ops
5. Seeds default `github_triggers` for the template

**Design system adherence**:
- Progress dots: 5 steps, correct filled/empty state per step
- Inter font loaded, all colour tokens from design-system.md applied via `tailwind.config.ts`
- All copy from `docs/ux/2026-04-21-copy-doc.md` — no ad-hoc strings
- No technical language in any founder-facing string

**Skip GitHub**: If skipped, `workspaces.github_installation_id` stays null. Ops bot surfaces the connection prompt in #ops after onboarding (implemented in Phase 7).

### ⛔ Gate 2 — Founder reviews

- Walk through the full 5-step flow yourself
- Confirm workspace appears in Supabase with correct channels and bot_roles seeded
- Confirm Riley's intro message is in the database
- Confirm skipping GitHub doesn't break anything

---

## Phase 3 — Workspace Shell + Bot Core

**Role**: Frontend Engineer + ML/Agent Engineer + Backend Developer  
**Goal**: Full workspace layout live. Riley responds to messages. Workflow chain engine in place.

### 3a — Frontend Shell

- Sidebar: Channels tab + Team tab, unread badges, action counter in top bar
- Channel view: message thread (virtualized scroll), message input (Enter sends, Shift+Enter newline)
- Real-time: `subscribeToChannel(channelId)` via Supabase Realtime — new messages appear without refresh
- Bot typing indicator: 3-dot pulse appears within 500ms; disappears on first chunk
- Streaming: SSE from `/api/bots/stream` renders text progressively
- Action counter: amber at 80%, red + lock icon at 100%; tooltip on click
- Empty state: first-time channel view shows Riley's seeded intro message

**OQ-007 resolved here**: Settings → Integrations opens as a **slide-over panel** (not full page navigation), preserving workspace context. UX Designer confirmed acceptable; no new wireframe needed.

### 3b — Bot Orchestrator + Chain Evaluator (ADR-004)

**Chain Evaluator** (`lib/bots/chain-evaluator.ts`):

```typescript
interface ChainEvent {
  type: 'founder_message' | 'github_event' | 'bot_handoff' | 'scheduled'
  workspaceId: string
  channelId: string
  payload: Record<string, unknown>
}

interface BotActivation {
  botRoleId: string
  channelId: string
  context: string
}

interface ChainResult {
  activations: BotActivation[]
  mode: 'sequential' | 'parallel'
  chainId: string   // workflow_chains row
}

function evaluateChain(event: ChainEvent): Promise<ChainResult>
```

Every bot response goes through `evaluateChain`. No bot activates outside this path. This is the single most important architectural constraint in the build.

**Bot Orchestrator** (`lib/bots/orchestrator.ts`):

- Reads `bot_roles.system_prompt` for the activated bot
- Builds context window: last 20 messages + summarised older history (summary via Claude with a cheap `haiku-4-5` call)
- Calls `claude-sonnet-4-6` with streaming
- Writes response to `messages` table
- If response contains GitHub intent, hands off to Plan Gate (Phase 4)

**Action cap enforcement**: `checkActionCap()` runs before every orchestrator entry. Cap exceeded → post system message "Questions still work — reset to unlock more actions" — input stays enabled.

**System prompts** for all 7 bot roles written by ML/Agent Engineer, stored in `lib/templates/system-prompts.ts`. Key constraints per role:
- No technical language in any founder-facing output
- Every response must contain something of value (no pure redirects)
- Wrong-channel routing must offer partial value + route, never refuse
- Riley always ends routing messages with the `#ops` fallback line

**OQ-008 resolved here**: Standup auto-posts even when no work happened. Bots post a brief "Nothing new from me today" message rather than silence. Silence is worse UX than a brief check-in. **Resolved.**

### ⛔ Gate 3 — Founder reviews

- Open the workspace. Send a message to Riley in #ops. Get a response.
- Open #engineering. Send a message to Sam. Confirm typing indicator + streaming.
- Watch the action counter increment.
- Hit the action cap manually (or lower it to 3 in Supabase) — confirm input stays enabled, questions still work.
- Real-time: open two browser tabs, send message in one, confirm it appears in the other instantly.

---

## Phase 4 — Plan Gate

**Role**: Backend Developer + Frontend Engineer  
**Goal**: Plan card appears in message thread, approval modal works, plan executes (or fails gracefully). This is the core trust moment — get it right.

### Backend

- `POST /api/bots/approve` — sets `plans.status = 'approved'`, enqueues execution
- `POST /api/bots/reject` — sets `plans.status = 'rejected'`, posts bot acknowledgement
- `executePlan(planId)` — runs `plans.github_actions[]` sequentially via GitHub module (stub in Phase 4; real GitHub calls in Phase 5)
- State machine enforced at DB level: `CHECK (status IN ('pending','approved','rejected','executed','failed'))`
- **Non-negotiable**: `executePlan` checks `status = 'approved'` before touching anything — even if called directly

### Frontend

- Plan card component: rendered inline in message thread when `messages.plan_id` is set
- "Plan N of N" label when multiple plans pending in same channel
- Approve button → opens confirmation modal
- Modal shows: bot name, plain-English action list, action cost, "X used of Y this month"
- Loading state on plan card while executing
- Success state: `✓ Sam reviewed PR #42 · just now`
- Failure state: fail card with plain-English explanation (no stack traces)
- "Not now" dismisses without confirm

**Jargon check** (automated test): A test in `__tests__/plan-gate/jargon.test.ts` that asserts no banned word (`webhook`, `branch`, `API`, `token`, `model`, `agent`, `endpoint`, `SDK`) appears in any plan card string. This test runs in CI on every PR.

### ⛔ Gate 4 — Founder reviews

- Ask Sam to "review a PR" — confirm plan card appears with plain-English description
- Open the approval modal — read every word. If anything is jargon or unclear, flag it here.
- Approve the plan (it will stub out since GitHub isn't wired yet) — confirm success state
- Reject a plan — confirm bot acknowledges gracefully
- Confirm the jargon test passes in CI

---

## Phase 5 — GitHub Integration

**Role**: Backend Developer  
**Goal**: Webhook events land in the right channel. Sam can create a real PR on the test repo.

### Webhook Receiver (`/api/github/webhook`)

- Validates `X-Hub-Signature-256` HMAC — 401 on failure (no logging of payload on failure)
- Parses event type + action
- Calls `github.getTriggerRules(workspaceId)` — matches event to channel + bot
- Calls `channels.postMessage(system)` — system message appears in channel
- Hands off to chain evaluator → bot auto-responds

### Outbound Actions (`lib/github/index.ts`)

- `createPR(workspaceId, title, body, branchName)` — creates PR from bot branch; base is always `main`
- `postPRComment(workspaceId, prNumber, body)` — bot comments on PR
- `listOpenPRs(workspaceId)` — returns open PRs for bot context window

**Hard constraint enforced in code**: `createPR` is the **only** write function exported from `lib/github/`. There is no `pushCommit`, `mergePR`, `deleteBranch`. If a future engineer adds one, the Security Reviewer test suite catches it.

### Default Trigger Rules (seeded at workspace creation)

| Event | Filter | Channel | Bot |
|---|---|---|---|
| `pull_request.opened` | — | #engineering | backend |
| `pull_request.merged` | — | #qa (if exists) | qa |
| `issues.labeled` | `label=security` | #security (if exists) | security |
| `issues.labeled` | `label=design` | #design | ux-designer |

### ⛔ Gate 5 — Founder reviews

- Install the GitHub App on `clan-test-app` repo
- Open a PR on `clan-test-app` — confirm system message appears in #engineering within 5 seconds
- Sam auto-responds with a plan card
- Approve Sam's plan — confirm a real PR comment is posted on GitHub
- Check GitHub — confirm **no direct commits to `main`** were made

---

## Phase 6 — Full Team + Rooms

**Role**: ML/Agent Engineer + Backend Developer + Frontend Engineer  
**Goal**: All 7 bot roles responding correctly. #standup and #retrospective auto-post.

### All Bot Roles

System prompts written and tested for all 7 roles. Each prompt must:
- Pass the jargon test
- Handle wrong-channel gracefully (partial value + route + #ops fallback)
- Know its own channel, name, and tools

### Bot → Bot Workflow Chains

Chain evaluator rules for the five non-founder trigger types:

| Trigger | Rule | Mode |
|---|---|---|
| PR touches auth files | Engineering → Security | Sequential |
| Product scopes feature | Product → UX + Engineering | Parallel |
| PR merged | GitHub → QA | Sequential |
| Bug filed by QA | QA → Engineering | Sequential |

Each chain creates a `workflow_chains` row. Each step creates a `workflow_steps` row. The plan gate still fires for every GitHub action within a chain — chains do not bypass it.

### #standup (Vercel Cron)

- Cron job: `0 9 * * *` (9am UTC, configurable per workspace timezone in v1.1)
- Calls `POST /api/rooms/standup` — triggers all active bots to post Yesterday/Today/Blockers
- If no work happened: bot posts "Nothing new from me today — ask if you need anything"
- Founder can reply to any standup post to start a conversation

### #retrospective (Vercel Cron)

- Cron job: every 14 days from workspace creation date
- Riley synthesises cross-team patterns from the past sprint (constrained v1 scope: summarises standup posts, not full message history)
- Each bot posts its own retro summary

### ⛔ Gate 6 — Founder reviews

- Message each of the 7 bots. Each should respond in character, with no jargon.
- Send a wrong-channel message (e.g., ask Sam a design question) — confirm routing + partial value.
- Trigger standup manually (`POST /api/rooms/standup` via curl) — confirm all bots post.
- Trigger a bot→bot chain manually — confirm the destination channel lights up.

---

## Phase 7 — Hire Teammate, Settings, Ops Bot

**Role**: Frontend Engineer + ML/Agent Engineer  
**Goal**: Founder can grow their team post-onboarding. Settings work. Riley routes everything correctly.

### Hire Teammate Modal

- Two-step flow: role selection → candidate grid (4 candidates per role, pravatar.cc photos)
- On confirm: new `channels` row + new `bot_roles` row + bot intro message seeded
- Already-hired roles are greyed out with "✓ Already on your team"
- New channel appears in sidebar immediately (optimistic UI)

### Settings

- Settings → My Working Style: shows current mode, editable. On change: Ops posts announcement in #ops.
- Settings → Team Rules: locked non-negotiables + adjustable toggles + custom rule input (max 3)
- Settings → Integrations: slide-over panel (OQ-007 resolution). Lists GitHub (connected), Figma (coming soon), etc.

### Ops Bot — Riley's Routing Logic

Riley is the most behaviorally complex bot. Specific behaviours required:

1. **Universal entry point**: Any message to #ops gets routed to the right bot(s). Riley always posts in the destination channel on the founder's behalf — never tells the founder to go send the message themselves.
2. **Integration blocker batching**: If multiple bots are blocked within 10 minutes, one batched message covers all. First block surfaced immediately. Subsequent blocks within the window are appended, not separate messages.
3. **Stage tracking**: Riley knows the current Feature Stage (1–7) for every active workstream. "Where are we with [feature]?" returns: stage, last milestone, next gate, who acts next.
4. **Post-connection resume**: After a tool is connected, Riley confirms and asks the blocked bot "Want me to continue?" — no silent auto-resume.

### ⛔ Gate 7 — Founder reviews

- Click "+ Hire teammate" — walk through the two-step flow — confirm new channel appears
- Change working style in Settings — confirm Ops posts the announcement
- Message #ops with a request that spans two teammates — confirm Riley routes both
- Simulate a missing integration (disconnect GitHub) — confirm Riley surfaces it in #ops with CTA

---

## Phase 8 — Security Review + Test Suite

**Role**: Security Reviewer + Test Engineer  
**Goal**: No OWASP top-10 vulnerabilities. 70%+ test coverage. CI gates enforced.

### Security Reviewer Checks

- [ ] GitHub webhook signature validation cannot be bypassed
- [ ] `createPR` is the only GitHub write export — no accidental `push` or `merge` functions
- [ ] All API routes validate Supabase session — no unauthenticated data access
- [ ] RLS policies prevent cross-workspace data access (test: two workspaces, confirm isolation)
- [ ] Anthropic API key is never exposed to the client bundle
- [ ] GitHub App private key is never logged or returned in API responses
- [ ] Message content is sanitised before rendering (XSS — `dangerouslySetInnerHTML` banned)
- [ ] Plan `github_actions` JSONB validated against a strict Zod schema before execution
- [ ] Rate limiting on `/api/bots/message` (max 60 req/min per workspace)

### Test Engineer Coverage

**Required test files**:

```
__tests__/
  auth/           — magic link flow, session middleware, redirect logic
  channels/       — message insertion, realtime subscription mocks
  bots/           — orchestrator routing, action cap enforcement
  bots/jargon     — banned words in all plan strings (CI-blocking)
  plan-gate/      — state machine transitions, approval flow, rejection flow
  github/         — webhook validation, trigger rule matching, PR creation
  workflow-chains/ — chain evaluator, sequential/parallel modes
  templates/      — workspace seeding (all 3 templates), channel counts
  rls/            — cross-workspace isolation (uses two test users)
```

**Coverage targets**:
- Overall: 70%+
- Auth + Plan Gate + GitHub: 100%
- CI fails the build if coverage drops below these thresholds

**Note**: The jargon test (`__tests__/bots/jargon.test.ts`) is the single most important test in the suite. It runs on every PR. It is never waived.

### ⛔ Gate 8 — Founder reviews

- CI is green with coverage thresholds met
- Security Reviewer has flagged zero blockers (minor items documented in ADR, not blocking)
- Run the app end-to-end once after the security hardening pass — confirm nothing regressed

---

## Phase 9 — UX Polish + Deploy

**Role**: UX Designer + Frontend Engineer  
**Goal**: Every screen matches the design system. Production deploy live. Smoke check passed.

### UX Designer Regression Pass

Work through all 22 mockup screens in `docs/mockups/index.html` against the live build:

- [ ] All colours match design tokens (no hard-coded hex values in components)
- [ ] Inter font at correct sizes (message body: 15px, not 14px)
- [ ] Status dots not clipped (`.tm-avatar-wrap` fix applied)
- [ ] Plan card animations: slide-up 220ms ease-out on appear
- [ ] Modal animations: scale 0.97→1.0 + fade 180ms ease-out on open
- [ ] No technical language in any founder-facing string (visual scan of all screens)
- [ ] Mobile breakpoint (<768px): "best on desktop" message shown, workspace not broken

### Production Deploy Checklist

- [ ] All environment variables set in Vercel Production environment
- [ ] Supabase `anon` key is the public key (not service role) in client bundle
- [ ] GitHub App webhook URL updated to production Vercel URL
- [ ] Supabase RLS confirmed enabled on all tables (not just dev)
- [ ] `next.config.ts` `images.domains` includes `i.pravatar.cc` and `api.dicebear.com`
- [ ] CSP headers set (deny `eval`, restrict `connect-src` to Supabase + Anthropic + GitHub)
- [ ] Error boundaries on all page-level components — no white-screen-of-death

### Smoke Check (after deploy)

1. Sign up with a new email on the production URL
2. Complete full onboarding (Startup template, skip GitHub)
3. Send a message to Riley — get a response
4. Send a message to Sam — get a response with a plan card
5. Approve the plan (GitHub not connected so it should degrade gracefully)
6. Check action counter incremented

### ⛔ Gate 9 — Founder reviews

- Smoke check passes on production URL
- Share the production URL with one other person and confirm they can sign up
- **Ship decision**: you say "this is live" — Ops marks the workspace as Shipped

---

## Open Questions — Resolved in This Plan

| OQ | Resolution |
|---|---|
| OQ-007 | Settings → Integrations: slide-over panel, not full navigation |
| OQ-008 | Standup auto-posts even with no work: "Nothing new from me today" |
| OQ-010 | Supabase JS v2 auto-refreshes sessions via PKCE — no custom logic needed |

---

## Blocking Risk Register

| Risk | Severity | Mitigation | Owner |
|---|---|---|---|
| GitHub App registration takes days | Medium | Register on pre-flight day, not Phase 5 | Founder (PF-3) |
| Vercel cold starts make bot feel slow | Medium | Keep `/api/bots/stream` warm with a Vercel cron ping every 5 min | Backend Developer |
| Claude API rate limits during testing | Low | Exponential backoff in orchestrator; cache bot intros | ML/Agent Engineer |
| Supabase Realtime drops on free tier | Low | Acceptable for prototype; reconnect logic in `subscribeToChannel` | Backend Developer |
| Thread context window overflow | Medium | Summary call (haiku-4-5) on messages older than 20 — Phase 3 | ML/Agent Engineer |

---

## Role Responsibility Matrix

| Phase | Primary Role | Support Role | Founder gate |
|---|---|---|---|
| 0 — Repo shell | Architect | Backend Developer | ✓ Gate 0 |
| 1 — DB + Auth | Backend Developer | — | ✓ Gate 1 |
| 2 — Onboarding | Frontend Engineer | Backend Developer | ✓ Gate 2 |
| 3 — Workspace + Bots | ML/Agent Engineer | Frontend + Backend | ✓ Gate 3 |
| 4 — Plan Gate | Backend Developer | Frontend Engineer | ✓ Gate 4 |
| 5 — GitHub | Backend Developer | — | ✓ Gate 5 |
| 6 — Full Team + Rooms | ML/Agent Engineer | Backend + Frontend | ✓ Gate 6 |
| 7 — Hire + Settings + Ops | Frontend Engineer | ML/Agent Engineer | ✓ Gate 7 |
| 8 — Security + Tests | Security Reviewer | Test Engineer | ✓ Gate 8 |
| 9 — Polish + Deploy | UX Designer | Frontend Engineer | ✓ Gate 9 (ship) |

---

## How to Start Each Session

Every session begins with this prompt:

```
/role-[role-name]

Read docs/architecture/2026-04-22-execution-plan.md and pick up Phase [N].
All context is in docs/. The previous gate was cleared. Begin.
```

That's it. The roles have everything they need.
