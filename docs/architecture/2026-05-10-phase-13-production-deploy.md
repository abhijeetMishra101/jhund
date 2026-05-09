# Phase 13 — Production Deploy + Smoke Test

**Date**: 2026-05-10
**Lead role**: Backend Developer
**Supporting**: Frontend Engineer (UX review), Founder (approval gate)
**Branch**: none — checklist only, no new code
**Duration**: ~2–3 hours

---

## Context

This is the ship gate. All feature phases (10–12) are merged. This phase confirms the production environment is correctly configured and all critical paths work end-to-end on the live URL.

No new code is written in this phase. Any issues found result in a fix PR, not a workaround.

---

## Pre-Deploy Checklist (Founder + Backend Developer)

### Environment Variables — Vercel Production

Confirm every variable is set in Vercel → Project → Settings → Environment Variables → **Production** scope (not just Preview):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY        ← full .pem contents, newlines as \n
GITHUB_WEBHOOK_SECRET
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_SLUG               ← your GitHub App's slug (from App settings URL)
CRON_SECRET                   ← generate: openssl rand -base64 32
NEXTAUTH_SECRET               ← generate: openssl rand -base64 32
```

### GitHub App — Production Webhook URL

Update the GitHub App webhook URL from the Vercel preview URL to the production URL:
- GitHub → Settings → Developer Settings → GitHub Apps → [Your App] → General
- Webhook URL: `https://[your-production-domain]/api/webhooks/github`

### Supabase — Production DB Migrations

Confirm all migrations have been run on the production Supabase project (not just dev):

```sql
-- Verify all columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'channels' AND column_name = 'archived';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'github_triggers' AND column_name = 'chain_group';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'workspaces' AND column_name = 'last_standup_at';
```

All three should return a row. If not, run the missing migration.

### Supabase — Storage Bucket

- Confirm `message-archives` bucket exists: Supabase → Storage → Buckets
- If missing: create it (private, no public access)

---

## Smoke Test Checklist

Run through every step on the production URL. Check the box only when the step succeeds. Any failure = stop, open a fix PR, re-run from that step.

### Auth
- [ ] Navigate to `/auth/login` — email input renders
- [ ] Enter email → magic link email received within 60 seconds
- [ ] Click magic link → redirected to `/onboarding`

### Onboarding
- [ ] Step 1: Enter workspace name → Next works
- [ ] Step 2: Select template (Startup) → Next works
- [ ] Step 3: Select working style → Next works
- [ ] Step 4: Click "Connect GitHub" → redirected to GitHub App install page
- [ ] Install GitHub App on a test repo → redirected back with `?github_connected=1`
- [ ] Step 4 shows success state
- [ ] Step 5: Meet your team → Riley's intro message visible in #ops
- [ ] Click "Go to your workspace" → workspace loads

### Core messaging
- [ ] Workspace shell renders: sidebar + channel list + message area
- [ ] Settings link visible in sidebar
- [ ] Type a message in #ops → message appears immediately
- [ ] Riley responds within 15 seconds
- [ ] Response is in character (no "API/webhook/agent" language)
- [ ] Action counter increments after bot response

### GitHub trigger
- [ ] Open a test PR on the connected repo
- [ ] System message appears in #engineering within 30 seconds
- [ ] Sam responds with a plan proposal
- [ ] Plan card renders with Approve / Not now buttons
- [ ] Click Approve → plan status updates to executing
- [ ] PR comment appears on GitHub from "Clan Bot"

### Settings
- [ ] Navigate to `/w/[slug]/settings`
- [ ] Team tab: existing bots visible
- [ ] Hire a bot → bot appears in list
- [ ] Rename the hired bot → name updates
- [ ] Fire the hired bot → bot removed from list
- [ ] Integrations tab: GitHub shows as Connected
- [ ] Workspace tab: rename workspace → saved correctly

### Action cap
- [ ] Action counter is always visible
- [ ] At 80%+ usage: counter shows warning colour
- [ ] (Do not test at 100% on production — use staging)

### Crons (manual trigger)
```bash
# Test each cron via curl — replace YOUR_DOMAIN and YOUR_CRON_SECRET
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_DOMAIN/api/cron/standup
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_DOMAIN/api/cron/retrospective
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_DOMAIN/api/cron/archive-messages
```
- [ ] Standup: returns `{ ok: true }`, Riley message appears in #standup
- [ ] Retrospective: returns `{ ok: true }`, Riley message appears in #retrospective
- [ ] Archive: returns `{ ok: true, archived: N }` (N may be 0 if no old messages)

---

## UX Final Review

Frontend Engineer / UX Designer checks production against design system:

- [ ] Typography matches design system (Inter, correct weights)
- [ ] Colour tokens correct (`#1a1d21` background, `#27292d` cards, `#1164a3` primary)
- [ ] No layout breaks on mobile (375px viewport)
- [ ] All bot messages show role chip
- [ ] Plan card renders correctly in both pending and executed states
- [ ] Sidebar Settings link visible and working
- [ ] No console errors on page load

---

## Definition of Done

- [ ] All environment variables confirmed in Vercel Production
- [ ] GitHub App webhook URL updated to production domain
- [ ] All DB migrations confirmed on production Supabase
- [ ] Storage bucket exists
- [ ] Every smoke test item checked
- [ ] UX review passed
- [ ] Zero console errors on production

> 🔴 **Founder gate — ship decision**: Once all boxes are checked, this is the go/no-go decision. Review the smoke test results. If all pass: Clan is live. If any fail: those items become a fix PR before shipping.

---

## Post-Ship

Once live, connect the Fashion Trend Pipeline repo as the first real guinea pig:
1. Install the GitHub App on `fashion-trend-pipeline`
2. Open a test PR → confirm Sam responds
3. Monitor #ops for the first week — Riley should surface any routing issues
