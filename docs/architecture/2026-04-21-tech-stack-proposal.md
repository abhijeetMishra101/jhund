# Tech Stack Proposal — Clan MVP

**Date**: 2026-04-21  
**Author**: Architect  
**Status**: Approved for build

---

## Constraints Driving Every Decision

- Solo founder + Claude Code; must ship in 2–3 weeks
- Non-technical audience; zero-config deployment
- Real-time messaging feel (Slack benchmark)
- GitHub integration is core, not a plugin
- No direct pushes to `main` — ever

---

## Recommended Stack

### Layer 1 — Frontend

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | SSR + client components; Vercel-native; file-based routing maps to channels |
| Language | **TypeScript** | Catches interface mismatches between bot responses and UI before runtime |
| Styling | **Tailwind CSS** | No design system overhead; utility-first matches rapid wireframe → code |
| Real-time | **Supabase Realtime** (WebSocket) | Already in stack; no extra service; channels subscribe per room |
| State | **Zustand** (client) + **SWR** (server data) | Minimal boilerplate; SWR handles message list revalidation |

### Layer 2 — Backend

| Decision | Choice | Rationale |
|---|---|---|
| API layer | **Next.js API Routes** | Eliminates separate backend service for MVP; co-located with frontend |
| Database | **Supabase (Postgres)** | Managed; RLS for workspace isolation; realtime baked in |
| Auth | **Supabase Auth (magic link)** | No password friction for non-technical founders; email only |
| File storage | **Supabase Storage** | Bot-generated artefacts (specs, ADRs) attached to messages |
| Queue / async | **Vercel Cron + Supabase Edge Functions** | Bot processing is async; cron handles scheduled standups |

### Layer 3 — AI

| Decision | Choice | Rationale |
|---|---|---|
| SDK | **`@anthropic-ai/sdk`** | One SDK; all roles; streaming support |
| Model | **claude-sonnet-4-6** | Balance of speed and reasoning for role personas |
| Role configs | Stored in Supabase `bot_roles` table | Editable without code deploy; founder can tweak personality |
| Streaming | Server-Sent Events via API route | Typing indicator feel; no long-polling |

### Layer 4 — GitHub Integration

| Decision | Choice | Rationale |
|---|---|---|
| Auth method | **GitHub App** (not OAuth) | Per-repo installation; bot has its own identity; scoped permissions |
| SDK | **Octokit REST** | Official; well-typed; covers all MVP actions |
| Webhook receiver | `/api/github/webhook` (Next.js API route) | Single ingest point; validates signature; routes to trigger rules |
| Commit identity | Bot-named GitHub App | PRs show "Backend Bot suggested this change" not a human name |

### Layer 5 — Deployment

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | **Vercel** | Zero-config; preview deploys per PR; free tier sufficient for MVP |
| DB/Auth/Realtime | **Supabase (hosted)** | Free tier; no infra to manage |
| Secrets | Vercel Environment Variables | GitHub App private key, Anthropic API key, Supabase keys |

---

## What We Are Explicitly Not Using (and Why)

| Rejected | Reason |
|---|---|
| Separate Node/Express backend | Extra service to deploy; App Router API routes are sufficient for MVP |
| Redis / BullMQ | Supabase Edge Functions + Vercel Cron covers MVP async needs |
| WebSockets (custom) | Supabase Realtime handles this without infra |
| tRPC | Adds type ceremony; REST-style API routes are enough for the surface area |
| Prisma | Supabase JS client is sufficient; Prisma adds a migration layer we don't need yet |
| Docker / self-hosted | Not shippable in 2–3 weeks for a non-technical solo founder |

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Supabase Realtime latency under load | Low (MVP scale) | Acceptable for prototype; swap to Ably if needed post-launch |
| Vercel cold starts on bot API routes | Medium | Keep bot routes warm with Vercel Pro (or accept 1-2s cold start) |
| GitHub App approval time | Medium | Register App on day 1; approval is near-instant for private apps |
| Claude API rate limits during demos | Low | Implement exponential backoff in bot orchestrator |
| `claude-sonnet-4-6` context limits with long threads | Medium | Summarise thread history older than 20 messages before passing to model |
