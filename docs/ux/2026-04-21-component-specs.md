# Component Specifications — Clan MVP

**Date**: 2026-04-21  
**Author**: UX Designer  
**Audience**: Frontend Engineer  
**Status**: Final — approved for implementation

All measurements in px. All tokens reference `design-system.md`.

---

## 1. Top Bar

```
┌────────────────────────────────────────────────────────────────┐
│  CLAN   Acme Inc                     12 / 50 actions   [?]   │
│  16px    13px                         11px               20px  │
└────────────────────────────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Height | 48px |
| Background | `--color-sidebar-bg` (`#1A1D21`) — continuous with sidebar |
| Border-bottom | `1px solid --color-sidebar-divider` |
| Padding | `0 16px` |
| Layout | `flex`, `align-items: center`, `justify-content: space-between` |

**Left slot**:
- Logo mark: "CLAN" in Inter 600, 16px, `#FFFFFF`, letter-spacing 0.08em
- Separator: `1px solid --color-sidebar-divider`, height 16px, margin `0 12px`
- Workspace name: Inter 400, 13px, `--color-sidebar-text`

**Right slot**:
- Action counter (see component below)
- Help icon: `HelpCircle` 20px, `--color-sidebar-text`, 8px left margin

---

## 2. Action Counter (Top Bar)

```
  ⚡ 12 / 50 actions used
```

| State | Icon | Text colour | Background |
|---|---|---|---|
| Normal (< 50%) | `Zap` (grey) | `--color-sidebar-text` | transparent |
| Caution (50–79%) | `Zap` (amber) | `--color-warning` | transparent |
| Warning (80–99%) | `AlertTriangle` (amber) | `--color-warning` | `rgba(217,119,6,0.12)` |
| Cap hit (100%) | `Lock` (red) | `--color-error` | `rgba(220,38,38,0.12)` |

| Property | Value |
|---|---|
| Font | Inter 500, 11px, uppercase, letter-spacing 0.04em |
| Padding | `4px 8px` |
| Border-radius | `radius-sm` (4px) |
| Cursor | `pointer` (opens usage tooltip on click) |
| Icon size | 14px, `stroke-width: 2` |
| Gap (icon → text) | 4px |

Tooltip (on click/hover):  
`"Every time a teammate does something in GitHub, it uses one action. Resets when you ask."`  
Max-width 220px, `--shadow-overlay`, `border-radius: radius-md`.

---

## 3. Sidebar

```
┌──────────────────────┐
│  Acme Inc            │  ← 40px row, Inter 600, 15px, #FFFFFF, px-16
├──────────────────────┤
│  Teammates           │  ← 11px, 500, uppercase, muted, px-16, pt-20 pb-4
│                      │
│  # ops            ●  │  ← active: bg #27292D, white text
│  # product           │
│  # engineering   3   │  ← unread badge
│  # design            │
│  # standup           │
│                      │
│  Rooms               │  ← same label style
│                      │
│  # standup           │
│  # retrospective     │
│                      │
│  + Hire teammate     │  ← Inter 400, 13px, muted, hover: white
└──────────────────────┘
```

**Sidebar container**:

| Property | Value |
|---|---|
| Width | 240px (fixed, no resize in MVP) |
| Background | `#1A1D21` |
| Padding | `0` |
| Border-right | none (top bar colour is continuous) |
| Overflow-y | `auto` (custom scrollbar: 4px, `#3E4146`, `border-radius: full`) |

**Workspace name row**:

| Property | Value |
|---|---|
| Height | 40px |
| Padding | `0 16px` |
| Font | Inter 600, 15px, `#FFFFFF` |
| Border-bottom | `1px solid --color-sidebar-divider` |
| Margin-bottom | 8px |

**Section label** ("Teammates", "Rooms"):

| Property | Value |
|---|---|
| Font | Inter 500, 11px, uppercase, letter-spacing 0.06em |
| Colour | `--color-sidebar-text` at 60% opacity (`#C9D1D9` → `rgba(201,209,217,0.6)`) |
| Padding | `20px 16px 4px` |

**Channel row**:

| Property | Value |
|---|---|
| Height | 28px |
| Padding | `0 16px` |
| Border-radius | 6px (applied `mx-8`) |
| Font | Inter 400, 14px |
| Default colour | `--color-sidebar-text` (`#C9D1D9`) |
| Hover | background `#27292D`, colour `#FFFFFF` |
| Active | background `#27292D`, colour `#FFFFFF`, font-weight 600 |
| Transition | background 80ms ease |

