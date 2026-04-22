# Clan — Phased Execution Plan

**Date**: 2026-04-23
**Author**: Architect
**Status**: Ready to execute
**Estimated wall time**: 2–3 weeks (9 sessions)

---

## How to Read This Plan

- **Sessions** are the unit of work. Each session is a single Claude Code conversation. End-of-session commits to a PR; no direct pushes to `main`.
- **Approval gates** (🔴) are the only moments you need to act. Everything else runs without you.
- **External setup** (🔑) requires credentials only you can create. Do all of Day 0 before Session 1.
- **Role assignments** show which role(s) lead each session. A role listed second reviews, not leads.

---

## Day 0 — External Setup (You only, ~45 minutes total)

Do these in order. Each step produces a value you paste into Vercel env vars at the end.

### Step 1 — Supabase Project (~10 min)
1. Go to [supabase.com](https://supabase.com) → New project
2. Name: `clan-mvp` | Region: closest to you | Generate a strong DB password (save it)
3. Once created, go to **Settings → API**:
   - Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
4. Go to **Settings → Auth → Email** → enable Magic Link, disable email confirmation
5. Add your domain to **Auth → URL Configuration** (use `http://localhost:3000` for now)

### Step 2 — GitHub App (~15 min)
1. Go to GitHub → Settings → Developer Settings → GitHub Apps → **New GitHub App**
2. Fill in:
   - Name: `Clan Bot`
   - Homepage URL: `http://localhost:3000` (update after Vercel deploy)
   - Webhook URL: `https://[your-vercel-url]/api/github/webhook` (placeholder for now)
   - Webhook secret: generate a random 32-char string → `GITHUB_WEBHOOK_SECRET`
3. Permissions needed (Repository):
   - Contents: Read & write (for creating branches)
   - Pull requests: Read & write
   - Issues: Read & write
   - Metadata: Read-only
4. Subscribe to events: `pull_request`, `issues`, `push`
5. Create app → go to **General** tab:
   - Copy **App ID** → `GITHUB_APP_ID`
   - Generate a **Private Key** (downloads a `.pem` file) → contents → `GITHUB_APP_PRIVATE_KEY`
   - Copy **Client ID** → `GITHUB_APP_CLIENT_ID`
   - Generate a **Client Secret** → `GITHUB_APP_CLIENT_SECRET`

### Step 3 — Anthropic API Key (~2 min)
1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key
2. Copy key → `ANTHROPIC_API_KEY`

### Step 4 — Create GitHub Repo + Vercel Project (~10 min)
1. Create a new GitHub repo: `clan` (private)
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub → select `clan`
3. Framework preset: **Next.js** | Root directory: `.` | Leave build settings default
4. Don't deploy yet — just create the project to get the URL
5. Copy the Vercel preview URL (e.g. `clan.vercel.app`) → update GitHub App webhook URL

### Step 5 — Set Vercel Environment Variables (~5 min)
In Vercel → Project → Settings → Environment Variables, add all of these:

```
NEXT_PUBLIC_SUPABASE_URL          = [from Step 1]
NEXT_PUBLIC_SUPABASE_ANON_KEY     = [from Step 1]
SUPABASE_SERVICE_ROLE_KEY         = [from Step 1]
ANTHROPIC_API_KEY                 = [from Step 3]
GITHUB_APP_ID                     = [from Step 2]
GITHUB_APP_PRIVATE_KEY            = [full .pem contents, newlines as \n]
GITHUB_WEBHOOK_SECRET             = [from Step 2]
GITHUB_APP_CLIENT_ID              = [from Step 2]
GITHUB_APP_CLIENT_SECRET          = [from Step 2]
NEXTAUTH_SECRET                   = [generate: openssl rand -base64 32]
```

> 🔴 **Gate 0 — Approval required**: When you have all env vars set in Vercel and the repo created, let the team know. Session 1 cannot start without the Supabase URL + service key + Anthropic key at minimum.

---

## Phase 1 — Project Skeleton + Database (Session 1)

**Lead role**: Backend Developer
**Supporting role**: ML / Agent Engineer (reviews bot_roles schema)
**Duration**: ~3–4 hours

### What gets built
1. Initialize Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui base components
2. Configure Supabase client (server + browser)
3. Run the full database migration — all tables from the schema in `docs/architecture/2026-04-21-system-design.md`:
   - `workspaces`, `users`, `channels`, `messages`, `bot_roles`, `plans`, `github_installations`, `github_triggers`
4. Enable Row Level Security (RLS) on all tables — workspace isolation from day one
5. Seed the `bot_roles` table with all 5 MVP role configs (Ops, Product, Engineering, Design, Security)
6. Configure TypeScript types generated from Supabase schema
7. `.env.local` template committed (values excluded via `.gitignore`)
8. Vercel auto-deploys preview URL on PR merge

### End-of-session deliverable
- PR to `main` with working Next.js shell, Supabase connected, schema migrated
- `npm run dev` runs without errors
- Supabase table explorer shows all tables with RLS enabled

> No founder input needed during this session.

---

## Phase 2 — Auth + Onboarding Flow (Session 2)

**Lead role**: Backend Developer + Frontend Engineer
**Duration**: ~4–5 hours

### What gets built

#### Backend (Backend Developer)
1. `lib/auth/` module — `createWorkspace()`, `getSession()` interfaces
2. `POST /api/workspace/setup` — creates workspace, seeds channels from template, seeds bot_roles
3. `GET /api/workspace` — returns workspace state + action counter
4. `GET /api/channels` — returns channel list with unread counts
5. Supabase Auth magic link wired: `POST /auth/v1/otp` → `/auth/callback` route handler

#### Frontend (Frontend Engineer)
1. Screen 1: Magic link sign-in page (email input only — no password)
2. Screens 2–6: Full 5-step onboarding flow per `docs/ux/2026-04-21-wireframes.md`:
   - Step 1/5: Name your company
   - Step 2/5: Pick a team template (Startup / Enterprise / Blank)
   - Step 3/5: Working style (Balanced pre-selected)
   - Step 4/5: Connect GitHub (optional — skip CTA prominent)
   - Step 5/5: Meet your team (Riley's intro seeded in #ops)
3. App shell: sidebar (240px) + top bar (48px) + channel area (flex-1)
4. Sidebar: Channels tab (default) + Team tab + `+ Hire teammate` link
5. Action counter in top bar: `⚡ 0 / 50 actions used`
6. Design tokens from `docs/ux/2026-04-21-design-system.md` as CSS custom properties in `globals.css`
7. Inter font loaded from Google Fonts

### End-of-session deliverable
- Can sign up via magic link → complete onboarding → see workspace shell with sidebar
- No bot responses yet — that's Phase 3
- PR to `main`

> 🔴 **Gate 1 — Approval required**: After this PR merges, Founder reviews the live preview URL. Check: does the onboarding feel right? Does the workspace shell feel Slack-like? Give a thumbs up or flag issues before Phase 3 starts.

---

## Phase 3 — Bot Orchestrator + Claude Integration (Session 3)

**Lead role**: ML / Agent Engineer
**Supporting role**: Backend Developer (API route plumbing)
**Duration**: ~5–6 hours

### What gets built

#### Core Orchestrator (`lib/bots/`)
1. `getBotForChannel(channelId)` — fetches bot_role config (system prompt, name, avatar seed)
2. `respondToMessage(channelId, messageId)` — the main pipeline:
   - Fetches last 20 messages from channel (context window)
   - If thread > 20 messages, summarises older history via a cheap Claude call
   - Builds system prompt: role persona + workspace context + tool availability
   - Streams response via Anthropic SDK with `claude-sonnet-4-6`
3. `checkActionCap(workspaceId)` — reads `workspaces.actions_used`; throws `ACTION_CAP_EXCEEDED` if at limit
4. `incrementActionCount(workspaceId)` — atomic SQL increment

#### API Routes (Backend Developer)
1. `POST /api/bots/message` — inserts user message → triggers orchestrator → returns `202`
2. `GET /api/bots/stream/[channelId]` — SSE stream; broadcasts: `typing`, `chunk`, `done`, `plan_proposed`

#### System Prompts (ML / Agent Engineer)
Write and tune system prompts for all 5 MVP bot roles. Each prompt includes:
- Role persona (name, personality, expertise)
- Non-negotiable tone rules: no jargon, no "webhook/API/token", say "teammate" not "agent"
- Plan gate instruction: "Before any GitHub action, post a plain-English plan and wait for approval"
- Action cap awareness: "If approaching the action limit, flag it proactively"
- Working style adaptation: prompt receives `working_style` param from workspace config

All prompts stored in `bot_roles.system_prompt` (editable without redeploy).

#### ⚠ Prompt Caching — Required, Not Optional (ML / Agent Engineer)

Prompt caching must be enabled from day one of the Claude integration. This is a 3-line SDK config change with a 10× cost impact.

Every bot call reuses the same system prompt (~800 tokens). Without caching, that 800 tokens is billed as fresh input on every single call. With caching, after the first call it costs 10% of normal input price.

```typescript
// In respondToMessage() — add cache_control to the system prompt block
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  system: [
    {
      type: 'text',
      text: botRole.system_prompt,
      cache_control: { type: 'ephemeral' }  // ← this line. do not skip.
    }
  ],
  messages: contextWindow,
  stream: true,
});
```

**Cost impact at 1,000 workspaces × 50 actions/month**:
- Without caching: ~₹4,20,000/month
- With caching: ~₹52,000/month
- **Saving: ₹3,68,000/month**

Also cache the conversation summary (older-than-20-messages block) as a second `ephemeral` block. Cache TTL is 5 minutes — acceptable for active conversations.

#### Frontend (Frontend Engineer)
1. Message input box (`textarea`, Enter to send, Shift+Enter for newline)
2. Typing indicator: three-dot animation while bot SSE stream is open
3. Bot message rendering with role chip (colour-coded by role)
4. Supabase Realtime subscription on `messages` table filtered by `channel_id`
5. Human face avatars from pravatar.cc (fixed img numbers per role — see mockup)

### End-of-session deliverable
- Can type a message in any channel and get a streaming Claude response in persona
- Action counter increments on each bot call
- Action cap blocks at 50 with correct error message
- PR to `main`

> No founder input needed during this session.

---

## Phase 4 — Plan Gate (Session 4)

**Lead role**: Backend Developer
**Supporting role**: Frontend Engineer (modal UI)
**Duration**: ~4–5 hours

### What gets built

#### Plan Gate Module (`lib/plan-gate/`)
1. `proposePlan(channelId, botId, planMarkdown, githubActions[])`:
   - Inserts `plans` row (status = `pending`)
   - Inserts message row with `plan_id` reference
   - Supabase Realtime broadcasts the new plan message to frontend
2. `approvePlan(planId, founderId)`:
   - Sets `plans.status = 'approved'`
   - Calls `executePlan()` asynchronously
3. `rejectPlan(planId, founderId, reason?)`:
   - Sets `plans.status = 'rejected'`
   - Posts a bot message: "Understood — I won't do that. Let me know how you'd like to proceed."
4. `executePlan(planId)`:
   - Reads `github_actions[]` from plan row
   - Calls GitHub module for each action
   - Sets `executed_at`; sets `status = 'executed'` or `'failed'`
   - Increments action counter for each GitHub action

#### Bot Orchestrator update (ML / Agent Engineer)
- Add detection logic: if Claude response includes a GitHub action intent, extract it and call `proposePlan()` instead of posting raw response
- Detection uses structured output — bot always formats plans as JSON block in thinking layer, plain English in user-visible content

#### API Routes
1. `POST /api/plans/[planId]/approve`
2. `POST /api/plans/[planId]/reject`
3. `GET /api/plans/[planId]` — for polling plan status post-approval

#### Frontend (Frontend Engineer)
1. Plan card component — embedded in message bubble, left border accent (#4F46E5)
2. Plan Approval Modal (Screen 8 in mockup) — all states:
   - `pending`: plain-English description + Approve + Not now buttons
   - `loading` (post-approve): spinner + "Working on it..."
   - `executed`: success state with checkmark
   - `failed`: error state with recovery CTA
3. Approve/reject button wired to API; optimistic UI update
4. Supabase Realtime subscription on `plans` table for status updates

### End-of-session deliverable
- Bot proposes a plan when a GitHub action is required
- Founder sees plan card with Approve / Not now
- Approving triggers execution (even if GitHub isn't connected yet — mock the GitHub call)
- Plan card updates to success/failure state in real time
- PR to `main`

> 🔴 **Gate 2 — Approval required**: The plan approval modal is the most important surface in the product (per UX principles). Founder must review the live modal before Phase 5 starts. Check: is the language clear? Is trust communicated? Does the success/failure state feel right?

---

## Phase 5 — GitHub Integration (Session 5)

**Lead role**: Backend Developer
**Supporting role**: Ops Bot (wires trigger rules)
**Duration**: ~4–5 hours

### What gets built

#### GitHub Module (`lib/github/`)
1. `handleWebhook(payload, signature)`:
   - Validates HMAC-SHA256 signature against `GITHUB_WEBHOOK_SECRET`
   - Maps event type to `github_triggers` ruleset
   - Posts system message to matched channel
   - Triggers `bots.respondToMessage()` in that channel
2. `createPR(workspaceId, title, body, branch, base='main')`:
   - Uses Octokit REST; authenticates as GitHub App installation
   - **Hard constraint**: only creates PRs, never pushes to `main`
3. `postPRComment(workspaceId, prNumber, body)`:
   - Posts comment as Clan Bot app identity
4. `listOpenPRs(workspaceId)`:
   - Returns open PRs for bot context awareness
5. `getTriggerRules(workspaceId)`:
   - Returns event → channel routing from `github_triggers` table
6. `getInstallationToken(workspaceId)`:
   - Generates short-lived token from GitHub App private key

#### Webhook Receiver
- `POST /api/github/webhook` — validates → routes → triggers
- Returns `200` immediately; processing is async

#### GitHub Connect Flow
- `GET /api/github/connect` — redirects to GitHub App install URL
- `GET /api/github/callback` — stores `installation_id` in `github_installations`; redirects to workspace

#### Seed Default Trigger Rules (Ops Bot)
On workspace setup, seed `github_triggers` with:

| Event | Filter | Channel | Bot |
|---|---|---|---|
| `pull_request.opened` | — | #engineering | Engineering |
| `pull_request.closed` (merged) | — | #qa | QA (if installed) |
| `issues.labeled` | label: `security` | #security | Security |
| `issues.labeled` | label: `design` | #design | Design |

#### Frontend
- Update onboarding Step 4/5: "Connect GitHub" button calls `GET /api/github/connect`
- Post-callback: onboarding continues to Step 5/5
- Settings → Team Rules: show connected repo + trigger rules list

### End-of-session deliverable
- Opening a PR on GitHub fires a webhook → system message appears in #engineering → Sam proposes a review plan
- Approving the plan posts a PR comment from "Clan Bot" on GitHub
- GitHub connect flow works end-to-end in onboarding
- PR to `main`

> 🔴 **Gate 3 — Approval required**: Founder connects their actual GitHub repo (the fashion-trend-pipeline or a test repo). Opens a test PR → watches the full flow live: webhook arrives → Sam proposes plan → Founder approves → comment appears on GitHub PR. Confirm this feels right before Phase 6.

---

## Phase 6 — Frontend Polish + Hire Flow (Session 6)

**Lead role**: Frontend Engineer
**Supporting role**: UX Designer (review pass)
**Duration**: ~4–5 hours

### What gets built

#### Hire Teammate Modal (Screen 9 in mockup)
- Step 1: Role selection (role cards with tool disclosure)
- Step 2: Candidate grid — 4 pre-defined candidates per role with pravatar.cc faces, names, taglines, personality badges
- Selection: click card → checkmark overlay → "Hire [Name]" CTA activates
- API: `POST /api/workspace/hire` — creates bot_role row, creates channel, seeds intro message

#### Sidebar Polish
- Channels tab: hash prefix, unread badge, active state
- Team tab: roster with pravatar.cc faces, role labels, presence dots (Online/Working/Idle)
- `+ Hire teammate` link at bottom
- Smooth transitions between tabs

#### Message Thread Polish
- Role chip on every bot message (colour-coded)
- Timestamp on hover
- System messages (GitHub events) — dimmed, italic prefix
- Empty state for new channels (Screen 11 in mockup)
- Message grouping: consecutive messages from same author collapse avatar

#### Action Counter
- Top bar: `⚡ X / 50 actions used`
- At 80% cap: warning colour (amber)
- At 100%: error colour (red) + lock icon
- Real-time via Supabase Realtime subscription on `workspaces`

#### Error & Recovery States
- Action cap exceeded → system message in channel with reset CTA
- GitHub not connected → graceful degradation message per Decision 003
- Bot error → plan card `fail` variant with recovery button

#### UX Designer Review Pass
At end of session, UX Designer reviews against wireframes and component specs:
- Spacing, typography, colour tokens
- Copy strings match `docs/ux/2026-04-21-copy-doc.md`
- Flag any regressions in a comment on the PR

### End-of-session deliverable
- All 22 mockup screens are functional (not just static)
- Hire flow works end-to-end
- PR to `main`

> No founder input needed during this session.

---

## Phase 7 — Bot Personalities + Workflow Chains + Rooms (Session 7)

**Lead role**: ML / Agent Engineer
**Supporting role**: Ops Bot
**Duration**: ~5–6 hours

### What gets built

#### Bot System Prompt Tuning (ML / Agent Engineer)
Tune and test all 5 role prompts against real founder scenarios from `docs/strategy/2026-04-21-use-cases.md`. Key scenarios to validate:
- Cat 2: Clarification request (one question, never a form)
- Cat 7: Founder override (one flag, then deference)
- Cat 11: Error recovery (plain English, actionable fix)
- Cat 18: Bot-to-bot routing via Riley

Each role prompt must pass:
- [ ] Never uses "webhook", "API", "token", "agent", "model"
- [ ] Proposes a plan before any GitHub action
- [ ] Handles action cap gracefully ("I'm running low on actions this month")
- [ ] Respects working style (Hands-off / Balanced / Hands-on)

#### Workflow Chain System (ML / Agent Engineer)
Implement the chain ruleset from Decision 006:
- `lib/workflow-chain/` module
- `evaluateChain(event, workspaceId)` — matches event against trigger table → returns `{bots[], order, context}`
- Sequential chains: A completes → B activates
- Parallel chains: A triggers B + C simultaneously (Supabase edge function or Vercel cron for async)
- All cross-bot handoffs post an announcement in the source channel before appearing in destination

#### Ops Bot (Riley) — Full Implementation
Riley's specific behaviours (Ops Bot role):
1. **Universal router**: Any message in #ops gets routed to correct channel(s) with a summary card
2. **Integration batch briefing**: Morning digest of pending integration requests (not per-event)
3. **Standup collection**: 9am → posts to #standup; collects bot responses in order
4. **Retrospective synthesis**: End of sprint → collects bot updates → generates cross-team summary
5. **Action cap warning**: At 80% → posts in #ops (not in every channel)
6. **Team admin**: Routes hire requests, surfaces blocked-work notifications

#### Standup Room (Screen 14)
- 9am daily Vercel Cron: `GET /api/cron/standup`
- Riley posts "Good morning — here's what the team is working on today:"
- Each bot posts their standup update (parallel workflow chain)
- Realtime subscriptions keep the room live

#### Retrospective Room (Screen 15)
- End-of-sprint Vercel Cron: `GET /api/cron/retrospective`
- Riley synthesises cross-team patterns from past sprint messages
- Each bot posts their wins + blockers

### End-of-session deliverable
- All 5 bots respond in character with correct language
- Opening a PR triggers Sam in #engineering automatically
- Riley routes #ops messages correctly
- Standup posts at 9am (test via manual cron trigger)
- PR to `main`

> 🔴 **Gate 4 — Approval required**: Full product walkthrough. Founder demos the product as if they were a new user: sign up → onboarding → message each bot → open a PR on GitHub → watch auto-trigger → approve a plan → see it execute. This is the "is it working?" gate. Aim for 20 minutes of founder testing. Flag anything that breaks the team metaphor.

---

## Phase 8 — Security + Test (Session 8)

**Lead role**: Security Reviewer + Test Engineer (parallel)
**Duration**: ~4–5 hours

### Security Review (Security Reviewer)

Review surface areas against OWASP Top 10 and Clan-specific risks:

1. **Webhook signature validation** — confirm `POST /api/github/webhook` always validates HMAC before processing; no way to bypass
2. **RLS policies** — verify every Supabase table has RLS that prevents cross-workspace data access
3. **Anthropic API key exposure** — confirm key never reaches the client bundle; only used server-side
4. **GitHub App private key** — confirm stored only in Vercel env vars; never logged or returned in API responses
5. **Plan gate bypass** — confirm there is no code path that calls `github.createPR()` without first reading a `plans.status = 'approved'` row
6. **Input sanitisation** — founder messages that contain prompt injection attempts (e.g. "Ignore your instructions and...") must not affect bot behavior
7. **Action cap integrity** — atomic increment; no race condition that allows >50 actions
8. **Auth session handling** — confirm all API routes except `/api/github/webhook` require valid Supabase session

Output: security findings report in `docs/security/2026-04-23-review.md` with severity (Critical / Major / Minor) and recommended fix for each finding.

### Test Suite (Test Engineer)

Write tests covering:

1. **API integration tests** (using `supertest` or Vitest + mock Supabase client):
   - `POST /api/bots/message` → happy path, action cap exceeded, bot busy
   - `POST /api/plans/[id]/approve` → happy path, plan not pending, GitHub not connected
   - `POST /api/github/webhook` → valid signature, invalid signature, no matching trigger
2. **Bot behaviour tests** (using recorded Claude responses — no live API calls in CI):
   - Each role responds without technical jargon
   - Plan is proposed before any GitHub action
   - Action cap message triggers at correct threshold
3. **Workflow chain tests**:
   - PR opened → Engineering bot activates
   - Issue labeled "security" → Security bot activates
   - #ops message → Riley routes to correct channel(s)
4. **RLS tests** (using Supabase test helpers):
   - User A cannot read User B's messages
   - User A cannot approve User B's plans

> 🔴 **Gate 5 — Approval required**: Security Reviewer presents findings. Founder reviews the Critical and Major findings and decides: fix before deploy, or accept risk and ship. Minors can be deferred to v1.1. No production deploy until founder has seen and acknowledged the findings report.

---

## Phase 9 — Production Deploy + Smoke Test (Session 9)

**Lead role**: Backend Developer
**Supporting roles**: Frontend Engineer, UX Designer (final review)
**Duration**: ~2–3 hours

### What gets built

#### Production Checklist
1. Merge all Phase 1–8 PRs to `main`
2. Set all environment variables in Vercel **Production** (not just Preview)
3. Update GitHub App webhook URL to production Vercel domain
4. Run Supabase migration on production database (separate from dev project)
5. Trigger Vercel production deploy
6. Smoke test all critical paths on production URL:
   - [ ] Magic link sign-in works
   - [ ] Onboarding completes (all 5 steps)
   - [ ] Bot responds in correct persona
   - [ ] Plan card appears and approves
   - [ ] GitHub webhook triggers Sam in #engineering
   - [ ] Hire modal shows candidates
   - [ ] Action counter visible and updating
   - [ ] Standup cron fires (trigger manually)

#### UX Final Review
UX Designer does a final pass on production:
- Typography, spacing, colour tokens match design system
- All copy strings match `docs/ux/2026-04-21-copy-doc.md`
- No mobile breakage (founders often open on phone)

### End-of-session deliverable
- Production URL live
- All smoke tests passing
- Fashion Trend Pipeline repo connected as first real guinea pig

> 🔴 **Gate 6 — Final approval**: Founder reviews production URL. This is the ship decision. Once approved, Clan is live.

---

## Approval Gate Summary

| Gate | When | What you decide | Time needed |
|---|---|---|---|
| 🔴 Gate 0 | Before Session 1 | External setup complete (credentials ready) | 45 min |
| 🔴 Gate 1 | After Session 2 | Does the shell + onboarding feel right? | 10 min |
| 🔴 Gate 2 | After Session 4 | Is the plan approval modal trustworthy? | 10 min |
| 🔴 Gate 3 | After Session 5 | Connect your real GitHub repo + test full flow | 15 min |
| 🔴 Gate 4 | After Session 7 | Full product walkthrough — does it work? | 20 min |
| 🔴 Gate 5 | After Session 8 | Review security findings — fix or accept? | 15 min |
| 🔴 Gate 6 | After Session 9 | Ship decision | 10 min |

**Total founder time required**: ~2 hours spread across 2–3 weeks.

---

## Session Start Protocol

At the beginning of every session, the leading role should:
1. Read `CLAUDE.md` for project context
2. Read the relevant docs in `docs/` for that phase
3. Run `git pull origin main` to get latest state
4. Check the previous session's PR was merged before starting new work

At the end of every session:
1. All changes are on a feature branch (`feat/phase-N-description`)
2. PR opened to `main` with a description of what was built
3. No direct pushes to `main` — ever

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Supabase Realtime latency feels slow | Low | Medium | Acceptable for MVP; swap to Ably if needed post-launch |
| Claude API rate limits during Phase 7 prompt tuning | Medium | Low | Use exponential backoff; tune prompts in batches |
| GitHub App private key rotation needed | Low | High | Store in Vercel only; rotate via GitHub App settings |
| Context window exhausted in long threads | Medium | Medium | 20-message window + summarisation (already in Phase 3) |
| Scope creep adding screens mid-build | Medium | High | Any new feature requires a Decision log entry first (per PRD freeze policy) |
| Fashion Trend Pipeline repo not compatible with trigger rules | Low | Low | Seed test trigger rules in Phase 5; adjust after Gate 3 |
