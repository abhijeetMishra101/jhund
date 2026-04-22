# System Design — Clan MVP

**Date**: 2026-04-21  
**Author**: Architect  
**Status**: Approved for build

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLAN — VERCEL                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Next.js 14 App Router                   │    │
│  │                                                         │    │
│  │   app/                                                  │    │
│  │   ├── (auth)/          → Signup / magic-link confirm    │    │
│  │   ├── (onboarding)/    → 3-step workspace setup         │    │
│  │   └── [workspace]/                                      │    │
│  │       ├── layout.tsx   → Sidebar + action counter       │    │
│  │       └── [channel]/   → Message thread                 │    │
│  │                                                         │    │
│  │   api/                                                  │    │
│  │   ├── github/webhook   → GitHub App event ingest        │    │
│  │   ├── bots/message     → Send message → bot response    │    │
│  │   ├── bots/approve     → Approve / reject plan          │    │
│  │   └── bots/stream      → SSE stream for bot typing      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
  ┌─────────────┐     ┌──────────────────┐   ┌─────────────┐
  │  Supabase   │     │  Anthropic API   │   │  GitHub App │
  │             │     │  claude-sonnet   │   │  (Octokit)  │
  │  Postgres   │     │  -4-6            │   │             │
  │  Realtime   │     │                  │   │  PRs only,  │
  │  Auth       │     │  System prompt   │   │  no main    │
  │  Storage    │     │  per bot role    │   │  pushes     │
  └─────────────┘     └──────────────────┘   └─────────────┘
```

---

## Module Map

### Module 1: Auth (`lib/auth/`)
**Boundary**: Everything about who is logged in and what workspace they own.

| Interface | Description |
|---|---|
| `createWorkspace(name, template)` | Creates workspace row + seeds channels + installs default bots |
| `getSession()` | Returns current user + workspace from Supabase session |
| `connectGitHub(installationId)` | Links GitHub App installation to workspace |

**Owns**: `workspaces`, `users` tables.  
**Does not touch**: Bot logic, channel content.

---

### Module 2: Channels (`lib/channels/`)
**Boundary**: Room metadata and message persistence. No AI logic.

| Interface | Description |
|---|---|
| `listChannels(workspaceId)` | Returns ordered channel list with unread counts |
| `getMessages(channelId, cursor?)` | Paginated message history (50 per page) |
| `postMessage(channelId, authorId, content, type)` | Inserts message; triggers bot pipeline if `type = 'user'` |
| `subscribeToChannel(channelId)` | Supabase Realtime subscription handle |

**Owns**: `channels`, `messages` tables.  
**Does not touch**: Claude API, GitHub.

---

### Module 3: Bot Orchestrator (`lib/bots/`)
**Boundary**: Routes founder messages to the correct bot role and manages the response lifecycle.

| Interface | Description |
|---|---|
| `getBotForChannel(channelId)` | Returns bot role config (system prompt, name, avatar) |
| `respondToMessage(channelId, messageId)` | Builds context window → calls Claude → streams response |
| `checkActionCap(workspaceId)` | Returns `{ used, cap, remaining }` |
| `incrementActionCount(workspaceId)` | Atomic increment; throws if cap exceeded |

**Context window rule**: Last 20 messages + summarised older history. Never full thread.  
**Owns**: `bot_roles`, `bot_responses` tables.  
**Does not touch**: GitHub directly — hands off to Plan Gate.

---

### Module 4: Plan Gate (`lib/plan-gate/`)
**Boundary**: The trust layer. Every GitHub action must pass through here.

| Interface | Description |
|---|---|
| `proposePlan(channelId, botId, planMarkdown, githubActions[])` | Creates `pending` plan row + posts plan message |
| `approvePlan(planId, founderId)` | Sets status → `approved`; enqueues execution |
| `rejectPlan(planId, founderId, reason?)` | Sets status → `rejected`; posts rejection message |
| `executePlan(planId)` | Runs `githubActions[]` via GitHub module; sets status → `executed` |

**State machine**: `pending → approved → executed` or `pending → rejected`.  
**Non-negotiable**: No GitHub action runs without `approved` status.  
**Owns**: `plans` table.

---

### Module 5: GitHub Integration (`lib/github/`)
**Boundary**: All GitHub API calls. Inward (webhooks) and outward (PRs, comments).

| Interface | Description |
|---|---|
| `handleWebhook(payload, signature)` | Validates signature → maps event to trigger rule → posts to channel |
| `createPR(workspaceId, title, body, branch, base?)` | Creates PR from bot branch; base defaults to `main` |
| `postPRComment(workspaceId, prNumber, body)` | Bot comments on an existing PR |
| `listOpenPRs(workspaceId)` | Returns open PRs for bot awareness |
| `getTriggerRules(workspaceId)` | Returns event → channel routing rules |

**Hard constraint**: `createPR` is the only write action allowed. No `push`, no `merge`, no branch delete.  
**Owns**: `github_installations`, `github_triggers` tables.

---

### Module 6: Templates (`lib/templates/`)
**Boundary**: Workspace seed data. Runs once at workspace creation.

| Template | Channels seeded | Bots installed |
|---|---|---|
| Startup | #ops, #product, #engineering, #standup | Ops, Product Owner, Backend, ML Engineer |
| Enterprise | #ops, #product, #engineering, #security, #standup, #retrospective | All roles |
| Blank | #ops | Ops only |

---

## Data Model

```sql
-- Core workspace
workspaces (
  id          uuid PK,
  name        text,
  slug        text UNIQUE,
  template    text,              -- 'startup' | 'enterprise' | 'blank'
  action_cap  int DEFAULT 50,
  actions_used int DEFAULT 0,
  github_installation_id text,
  github_repo text,
  created_at  timestamptz
)