**Hash prefix (`#`)**:  
Displayed as text character, `margin-right: 4px`, same colour.

**Unread dot** (no count):  
8px circle, `background: --color-sidebar-badge` (`#E01E5A`), `margin-left: auto`.

**Unread count badge** (> 1):  
Pill shape, `background: --color-sidebar-badge`, `color: #FFFFFF`,  
`font: Inter 500 11px`, `padding: 0 5px`, `height: 18px`, `border-radius: full`, `margin-left: auto`.

**Hire teammate row**:

| Property | Value |
|---|---|
| Margin-top | `auto` (pinned to bottom of sidebar) |
| Padding | `16px 16px` |
| Font | Inter 400, 13px, `--color-sidebar-text` |
| Hover | colour `#FFFFFF` |
| Icon | `Plus` 14px, `margin-right: 6px` |
| Border-top | `1px solid --color-sidebar-divider` |

---

## 4. Message Thread

**Thread container**:

| Property | Value |
|---|---|
| Padding | `24px 24px 0 24px` |
| Display | `flex flex-col gap-1` |
| Overflow-y | `scroll` |
| Scroll behaviour | new messages scroll to bottom; preserve position if user has scrolled up |

**Channel header** (above thread):

| Property | Value |
|---|---|
| Height | 48px |
| Border-bottom | `1px solid --color-border` |
| Padding | `0 24px` |
| Font | Inter 600, 18px, `--text-default` |
| Layout | `flex align-items-center` |
| Hash character | `--text-soft`, margin-right 2px |

---

## 5. Message Row

```
┌────────────────────────────────────────────────────────┐
│ [avatar]  Author name  10:32 AM                        │
│           Message text here. Can be multi-line.        │
│           Wraps at the container width.                │
└────────────────────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Layout | `flex`, `gap: 12px`, `padding: 8px 0` |
| Hover background | `--color-canvas-subtle` (`#F7F8FA`), full width, `margin: 0 -24px`, `padding: 8px 24px` |
| Transition | background 60ms ease |

**Avatar slot**: 36px × 36px, `flex-shrink: 0`, `border-radius: full`

**Content column**: `flex-1`, `min-width: 0`

**Author line**:
- Author name: Inter 600, 15px, `--text-default`
- Timestamp: Inter 400, 11px, `--text-muted`, `margin-left: 8px`

**Message body**:
- Font: Inter 400, 15px, `--text-default`, line-height 22px
- Links: `--color-primary`, underline on hover
- `pre`/`code`: `background: #F3F4F6`, `border-radius: radius-sm`, `padding: 1px 4px`, `font-family: 'JetBrains Mono', monospace`, `font-size: 13px`
- Code blocks: `background: #F3F4F6`, `border-radius: radius-md`, `padding: 12px 16px`, `font-size: 13px`

**Consecutive messages** (same author within 5 mins):  
Omit avatar and author line. Show only body, `padding-left: 48px` (aligns under previous message body).

**System messages** (e.g. GitHub trigger):
- No avatar; full-width
- Font: Inter 400, 13px, `--text-soft`
- Background: transparent
- Icon left: 16px, colour matches event type

---

## 6. Bot Typing Indicator

Shows immediately after founder sends a message, before bot stream begins.

```
[avatar]  Sam (Engineering)
          ●●●
```

| Property | Value |
|---|---|
| Layout | Same as message row |
| Dots | 3 circles, 6px, `background: --text-muted` |
| Animation | staggered scale pulse (0→1→0), 600ms loop, 200ms stagger between dots |

Remove indicator as soon as first chunk arrives in SSE stream.

---

## 7. Plan Card (Inline)

Appears as a child of the bot's message row, below the message body.

```
  ╔══════════════════════════════════════════════╗
  ║  📋 Sam's plan                               ║
  ║                                              ║
  ║  Review PR #42 and leave a comment with      ║
  ║  my findings.                                ║
  ║                                              ║
  ║  [  Approve  ]     [  Not now  ]             ║
  ╚══════════════════════════════════════════════╝
```

