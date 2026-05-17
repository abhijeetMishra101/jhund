# Phase 15 — UI Polish: Slack-style Layout + Sidebar Restructure

**Date**: 2026-05-17  
**Authors**: Architect + Product Owner + UX Designer (joint spec)  
**Branch**: `feat/phase-15-ui-polish`  
**Blocked by**: Phase 14 (merged ✅)

---

## Context

Phase 14 shipped threads, DMs, presence, and multi-bot channels. A post-merge review
identified 6 gaps between the implemented UI and the original wireframes/design system.
All 6 are scoped into this phase. No backend schema changes required.

---

## Gaps Being Fixed

| # | Gap | Priority | Files Touched |
|---|-----|----------|---------------|
| 1 | Message layout: chat-bubble style → Slack flat rows | P1 | `MessageBubble.tsx`, `MessageThread.tsx` |
| 2 | Sidebar: no Teammates / Rooms / DMs separation | P1 | `ChannelSidebar.tsx` |
| 3 | "+ Hire teammate" CTA missing from sidebar | P1 | `ChannelSidebar.tsx` |
| 4 | Action cap warning banner missing above input | P2 | `WorkspaceShell.tsx` |
| 5 | Thread reply count always visible (should be hover-only) | P3 | `MessageBubble.tsx` |
| 6 | @mention routing: cross-channel bot not resolved | P3 | `lib/bots/index.ts` (backend PR) |

Gap 6 (@mention routing) ships in a separate backend PR since it touches `lib/bots/index.ts`,
not frontend components. Gaps 1–5 ship together in this PR.

---

## Design Decisions (PO + UX)

### Decision 1: Flat Slack-style messages (Gap 1)

**Agreed**: Abandon chat-bubble layout entirely. Adopt Slack's row model:
- Avatar (32px) on the far left, anchored to the top of the message group
- Sender name (`Inter 600 13px`) + timestamp on the same line, right of avatar
- Message text below name, same left-alignment as name (i.e., `ml-10` from avatar)
- No bubbles, no background fill on message text for normal messages
- User messages: same layout but avatar is "You" initial circle; text left-aligned (NOT right-aligned — Slack convention)
- Bot messages: indigo avatar, system prompt grey
- Hover state on the row: `bg-gray-50` tint, and reveal the thread reply button

This makes the app immediately feel familiar to any Slack user.

**Copy rule**: PO confirmed — no technical language. "You" for user messages stays.

### Decision 2: Sidebar section structure (Gap 2 + 3)

**Agreed** section order (top to bottom):
```
Workspace name header

TEAMMATES
  #ops
  #product
  #engineering
  #design

ROOMS
  #standup
  #retrospective

DIRECT MESSAGES
  [avatar] Riley
  [avatar] Sam

+ Hire teammate        ← NEW: bottom of nav, before action counter
```

**Channel-type routing**:
- `channel_type = 'channel'` → Teammates section
- `channel_type = 'standup' | 'retrospective'` → Rooms section
- `channel_type = 'dm'` → existing DMs list; bots without DMs also shown here

**"+ Hire teammate"**: plain text link at the bottom of the nav, before the action counter.
For now it links to `/w/[slug]/settings` (Hire modal is Phase 16 scope). Label: `+ Hire teammate`.

### Decision 3: Action cap warning banner (Gap 4)

**Agreed**: Show an amber banner between `MessageThread` and `MessageInput` when `pctUsed >= 80`.

```
┌─────────────────────────────────────────────────────┐
│ ⚠  Your team is running low on actions — 42/50 used. │
│    They can still chat, but GitHub actions are        │
│    limited. Reset or upgrade to continue.             │
│                                            [ Reset ]  │
└─────────────────────────────────────────────────────┘
```

When cap is hit (`pctUsed >= 100`):
```
┌─────────────────────────────────────────────────────┐
│ 🔒  Your team has used all 50 actions this month.    │
│    They can still answer questions, but can't        │
│    take GitHub actions until you reset.              │
│                                            [ Reset ]  │
└─────────────────────────────────────────────────────┘
```

**Placement**: rendered in `WorkspaceShell` between `<MessageThread>` and `<MessageInput>`.

### Decision 4: Thread reply count hover-only (Gap 5)

**Agreed**: The `N replies` button on `MessageBubble` should only appear on row hover —
consistent with Slack. The row already has `group` class; use `opacity-0 group-hover:opacity-100`.

---

## Component Specs (UX → Frontend handoff)

### 1. `MessageBubble.tsx` — Full rewrite

**Before**: Speech-bubble layout, user messages right-aligned, bot messages left-aligned.

**After**: Slack-style flat row.

```
┌────────────────────────────────────────────────────────────┐
│ [AV]  BotName          10:32 AM                            │  ← hover reveals timestamp
│       Message text goes here on the next line, left-       │
│       aligned with the sender name.                        │
│                                                            │
│       2 replies  ←  only on row hover                      │
└────────────────────────────────────────────────────────────┘
```

**Props interface** (no changes needed — same as current):
```tsx
interface Props {
  message: MessageWithThread
  botRole?: BotRoleSummary        // { id, display_name, avatar_seed }
  onPlanAction: (planId: string, status: PlanStatus) => void
  onOpenThread?: (message: MessageWithThread) => void
}
```

