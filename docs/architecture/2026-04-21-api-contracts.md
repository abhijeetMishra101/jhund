# API Contracts — Clan MVP

**Date**: 2026-04-21  
**Author**: Architect  
**Audience**: Backend Developer, Frontend Engineer  
**Status**: Approved for implementation

---

## Conventions

- All endpoints: `Content-Type: application/json`
- Auth: Supabase session cookie (`sb-access-token`) on all non-webhook routes
- Workspace scope: derived from session, never passed in body
- Errors: `{ error: string, code: string }`
- Pagination: cursor-based (`cursor` param = last message `created_at` ISO string)

---

## Auth Routes (Supabase handles, no custom API needed)

| Action | Method |
|---|---|
| Send magic link | `POST /auth/v1/otp` (Supabase direct) |
| Confirm magic link | Supabase redirect → `/auth/callback` (Next.js route handler) |
| Get session | Supabase client `getSession()` |
| Sign out | Supabase client `signOut()` |

---

## Workspace

### `POST /api/workspace/setup`
Complete onboarding — called after GitHub connection.

**Request**
```json
{
  "name": "Acme Inc",
  "template": "startup"
}
```

**Response `201`**
```json
{
  "workspace": {
    "id": "uuid",
    "slug": "acme-inc",
    "name": "Acme Inc",
    "template": "startup",
    "action_cap": 50,
    "actions_used": 0
  },
  "channels": [
    { "id": "uuid", "name": "ops", "display_name": "#ops", "position": 0 },
    { "id": "uuid", "name": "product", "display_name": "#product", "position": 1 }
  ]
}
```

### `GET /api/workspace`
Get current workspace state including action counter.

**Response `200`**
```json
{
  "id": "uuid",
  "name": "Acme Inc",
  "slug": "acme-inc",
  "template": "startup",
  "action_cap": 50,
  "actions_used": 12,
  "github_connected": true,
  "github_repo": "acme/backend"
}
```

---

## Channels

### `GET /api/channels`
List all channels for current workspace.

**Response `200`**
```json
{
  "channels": [
    {
      "id": "uuid",
      "name": "engineering",
      "display_name": "#engineering",
      "position": 2,
      "bot": {
        "id": "uuid",
        "display_name": "Sam (Engineering)",
        "role_key": "backend",
        "avatar_seed": "abc123"
      },
      "unread_count": 3
    }
  ]
}
```

### `GET /api/channels/[channelId]/messages?cursor=&limit=50`
Paginated message history.

**Response `200`**
```json
{
  "messages": [
    {
      "id": "uuid",
      "author_type": "user",
      "author_id": "uuid",
      "content": "Can you review the auth PR?",
      "plan_id": null,
      "created_at": "2026-04-21T10:00:00Z"
    },
    {
      "id": "uuid",
      "author_type": "bot",
      "author_id": "uuid",
      "author_display_name": "Sam (Engineering)",
      "content": "I'll take a look. Here's what I'm planning to do:",
      "plan_id": "uuid",
      "plan": {
        "id": "uuid",
        "description_md": "Review PR #42 and post a code review comment.",
        "status": "pending",
        "github_actions": [
          { "type": "post_pr_comment", "pr_number": 42 }
        ]
      },
      "created_at": "2026-04-21T10:00:05Z"
    }
  ],
  "next_cursor": "2026-04-21T09:30:00Z",
  "has_more": true
}
```

---

## Bot Messaging

### `POST /api/bots/message`
Send a founder message and trigger bot response pipeline.

**Request**
```json
{
  "channel_id": "uuid",
  "content": "Can you check what's blocking the sprint?"
}
```

**Response `202`** (accepted; bot response comes via Realtime)
```json
{
  "message_id": "uuid",
  "bot_responding": true
}
```

**Error `429`** — action cap exceeded
```json
{
  "error": "Your team has used all 50 actions this month. Reset your limit in Settings.",
  "code": "ACTION_CAP_EXCEEDED"
}
```

### `GET /api/bots/stream/[channelId]`
SSE endpoint. Client connects; receives bot typing events and final message.

**Events**
```
event: typing
data: {"bot_id": "uuid", "display_name": "Sam (Engineering)"}

event: chunk
data: {"content": "I'll take a look at the sprint board..."}

event: done
data: {"message_id": "uuid", "plan_id": null}

event: plan_proposed
data: {"plan_id": "uuid", "message_id": "uuid"}
```

---

## Plan Gate

### `POST /api/plans/[planId]/approve`
Founder approves a proposed plan. Triggers execution.

**Request**: No body required.

**Response `200`**
```json
{
  "plan_id": "uuid",
  "status": "approved",
  "execution_started": true
}
```

### `POST /api/plans/[planId]/reject`
Founder rejects a proposed plan.

**Request**
```json
{
  "reason": "Not now — let's wait for QA to finish first."
}
```

**Response `200`**
```json
{
  "plan_id": "uuid",
  "status": "rejected"
}
```

### `GET /api/plans/[planId]`
Get plan status (for polling after approval).

**Response `200`**
```json
{
  "id": "uuid",
  "status": "executed",
  "description_md": "Review PR #42 and post a code review comment.",
  "github_actions": [
    { "type": "post_pr_comment", "pr_number": 42 }
  ],
  "executed_at": "2026-04-21T10:00:30Z",
  "failure_reason": null
}
```

---

## GitHub Integration

### `POST /api/github/webhook`
GitHub App webhook receiver. Called by GitHub, not the client.

**Headers required**
```
X-GitHub-Event: pull_request
X-Hub-Signature-256: sha256=...
```

**Response `200`** — accepted  
**Response `401`** — invalid signature  
**Response `422`** — no matching trigger rule (silently ignored in UI)

### `GET /api/github/connect`
Redirect to GitHub App installation flow.

**Response**: 302 redirect to GitHub App install URL.

### `GET /api/github/callback`
GitHub App post-install callback. Stores `installation_id`.

**Query params**: `installation_id`, `setup_action`  
**Response**: 302 redirect to `/[workspace]/settings?github=connected`

---

## Realtime Subscriptions (Supabase, not REST)

Frontend subscribes directly to Supabase Realtime — no custom WebSocket layer.

| Table | Filter | Events | Used for |
|---|---|---|---|
| `messages` | `channel_id=eq.[id]` | `INSERT` | New messages in open channel |
| `plans` | `id=eq.[planId]` | `UPDATE` | Plan status changes (executed, failed) |
| `workspaces` | `id=eq.[id]` | `UPDATE` | Action counter updates |

---

## Error Codes Reference

| Code | HTTP | Meaning |
|---|---|---|
| `ACTION_CAP_EXCEEDED` | 429 | Workspace has hit its action limit |
| `PLAN_NOT_PENDING` | 409 | Trying to approve/reject a plan that's already been actioned |
| `GITHUB_NOT_CONNECTED` | 400 | Bot tried a GitHub action but no installation exists |
| `BOT_BUSY` | 409 | Bot is already responding in this channel |
| `INVALID_WEBHOOK_SIGNATURE` | 401 | GitHub webhook HMAC check failed |