| Property | Value |
|---|---|
| Margin-top | 8px (below bot message body) |
| Margin-left | 48px (aligned under message body, not avatar) |
| Background | `--color-plan-bg` (`#F5F3FF`) |
| Border | `1px solid rgba(79,70,229,0.2)` |
| Border-left | `3px solid --color-plan-border` (`#4F46E5`) |
| Border-radius | `radius-lg` (8px) |
| Padding | `16px` |
| Max-width | 480px |

**Header line**:
- Icon: 📋 (emoji) 15px, `margin-right: 6px`
- Text: Inter 600, 14px, `--color-primary`

**Body text**:
- Font: Inter 400, 14px, `--text-default`, `margin-top: 8px`

**Button row**: `margin-top: 16px`, `display: flex`, `gap: 8px`

**Approve button** (primary):

| Property | Value |
|---|---|
| Background | `--color-primary` |
| Colour | `#FFFFFF` |
| Font | Inter 500, 14px |
| Padding | `8px 16px` |
| Border-radius | `radius-md` |
| Hover | `--color-primary-hover` |
| Active | scale 0.98 |

**Not now button** (secondary):

| Property | Value |
|---|---|
| Background | transparent |
| Colour | `--text-soft` |
| Font | Inter 400, 14px |
| Padding | `8px 16px` |
| Border | `1px solid --border-default` |
| Border-radius | `radius-md` |
| Hover | background `--color-canvas-subtle` |

**Executed state**:

```
  ╔══════════════════════════════════════════════╗
  ║  ✓  Sam reviewed PR #42                      ║
  ║     Comment posted · just now                ║
  ╚══════════════════════════════════════════════╝
```

| Property | Value |
|---|---|
| Background | `--color-success-subtle` (`#ECFDF5`) |
| Border-left | `3px solid --color-success` |
| Border | `1px solid rgba(5,150,105,0.2)` |
| Check icon | `CheckCircle` 16px, `--color-success` |
| Title | Inter 600, 14px, `--color-success` |
| Sub-text | Inter 400, 13px, `--text-soft` |

**Failed state**:

| Property | Value |
|---|---|
| Background | `--color-error-subtle` |
| Border-left | `3px solid --color-error` |
| Icon | `XCircle` 16px, `--color-error` |
| Title | Inter 600, 14px, `--color-error` |

**Loading state** (approved, executing):

```
  ╔══════════════════════════════════════════════╗
  ║  ⟳  Sam is working on it...                  ║
  ╚══════════════════════════════════════════════╝
```

- Spinner: CSS border-spin, 16px, `--color-primary`
- Text: Inter 400, 14px, `--text-soft`

---

## 8. Message Input

```
┌──────────────────────────────────────────────────────────────┐
│  Message Sam...                                              │
└──────────────────────────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Container padding | `12px 24px 16px` |
| Border-top | `1px solid --border-default` |
| Background | `--bg-page` |

**Input field**:

| Property | Value |
|---|---|
| Width | `100%` |
| Min-height | 44px |
| Max-height | 200px (auto-grows) |
| Padding | `11px 16px` |
| Background | `--color-canvas-subtle` |
| Border | `1px solid --border-default` |
| Border-radius | `radius-lg` (8px) |
| Font | Inter 400, 15px, `--text-default` |
| Placeholder | `--text-muted` |
| Focus | `border-color: --color-primary`, `box-shadow: 0 0 0 3px rgba(79,70,229,0.12)` |
| Outline | none |

**Send action**: Enter key (Shift+Enter = newline). No send button in MVP.

**Locked state** (action cap hit):
- Cursor: `not-allowed`
- Background: `#F3F4F6`
- Placeholder changed to: `"Ask a question (actions are paused — reset to unlock)"`
- Typing still enabled (questions allowed); only plan execution blocked at API level

---

## 9. Plan Approval Modal

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Sam is about to do something                           [  ×  ]│
│  Inter 600, 20px                                                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Here's exactly what will happen:                               │
│  Inter 400, 14px, --text-soft                                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1.  Open PR #42 and read all the changed files.        │   │
│  │                                                         │   │
│  │  2.  Leave a comment on the PR with a summary of        │   │
│  │      what looks good and what needs attention.          │   │
│  │                                                         │   │
│  │  3.  No code will be changed.                           │   │
│  │                                                         │   │
│  │  4.  This will create a draft for your review —         │   │
│  │      nothing is final until you merge it.               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  This will use  1 action  (12 used of 50 this month).           │
│  Inter 400, 13px, --text-soft                                   │
│  "1 action": Inter 600, 13px, --text-default                    │
│                                                                 │
│  ┌──────────────────────────┐   ┌──────────────────────────┐   │
│  │  Yes, go ahead           │   │  Not now                 │   │
│  └──────────────────────────┘   └──────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Overlay**: `position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.48)`, `backdrop-filter: blur(2px)`