-- Auth (Supabase managed)
users (
  id    uuid PK,  -- Supabase auth.users
  workspace_id uuid FK → workspaces,
  role  text DEFAULT 'founder'
)

-- Channels / rooms
channels (
  id           uuid PK,
  workspace_id uuid FK → workspaces,
  name         text,             -- e.g. 'engineering'
  display_name text,             -- e.g. '#engineering'
  bot_role_id  uuid FK → bot_roles,
  position     int,
  created_at   timestamptz
)

-- Messages (all authors: founder + bots)
messages (
  id          uuid PK,
  channel_id  uuid FK → channels,
  author_type text,              -- 'user' | 'bot' | 'system'
  author_id   uuid,              -- user id or bot_role id
  content     text,
  plan_id     uuid FK → plans NULL,
  created_at  timestamptz
)

-- Bot role configs
bot_roles (
  id            uuid PK,
  workspace_id  uuid FK → workspaces,
  role_key      text,            -- 'product-owner' | 'architect' | 'backend' | ...
  display_name  text,            -- 'Alex (Product)'
  system_prompt text,
  avatar_seed   text,            -- for deterministic avatar generation
  created_at    timestamptz
)

-- Plan gate
plans (
  id              uuid PK,
  channel_id      uuid FK → channels,
  bot_role_id     uuid FK → bot_roles,
  description_md  text,          -- plain English shown to founder
  github_actions  jsonb,         -- [{type, params}] — serialised action list
  status          text,          -- 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  approved_by     uuid NULL FK → users,
  approved_at     timestamptz NULL,
  executed_at     timestamptz NULL,
  failure_reason  text NULL,
  created_at      timestamptz
)

-- GitHub
github_installations (
  id              uuid PK,
  workspace_id    uuid FK → workspaces,
  installation_id text UNIQUE,
  repo_full_name  text,
  created_at      timestamptz
)

github_triggers (
  id           uuid PK,
  workspace_id uuid FK → workspaces,
  event_type   text,             -- 'pull_request.opened' | 'issues.labeled' | ...
  label_filter text NULL,        -- e.g. 'security' for labeled issues
  channel_id   uuid FK → channels,
  bot_role_id  uuid FK → bot_roles,
  created_at   timestamptz
)
```

---

## Request Flow: Founder Sends a Message

```
Founder types message
        │
        ▼
POST /api/bots/message
        │
        ▼
channels.postMessage()  ──→  INSERT messages (author_type='user')
        │
        ▼
bots.checkActionCap()   ──→  throw if cap exceeded → post system error message
        │
        ▼
bots.getBotForChannel() ──→  fetch bot_role system prompt
        │
        ▼
bots.respondToMessage() ──→  build context (last 20 msgs) → stream to Claude
        │
        ├── Plain response (no GitHub action)
        │       │
        │       ▼
        │   INSERT messages (author_type='bot') → Realtime broadcasts to client
        │
        └── GitHub action required
                │
                ▼
        planGate.proposePlan()
                │
                ▼
        INSERT plans (status='pending')
        INSERT messages (plan_id=...) → Realtime broadcasts plan card to client
                │
                ▼
        Founder sees Plan Approval Modal
```

---

## Request Flow: GitHub Webhook

```
GitHub event fires
        │
        ▼
POST /api/github/webhook
        │
        ▼
Validate HMAC signature → 401 if invalid
        │
        ▼
github.getTriggerRules()  ──→  match event_type + label_filter
        │
        ▼
channels.postMessage()  ──→  system message in matched channel
        │
        ▼
bots.respondToMessage()  ──→  bot auto-responds (may propose plan)
```

---

## Action Counter

- Stored in `workspaces.actions_used` (atomic SQL increment)
- `actions_used` increments on: Claude API call + any GitHub action execution
- Cap enforced in `bots.checkActionCap()` before every bot pipeline entry
- Counter visible in sidebar at all times (see UX wireframes)
- Reset is manual (founder resets in workspace settings)

---

## ADR Index

| # | Decision | File |
|---|---|---|
| 001 | Full stack in Next.js API routes vs separate Express backend | [2026-04-21-tech-stack-proposal.md](./2026-04-21-tech-stack-proposal.md) |
| 002 | GitHub App vs OAuth for git integration | [2026-04-21-tech-stack-proposal.md](./2026-04-21-tech-stack-proposal.md) |
| 003 | Supabase Realtime vs custom WebSocket | [2026-04-21-tech-stack-proposal.md](./2026-04-21-tech-stack-proposal.md) |