**Layout structure**:
```tsx
<div className="group flex gap-3 px-4 py-1 hover:bg-gray-50 rounded">
  {/* Avatar column — 36px wide, aligned to top */}
  <div className="shrink-0 w-9 pt-0.5">
    {isUser
      ? <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white">You</div>
      : <BotAvatar seed={avatarSeed} displayName={botName} size="md" />
    }
  </div>

  {/* Content column */}
  <div className="flex-1 min-w-0">
    {/* Name + timestamp row */}
    <div className="flex items-baseline gap-2">
      <span className="text-sm font-semibold text-gray-900">{isUser ? 'You' : botName}</span>
      <span
        className="text-[11px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
        data-testid="message-timestamp"
        onMouseEnter={() => setShowFullTime(true)}
        onMouseLeave={() => setShowFullTime(false)}
      >
        {showFullTime && isOlderThanToday(...) ? formatFull(...) : formatTime(...)}
      </span>
    </div>

    {/* Message text — no bubble, plain */}
    <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap mt-0.5">
      {message.content}
    </p>

    {/* Plan card if any */}
    {message.plan_id && !isUser && <PlanCard ... />}

    {/* Thread link — hover only */}
    {replyCount > 0 && (
      <button
        onClick={() => onOpenThread?.(message)}
        className="mt-1 text-xs text-indigo-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
        data-testid="thread-link"
      >
        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
      </button>
    )}
  </div>
</div>
```

**System messages** (unchanged): centered grey text, no avatar.

**User avatar**: solid `#1164a3` circle with "You" label — no DiceBear for users.

---

### 2. `ChannelSidebar.tsx` — Section split

**New section logic**:
```tsx
const teammateChannels = channels.filter(
  (c) => c.channel_type === 'channel'
)
const roomChannels = channels.filter(
  (c) => c.channel_type === 'standup' || c.channel_type === 'retrospective'
)
const dmChannels = channels.filter((c) => c.channel_type === 'dm')
```

**Section labels**: uppercase, `#868686`, same style as current "Channels" label.

**Rooms section**: same button style as Teammates, but no member avatar row (rooms have
no single "owner" bot). Prefix with `#` as before.

**"+ Hire teammate" link** (add below `</ul>` of the DMs section, before `</nav>`):
```tsx
<div className="px-4 mt-4">
  <Link
    href={`/w/${workspaceSlug}/settings`}
    className="text-sm flex items-center gap-1"
    style={{ color: '#d1d2d3' }}
    data-testid="hire-teammate-link"
    onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
    onMouseLeave={(e) => e.currentTarget.style.color = '#d1d2d3'}
  >
    + Hire teammate
  </Link>
</div>
```

---

### 3. `WorkspaceShell.tsx` — Action cap banner

Add between `<MessageThread ... />` and `<MessageInput ... />`:

```tsx
{pctUsed >= 80 && (
  <div
    className="shrink-0 mx-4 mb-2 rounded-lg px-4 py-2.5 text-sm flex items-start justify-between gap-4"
    style={{
      backgroundColor: pctUsed >= 100 ? '#fef2f2' : '#fffbeb',
      border: `1px solid ${pctUsed >= 100 ? '#fca5a5' : '#fcd34d'}`,
    }}
    data-testid="action-cap-banner"
  >
    <span style={{ color: pctUsed >= 100 ? '#991b1b' : '#92400e' }}>
      {pctUsed >= 100
        ? `🔒 Your team has used all ${actionCap} actions this month. They can still answer questions, but can't take GitHub actions until you reset.`
        : `⚠ Your team is running low — ${actionsUsed}/${actionCap} actions used. They can still chat, but GitHub actions are limited.`
      }
    </span>
    <button
      onClick={resetActionCap}
      className="shrink-0 text-xs font-medium underline"
      style={{ color: pctUsed >= 100 ? '#991b1b' : '#92400e' }}
    >
      Reset
    </button>
  </div>
)}
```

---

## File Change Summary

| File | Change type | Lines Δ |
|------|-------------|---------|
| `app/w/[slug]/components/MessageBubble.tsx` | Full rewrite | ~−20 / +45 |
| `app/w/[slug]/components/ChannelSidebar.tsx` | Section split + hire link | ~+30 |
| `app/w/[slug]/WorkspaceShell.tsx` | Cap banner insertion | ~+20 |

No new files. No DB changes. No API changes. No new dependencies.

---

## PR Checklist

- [ ] `MessageBubble`: flat row layout, no bubbles, user message left-aligned
- [ ] `MessageBubble`: thread link hidden until row hover (`group-hover:opacity-100`)
- [ ] `MessageBubble`: timestamp hidden until row hover (already partially done — verify)
- [ ] `ChannelSidebar`: TEAMMATES / ROOMS / DIRECT MESSAGES section labels
- [ ] `ChannelSidebar`: channel_type routing (standup/retrospective → Rooms)
- [ ] `ChannelSidebar`: "+ Hire teammate" link visible in sidebar nav
- [ ] `WorkspaceShell`: amber banner ≥80%, red banner ≥100% with Reset
- [ ] Tests updated for new `data-testid` shapes
- [ ] typecheck passes
- [ ] coverage stays ≥95%

---

## Out of Scope (Phase 16)

- Hire Teammate modal (the "+ Hire teammate" link goes to settings for now)
- @mention cross-channel bot routing (separate backend PR: `feat/phase-15-mention-routing`)
- Retrospective cron trigger UI
- Settings page implementation