**Modal panel**:

| Property | Value |
|---|---|
| Width | min(480px, calc(100vw - 32px)) |
| Background | `#FFFFFF` |
| Border-radius | `radius-xl` (12px) |
| Box-shadow | `--shadow-lg` |
| Position | centred in overlay |
| Animation | 180ms ease-out, scale 0.97→1 + opacity 0→1 |

**Header**:

| Property | Value |
|---|---|
| Padding | `24px 24px 20px` |
| Border-bottom | `1px solid --border-default` |
| Layout | `flex justify-between align-items-start` |
| Title | Inter 600, 20px, `--text-default` |
| Close button | `X` icon 20px, `--text-muted`, hover `--text-default`, `border-radius: radius-sm`, `padding: 4px` |

**Body**:

| Property | Value |
|---|---|
| Padding | `20px 24px` |

**Intro text**: Inter 400, 14px, `--text-soft`, margin-bottom 12px

**Action list box**:

| Property | Value |
|---|---|
| Background | `--color-canvas-subtle` |
| Border | `1px solid --border-default` |
| Border-radius | `radius-md` |
| Padding | `16px` |
| List style | none; items use manual numbering |
| Item font | Inter 400, 14px, `--text-default`, line-height 22px |
| Item gap | `margin-bottom: 10px` (last: 0) |
| Number prefix | Inter 600, 14px, `--color-primary`, `min-width: 20px` |

**Action cost line**: margin-top 16px, Inter 400, 13px, `--text-soft`

**Footer**:

| Property | Value |
|---|---|
| Padding | `0 24px 24px` |
| Layout | `flex gap-3` |

**"Yes, go ahead"** button:

| Property | Value |
|---|---|
| Background | `--color-primary` |
| Colour | `#FFFFFF` |
| Font | Inter 500, 14px |
| Padding | `10px 20px` |
| Border-radius | `radius-md` |
| Flex | 1 (takes more width) |
| Hover | `--color-primary-hover` |

**"Not now"** button:

| Property | Value |
|---|---|
| Background | transparent |
| Colour | `--text-soft` |
| Border | `1px solid --border-default` |
| Font | Inter 400, 14px |
| Padding | `10px 20px` |
| Border-radius | `radius-md` |

---

## 10. Hire Teammate Modal

Same overlay spec as Plan Approval Modal.

**Panel width**: min(560px, calc(100vw - 32px))

**Role grid**: `display: grid`, `grid-template-columns: repeat(3, 1fr)`, `gap: 8px`, `margin: 16px 0`

**Role card**:

| Property | Value |
|---|---|
| Padding | `16px` |
| Border | `1px solid --border-default` |
| Border-radius | `radius-lg` |
| Background | `#FFFFFF` |
| Cursor | `pointer` |
| Hover | `border-color: --color-primary`, `background: --color-primary-subtle` |
| Selected | `border-color: --color-primary` (2px), `background: --color-primary-subtle` |
| Already-hired | `opacity: 0.5`, `cursor: not-allowed`, no hover |

Role card content:
- Role name: Inter 600, 14px, `--text-default`
- Description: Inter 400, 12px, `--text-soft`, margin-top 4px
- "✓ Already hired" badge: Inter 500, 11px, `--color-success`, background `--color-success-subtle`, `padding: 2px 6px`, `border-radius: radius-sm`

**Tool disclosure section** (appears after role is selected):

| Property | Value |
|---|---|
| Margin-top | `20px` |
| Border-top | `1px solid --border-default` |
| Padding-top | `16px` |
| Visibility | Hidden until a role card is selected; animates in (opacity 0→1, 120ms) |

**Section heading**: Inter 500, 13px, `--text-default`, margin-bottom 10px  
Copy: `"What [Role] needs to work:"`

**Tool row**:

| Property | Value |
|---|---|
| Layout | `flex`, `align-items: center`, `gap: 8px` |
| Height | 28px |
| Font | Inter 400, 13px, `--text-default` |

**Status dot**:
- Connected: 8px circle, `background: --color-success` (`#059669`), `flex-shrink: 0`
- Not connected: 8px circle, `background: --border-strong`, `flex-shrink: 0`

**"Connect in Settings →"** link:
- Inter 400, 13px, `--color-primary`
- Opens Settings tab in new tab — does NOT block the hire flow
- Shown only for not-connected tools

**"Ready"** label (connected tool):
- Inter 400, 13px, `--color-success`

**Degraded mode note**:
- Margin-top: 10px
- Font: Inter 400, 12px, `--text-muted`
- Copy: `"Your teammate works without these — connected tools just unlock more of what they can do."`

**Name input**: full-width, same spec as message input (no auto-grow; single line), `margin-top: 16px`

**Label**: Inter 500, 13px, `--text-default`, `margin-bottom: 6px`

**CTA**: Full-width, same spec as Approve button, `margin-top: 20px`

---

## 11. Onboarding Screens

**Shell**: `min-height: 100vh`, `display: flex`, `align-items: center`, `justify-content: center`, `background: --bg-page`

**Card**: `width: 480px`, `padding: 48px`, no border/shadow in onboarding — open layout.

**Progress dots**:

| State | Appearance |
|---|---|
| Complete | 8px circle, `--color-primary` |
| Current | 8px circle, `--color-primary` + `box-shadow: 0 0 0 3px rgba(79,70,229,0.2)` |
| Upcoming | 8px circle, `--border-strong` |

Dot gap: 8px. Margin-bottom: 32px.

**Step label**: `position: absolute`, `right: 0`, Inter 400, 13px, `--text-muted`, aligned to dot row.

**Heading**: Inter 600, 24px, `--text-default`, margin-bottom 8px

**Helper text**: Inter 400, 14px, `--text-soft`, margin-bottom 24px

**Text input** (onboarding): same as message input spec but `background: #FFFFFF`, `border: 1px solid --border-strong`

**Progress dots**: 5 dots total (Steps 1–5). Step label reads "Step N/5".

**Template cards**: `display: grid`, `grid-template-columns: repeat(2, 1fr)` for Startup + Enterprise; Blank takes full row.

Template card:

| Property | Value |
|---|---|
| Padding | `20px` |
| Border | `1px solid --border-default` |
| Border-radius | `radius-lg` |
| Cursor | `pointer` |
| Hover | `border-color: --color-primary` |
| Selected | `border: 2px solid --color-primary`, `background: --color-primary-subtle` |

**Working Style cards** (Step 3 — full-width stacked):

| Property | Value |
|---|---|
| Display | `flex flex-col gap-8` (stacked vertically, not grid) |
| Card padding | `20px` |
| Card border | `1px solid --border-default` |
| Card border-radius | `radius-lg` |
| Cursor | `pointer` |
| Hover | `border-color: --color-primary` |
| Selected | `border: 2px solid --color-primary`, `background: --color-primary-subtle` |

**Working Style card layout**:
- Header row: `flex justify-between align-items-center`
  - Left: emoji icon + Inter 600 15px `--text-default` role name
  - Right: "Recommended" badge (Balanced only) — `background: --color-primary-subtle`, `color: --color-primary`, Inter 500 11px, `padding: 2px 8px`, `border-radius: radius-sm`
- Description: Inter 400, 14px, `--text-soft`, margin-top 6px, line-height 20px

**Default selection**: Balanced pre-selected on mount. Radio-button semantics — exactly one always selected.

**Back link**: Inter 400, 14px, `--color-primary`, hover underline, margin-right auto

**Continue button**: `min-width: 140px`, right-aligned (or full-width on mobile), same as Approve button spec

---

## 12. Action Cap Banners

**Warning banner** (≥ 80%):

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠  Your team is running low — 42 of 50 actions used.       │
│     [Manage limit]                                          │
└─────────────────────────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Background | `--color-warning-subtle` |
| Border | `1px solid rgba(217,119,6,0.3)` |
| Border-left | `3px solid --color-warning` |
| Border-radius | `radius-md` |
| Padding | `12px 16px` |
| Margin | `0 24px 12px` (above input area) |
| Font | Inter 400, 13px, `--text-default` |
| Icon | `AlertTriangle` 16px, `--color-warning`, margin-right 8px |
| CTA link | Inter 500, 13px, `--color-warning`, underline, inline |

**Cap hit banner**:

Same structure, replace colours:
- Background: `--color-error-subtle`
- Border-left: `3px solid --color-error`
- Icon: `Lock` 16px, `--color-error`
- CTA text: "Reset limit"

---

## 13. Empty State (New Channel)

Displayed when `messages.length === 0` in a channel — renders the bot's intro message as if it's a normal bot message. No special layout needed; just a standard bot message row with the intro copy from the copy doc.

Do not show a placeholder illustration. The bot's first message IS the empty state.

---

## 14. Settings — Team Rules Screen

**Settings shell**: Full workspace layout (sidebar + main area). Top bar stays visible with action counter.

**Tab bar** (Integrations / Working Style / Team Rules):

| Property | Value |
|---|---|
| Layout | `flex`, `gap: 0`, border-bottom `1px solid --border-default` |
| Tab height | 40px |
| Tab padding | `0 16px` |
| Active tab | border-bottom `2px solid --color-primary`, Inter 600 14px, `--text-default` |
| Inactive tab | Inter 400 14px, `--text-soft`, hover `--text-default` |

**Page heading**: Inter 600, 24px, `--text-default`, margin-bottom 24px. Copy: `"Team Rules"`

**Sub-heading**: Inter 400, 14px, `--text-soft`, margin-bottom 32px. Copy: `"Rules your team follows. Locked rules keep your team working safely — adjustable rules are yours to configure."`

---

### 14a. Locked Rules Card

| Property | Value |
|---|---|
| Background | `--color-canvas-subtle` |
| Border | `1px solid --border-default` |
| Border-radius | `radius-lg` |
| Padding | `20px` |
| Margin-bottom | `24px` |

**Card header**:
- Lock icon: `Lock` 16px, `--text-muted`, margin-right 6px
- Heading text: Inter 600, 14px, `--text-default`
- Copy: `"Rules your team always follows"`
- Sub-text: Inter 400, 13px, `--text-soft`, margin-top 4px
- Copy: `"These are locked — they protect how your team works."`

**Locked rule row**:

| Property | Value |
|---|---|
| Layout | `flex`, `align-items: flex-start`, `gap: 12px`, `padding: 10px 0` |
| Border-bottom | `1px solid --border-default` (last row: none) |

- Checkbox: 16px square, always checked, `opacity: 0.5`, `cursor: not-allowed`, `--color-primary` fill
- Label: Inter 400, 14px, `--text-default`, line-height 20px
- Tooltip on hover entire row: "This rule can't be changed — it protects how your team works."

**6 locked rules** (from copy doc `settings.rules.locked.*`):
1. Every feature starts with documented use cases
2. QA signs off before anything ships
3. Tests required on every change
4. Automated checks must pass before merging
5. Test coverage can never decrease
6. Deployment pipeline set up before first feature ships

---

### 14b. Adjustable Rules Card

| Property | Value |
|---|---|
| Background | `#FFFFFF` |
| Border | `1px solid --border-default` |
| Border-radius | `radius-lg` |
| Padding | `20px` |
| Margin-bottom | `24px` |

**Card heading**: Inter 600, 14px, `--text-default`. Copy: `"Rules you can adjust"`

**Category group**:
- Category label: Inter 500, 12px, uppercase, letter-spacing 0.06em, `--text-muted`, margin-bottom 8px, margin-top 20px (first: margin-top 16px)
- Divider: `1px solid --border-default` between category groups

**Toggle row**:

| Property | Value |
|---|---|
| Layout | `flex`, `justify-content: space-between`, `align-items: center` |
| Height | 40px |

- Label: Inter 400, 14px, `--text-default`
- Toggle: 36px × 20px pill; thumb 16px circle; `transition: all 200ms ease`
  - On: background `--color-primary`, thumb position right
  - Off: background `--border-strong`, thumb position left
- Toggle save: immediate (no submit button); debounced 300ms PATCH to API

**Adjustable rules** (initial values from copy doc `settings.rules.adjustable.*`):

Code quality category:
- No direct pushes to main (default: on)
- Require code review approval (default: on)
- Require two reviewers (default: off)

Communication category:
- Daily standup updates (default: on)
- Weekly retrospective (default: off)

---

### 14c. Custom Rule Input

| Property | Value |
|---|---|
| Margin-top | `8px` |
| Label | Inter 500, 13px, `--text-default`, "Add a custom rule (optional)" |

**Input field**: Single-line text input, full-width. Same spec as onboarding text input.  
Placeholder: `"e.g. Always write a summary comment on every PR"`

**Character counter** (shown when `length >= 100`):
- Inline, right-aligned below input
- Font: Inter 400, 12px, `--text-muted`
- At limit (140): colour switches to `--color-error`
- Copy: `"[n] / 140"`

**Save button**:
- Disabled state: `opacity: 0.5`, `cursor: not-allowed` — when input empty or unchanged
- Enabled state: same as Approve button, min-width 80px
- Positioned right of input: `display: flex`, `gap: 8px`, `align-items: flex-end`
- POST saves; on success: button text briefly changes to "Saved ✓" for 1.5s then resets

**Limit**: One custom rule per workspace. If one exists, show current rule as pre-filled value; Save becomes "Update".

---

## 15. Feasibility Review Escalation Card

Rendered as a child of Riley's message in #ops. Same DOM position as Plan Card (Section 7) — below the bot message body, margin-left 48px.

### Minor flag card (informational, auto-resolved)

| Property | Value |
|---|---|
| Background | `--color-success-subtle` (`#ECFDF5`) |
| Border | `1px solid rgba(5,150,105,0.2)` |
| Border-left | `3px solid --color-success` |
| Border-radius | `radius-lg` (8px) |
| Padding | `16px` |
| Max-width | 480px |

**Header**: `CheckCircle` 16px `--color-success`, margin-right 6px. Inter 600 14px `--color-success`. Copy: `"Design sorted it"`  
**Body**: Inter 400, 13px, `--text-soft`, margin-top 6px. Copy: e.g. `"Missing screen added · no action needed"`  
No buttons — informational only.

### Major flag card (founder decision required)

| Property | Value |
|---|---|
| Background | `--color-warning-subtle` (`#FFFBEB`) |
| Border | `1px solid rgba(217,119,6,0.2)` |
| Border-left | `3px solid --color-warning` (`#D97706`) |
| Border-radius | `radius-lg` (8px) |
| Padding | `16px` |
| Max-width | 480px |

**Header**: `AlertTriangle` 16px `--color-warning`, margin-right 6px. Inter 600 14px `--text-default`. Copy: `"[Role] needs your input"`  
**Summary line**: Inter 400, 14px, `--text-default`, margin-top 8px — one plain-English sentence describing the issue.  
**Options list**: `ul`, no bullets; Inter 400, 13px, `--text-soft`; each option prefixed with `·`, margin-left 8px; margin-top 8px.

**Button row**: `margin-top: 16px`, `display: flex`, `gap: 8px`

**"Fix it"** (primary): same spec as Approve button  
**"Skip this step"** (secondary): same spec as Not Now button — on click, shows inline tooltip:  
`"Skipping this removes [feature]. Are you sure?"` with `[ Yes, skip ]` + `[ Cancel ]` as inline micro-confirm (not a modal).

### Blocker card (build cannot start)

Same structure as major flag. Replace colours:
- Background: `--color-error-subtle`
- Border-left: `3px solid --color-error`
- Icon: `XOctagon` 16px, `--color-error`
- Header copy: `"This needs to be fixed before we can start building"`
- One CTA only: `"Let's fix this"` (primary, full-width in button row)

---

## Responsive Breakpoints

MVP is desktop-first. Mobile is deferred post-launch.

| Breakpoint | Behaviour |
|---|---|
| ≥ 1024px | Full layout (sidebar + message area) |
| 768–1023px | Sidebar hidden; accessible via hamburger icon (top-left) |
| < 768px | Out of scope for MVP — show "best on desktop" message |

---

## Accessibility Minimums (MVP)

| Requirement | Implementation |
|---|---|
| Colour contrast | All text/background pairs must meet WCAG AA (4.5:1 for body, 3:1 for large) |
| Focus rings | All interactive elements: `outline: 2px solid --color-primary`, `outline-offset: 2px`, never `outline: none` without replacement |
| Modal focus trap | Focus locked inside modal when open; restored to trigger on close |
| Keyboard navigation | Tab order follows visual order; Enter/Space activate buttons |
| ARIA labels | Icon-only buttons must have `aria-label`; modals use `role="dialog"` + `aria-labelledby` |
| Reduced motion | All CSS animations wrapped in `@media (prefers-reduced-motion: no-preference)` |
