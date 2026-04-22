# Wireframes — Clan MVP

**Date**: 2026-04-21  
**Author**: UX Designer  
**Audience**: Frontend Engineer  
**Status**: Approved for build

---

## Screen Inventory

1. [Welcome / Sign Up](#1-welcome--sign-up)
2. [Onboarding — Step 1: Name your company](#2-onboarding-step-1-name-your-company)
3. [Onboarding — Step 2: Pick a team template](#3-onboarding-step-2-pick-a-team-template)
4. [Onboarding — Step 3: How do you like to work?](#4-onboarding-step-3-how-do-you-like-to-work)
5. [Onboarding — Step 4: Connect GitHub](#5-onboarding-step-4-connect-github)
6. [Onboarding — Step 5: Meet your team](#6-onboarding-step-5-meet-your-team)
7. [Main Workspace — Channel View](#7-main-workspace--channel-view)
8. [Plan Approval Modal](#8-plan-approval-modal)
9. [Hire Teammate Modal](#9-hire-teammate-modal)
10. [Action Cap Warning](#10-action-cap-warning)
11. [Empty State — New Channel](#11-empty-state--new-channel)
12. [Settings — Team Rules](#12-settings--team-rules)
13. [Feasibility Review Escalation (Ops Channel)](#13-feasibility-review-escalation-ops-channel)

---

## 1. Welcome / Sign Up

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                       CLAN                                 │
│                                                             │
│            Your AI team. Ready to ship.                     │
│                                                             │
│         ┌───────────────────────────────────┐               │
│         │  your@email.com                   │               │
│         └───────────────────────────────────┘               │
│                                                             │
│         ┌───────────────────────────────────┐               │
│         │     Send me a sign-in link        │               │
│         └───────────────────────────────────┘               │
│                                                             │
│         No password needed.                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Components**: Logo mark, email input, CTA button, micro-copy  
**Notes**: Full-bleed centered layout. No nav. No social login (reduces friction for non-technical founders).

---

## 2. Onboarding Step 1: Name your company

Progress: ● ○ ○ ○ ○

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ● ○ ○ ○ ○                                         Step 1/5 │
│                                                             │
│  What's your company called?                                │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Acme Inc                                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  This is how your team will know who they're working for.   │
│                                                             │
│                          ┌──────────────┐                   │
│                          │  Continue →  │                   │
│                          └──────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Components**: Progress dots, heading, text input, helper text, CTA  
**Validation**: Non-empty, max 50 chars. No error shown until blur.

---

## 3. Onboarding Step 2: Pick a team template

Progress: ● ● ○ ○ ○

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ● ● ○ ○ ○                                         Step 2/5 │
│                                                             │
│  Who do you want on your team?                              │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │  🚀 Startup         │  │  🏢 Enterprise       │           │
│  │                     │  │                     │           │
│  │  Product            │  │  Product            │           │
│  │  Engineering        │  │  Engineering        │           │
│  │  Design             │  │  Design             │           │
│  │                     │  │  Security           │           │
│  │  4 teammates        │  │  QA                 │           │
│  │                     │  │  7 teammates        │           │
│  │  ← Most popular     │  │                     │           │
│  └─────────────────────┘  └─────────────────────┘           │
│                                                             │
│  ┌─────────────────────┐                                     │
│  │  ✦ Start blank      │                                     │
│  │                     │                                     │
│  │  Just Ops. Hire      │                                     │
│  │  as you need.       │                                     │
│  └─────────────────────┘                                     │
│                                                             │
│  You can add or remove teammates any time.                  │
│                                                             │
│             ← Back    ┌──────────────┐                       │
│                       │  Continue →  │                       │
│                       └──────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Components**: Progress dots, 3 template cards (selectable), back link, CTA  
**Interaction**: Card tap/click = select (highlighted border). One selection required to enable Continue.

---

## 4. Onboarding Step 3: How do you like to work?

Progress: ● ● ● ○ ○

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ● ● ● ○ ○                                         Step 3/5 │
│                                                             │
│  How do you like to work?                                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🤝 Hands-off                                          │  │
│  │                                                       │  │
│  │  Your team runs automatically. You'll only hear       │  │
│  │  from them when something needs your decision.        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ⚖ Balanced                               Recommended  │  │
│  │                                                       │  │
│  │  Your team checks in for anything                     │  │
│  │  significant. Day-to-day work flows on its own.       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🔍 Hands-on                                           │  │
│  │                                                       │  │
│  │  You approve every step before your team              │  │
│  │  moves forward. Full visibility, full control.        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  You can change this any time in Settings.                  │
│                                                             │
│          ← Back        ┌──────────────┐                     │
│                        │  Continue →  │                     │
│                        └──────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Components**: Progress dots (5), heading, 3 working-style cards (full-width stacked), helper text, back link, CTA  
**Interaction**: Card tap/click = select (highlighted border). Balanced pre-selected by default. One selection always active — never deselectable to empty.  
**Recommended badge**: Inline pill, right-aligned in card header row, `--color-primary-subtle`, Inter 500 11px.  
**Card layout**: Full-width stacked (not grid) — all three always visible, no scroll.

---

## 5. Onboarding Step 4: Connect GitHub

Progress: ● ● ● ● ○

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ● ● ● ● ○                                         Step 4/5 │
│                                                             │
│  Connect your codebase                                      │
│                                                             │
│  Your team needs access to your GitHub repo to do           │
│  their jobs — reviewing code, raising tasks, and           │
│  spotting issues automatically.                             │
│                                                             │
│         ┌───────────────────────────────────┐               │
│         │  🐙  Connect GitHub               │               │
│         └───────────────────────────────────┘               │
│                                                             │
│  ─────────────── or ───────────────                         │
│                                                             │
│         Skip for now (you can add this later)               │
│                                                             │
│  ← Back                                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Post-connection state** (after GitHub redirect back):

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ● ● ● ● ○                                         Step 4/5 │
│                                                             │
│  Connect your codebase                                      │
│                                                             │
│         ✓  acme/backend connected                           │
│                                                             │
│                          ┌──────────────┐                   │
│                          │  Continue →  │                   │
│                          └──────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Onboarding Step 5: Meet your team

Progress: ● ● ● ● ●

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ● ● ● ● ●                                         Step 5/5 │
│                                                             │
│  Say hello to your team                                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │  [OPS]  Hey! I'm Riley, your team coordinator.      │   │
│  │                                                      │   │
│  │         Your team is ready. Here's who you've       │   │
│  │         hired:                                       │   │
│  │                                                      │   │
│  │         • Alex  — Product (#product)                │   │
│  │         • Sam   — Engineering (#engineering)        │   │
│  │         • Jordan — Design (#design)                 │   │
│  │                                                      │   │
│  │         Head to any channel to start a              │   │
│  │         conversation. I'll be right here in #ops    │   │
│  │         if you need anything.                       │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│                    ┌──────────────────────┐                  │
│                    │  Go to my workspace  │                  │
│                    └──────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Notes**: Bot message uses real bot names seeded in previous step. This is the first message in #ops.

---

## 7. Main Workspace — Channel View

```
┌──────────────────────────────────────────────────────────────────┐
│  CLAN                            12 / 50 actions used    [?]   │
├──────────────────────────────────────────────────────────────────┤
│                   │                                              │
│  Acme Inc         │  #engineering                                │
│                   │                                              │
│  ─── Teammates ── │  ┌────────────────────────────────────────┐  │
│                   │  │                                        │  │
│  #ops         ●   │  │  [SAM]  Hey! Ready to take a look at   │  │
│  #product         │  │         the sprint. What's on your     │  │
│  #engineering  3  │  │         mind?                          │  │
│  #design          │  │                                        │  │
│  #standup         │  │  [YOU]  Can you review PR #42?         │  │
│                   │  │                                        │  │
│  ─── Rooms ────── │  │  [SAM]  On it. Here's what I'm         │  │
│                   │  │         planning to do:                │  │
│  #standup         │  │                                        │  │
│  #retrospective   │  │  ╔══════════════════════════════════╗  │  │
│                   │  │  ║  📋 Sam's plan                   ║  │  │
│  + Hire teammate  │  │  ║                                  ║  │  │
│                   │  │  ║  Review PR #42 and leave a       ║  │  │
│                   │  │  ║  comment with my findings.       ║  │  │
│                   │  │  ║                                  ║  │  │
│                   │  │  ║  [ Approve ]   [ Not now ]       ║  │  │
│                   │  │  ╚══════════════════════════════════╝  │  │
│                   │  │                                        │  │
│                   │  └────────────────────────────────────────┘  │
│                   │                                              │
│                   │  ┌────────────────────────────────────────┐  │
│                   │  │  Message Sam...                        │  │
│                   │  └────────────────────────────────────────┘  │
│                   │                                              │
└──────────────────────────────────────────────────────────────────┘
```

**Component list**:
- **Top bar**: Logo, workspace name, action counter (`X / Y actions used`), help icon
- **Sidebar**: 
  - Workspace name header
  - "Teammates" section (channels by bot role, unread dot)
  - "Rooms" section (standup, retrospective)
  - "+ Hire teammate" link at bottom
- **Message area**:
  - Channel name header (`#engineering`)
  - Message thread (scrollable)
  - Plan card (inline, collapsible after approval)
  - Message input (placeholder: "Message [Bot Name]...")

**Action counter states**:
- `< 50%`: neutral grey
- `≥ 50%`: amber
- `≥ 80%`: red
- `= cap`: red + lock icon; input disabled

---

## 8. Plan Approval Modal

Triggered when founder clicks "Approve" on an inline plan card, OR bot posts a high-stakes plan (modal auto-opens).

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Sam is about to do something                            [  ×  ]│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Here's exactly what will happen:                               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  1.  Open PR #42 and read all the changed files.        │   │
│  │                                                         │   │
│  │  2.  Leave a comment on the PR with a summary of        │   │
│  │      what looks good and what needs attention.          │   │
│  │                                                         │   │
│  │  3.  No code will be changed.                           │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  This will use  1 action  (12 used of 50 this month).           │
│                                                                 │
│  ┌──────────────────────────┐   ┌──────────────────────────┐   │
│  │  Yes, go ahead           │   │  Not now                 │   │
│  └──────────────────────────┘   └──────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Component list**:
- Modal header: `[Bot Name] is about to do something` + close (×)
- Numbered plain-English action list (no jargon)
- Action cost line: `This will use X action(s) (Y used of Z this month)`
- Two CTAs: `Yes, go ahead` (primary) / `Not now` (secondary)

**Rules**:
- Modal is the only place execution is confirmed — never auto-approve
- Every item in the numbered list must be comprehensible to a non-technical founder
- If `github_actions` includes creating a PR: the last list item always says "This will create a draft for your review — nothing is final until you merge it"
- "Not now" does not ask for a reason — low friction rejection is intentional

**Post-approval state** (modal closes, inline card updates):

```
  ╔══════════════════════════════════════╗
  ║  ✓  Sam reviewed PR #42             ║
  ║     Comment posted · just now        ║
  ╚══════════════════════════════════════╝
```

---

## 9. Hire Teammate Modal

Triggered by "+ Hire teammate" in sidebar. **Two-step flow** — role selection then candidate roster. No free-text name entry.

---

### Step 1: Choose a role

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Add a teammate                                          [  ×  ]│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  What kind of help do you need?                                 │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Product         │  │  Engineering     │  │  Design       │ │
│  │                  │  │  ✓ On your team  │  │               │ │
│  │  Shapes what     │  │                  │  │  Wireframes   │ │
│  │  to build next   │  │  Reviews code,   │  │  and copy     │ │
│  │                  │  │  raises PRs      │  │               │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Security        │  │  QA              │                     │
│  │                  │  │                  │                     │
│  │  Spots risks     │  │  Finds bugs      │                     │
│  │  before they     │  │  before users do │                     │
│  │  ship            │  │                  │                     │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Step 2: Meet your candidates (Engineering shown)

Slides in after role tap — replaces Step 1 content within the same modal. No page navigation.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Add a teammate                                          [  ×  ]│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ← Engineering                                                  │
│                                                                 │
│  Meet your Engineering candidates                               │
│  These are the specialists available to join your team.         │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐           │
│  │  ┌────────────────┐  │    │  ┌────────────────┐  │           │
│  │  │                │  │    │  │   ✓            │  │           │
│  │  │   [face photo] │  │    │  │   [face photo] │  │           │
│  │  │                │  │    │  │                │  │           │
│  │  └────────────────┘  │    │  └────────────────┘  │           │
│  │  Sam Chen            │    │  Kai Rivera           │           │
│  │  Thorough reviewer.  │    │  Fast-moving.         │           │
│  │  Catches edge cases. │    │  Ships first.         │           │
│  │  [Methodical]        │    │  [Moves fast]   ←sel  │           │
│  └──────────────────────┘    └──────────────────────┘           │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐           │
│  │  ┌────────────────┐  │    │  ┌────────────────┐  │           │
│  │  │                │  │    │  │                │  │           │
│  │  │   [face photo] │  │    │  │   [face photo] │  │           │
│  │  │                │  │    │  │                │  │           │
│  │  └────────────────┘  │    │  └────────────────┘  │           │
│  │  Alex Morgan         │    │  Jordan Lee           │           │
│  │  Security-conscious. │    │  Test-driven.         │           │
│  │  Never skips review. │    │  If not covered,      │           │
│  │  [Security-first]    │    │  doesn't count.       │           │
│  └──────────────────────┘    │  [TDD advocate]       │           │
│                              └──────────────────────┘           │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  What Kai needs to work:                                        │
│  ● GitHub   Ready                                               │
│  ● Jira     Connect in Settings →                               │
│                                                                 │
│  Kai works without these — connected tools unlock more.         │
│                                                                 │
│                    ┌────────────────────────┐                   │
│                    │  Hire Kai Rivera       │                   │
│                    └────────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

**Component list (Step 1)**:
- Modal header: `Add a teammate` + close (×)
- Heading: `What kind of help do you need?`
- Role grid: 5 role cards (3 top row + 2 bottom row)
- Already-hired card: greyed out, "✓ On your team" badge, no hover

**Component list (Step 2)**:
- Back link: `← [Role name]` — returns to Step 1 (no data lost)
- Heading: `Meet your [Role] candidates`
- Subtext: `These are the specialists available to join your team.`
- Candidate grid: 2×2, face-forward cards
- Tool disclosure: appears after candidate is tapped — same spec as before
- CTA: `Hire [Candidate Name]` — disabled until a candidate is tapped

**Candidate card anatomy**:
```
┌──────────────────────┐
│  ┌────────────────┐  │   ← face photo, 80px tall, fills card width
│  │   [face photo] │  │     border-radius: radius-sm on top corners
│  └────────────────┘  │
│  Sam Chen            │   ← Inter 600, 14px
│  Thorough reviewer.  │   ← Inter 400, 12px, --text-soft, 2-line max
│  Catches edge cases. │
│  [Methodical]        │   ← personality pill, Inter 500 11px
└──────────────────────┘
```

Selected state:
- `border: 2px solid --color-primary`
- Background: `--color-primary-subtle`
- Checkmark overlay (top-right corner of photo): white circle `CheckCircle` 16px on `--color-primary` bg

Already-hired candidate (same name in same workspace):
- `opacity: 0.5`, `cursor: not-allowed`
- Bottom of card shows: "On your team" in `--color-success` + `--color-success-subtle` pill

**Notes**: Candidate pool is shuffled on each modal open. No free-text name input — the candidate's name IS the bot's name. Personality badge is cosmetic in v1; behaviour differentiation is v1.1 scope.

---

## 10. Action Cap Warning

Shown inline above message input when `actions_used / action_cap >= 0.8`.

```
┌────────────────────────────────────────────────────────────────┐
│  ⚠  Your team is running low on actions — 42 of 50 used.       │
│     Your team can still answer questions, but won't be able    │
│     to take actions in GitHub once you hit 50.                 │
│     [ Manage limit ]                                           │
└────────────────────────────────────────────────────────────────┘
```

When cap is hit (input locked):

```
┌────────────────────────────────────────────────────────────────┐
│  🔒  Your team has used all 50 actions.                         │
│      They can still answer questions, but can't take any        │
│      actions in GitHub until you reset.                         │
│     [ Reset limit ]                                            │
└────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────┐
  │  Ask a question (your team is still here)  [locked for     │
  │  GitHub actions]                                           │
  └────────────────────────────────────────────────────────────┘
```

**Notes**: Input is NOT fully disabled — founders can still ask questions/chat. Only GitHub-action-triggering is blocked.

---

## 11. Empty State — New Channel

Shown when a channel has no messages yet (e.g. just hired a new teammate).

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  #security                                                     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  [SEC]  Hey, I'm Morgan — your security teammate.        │  │
│  │                                                          │  │
│  │         I watch for risks in your codebase before        │  │
│  │         they become problems.                            │  │
│  │                                                          │  │
│  │         You can ask me to review a PR, check for         │  │
│  │         common vulnerabilities, or just ask questions    │  │
│  │         about keeping your product safe.                 │  │
│  │                                                          │  │
│  │         What are you worried about?                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Message Morgan...                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 12. Settings — Team Rules

Accessible via Settings (gear icon in top bar or sidebar). Three tabs: Integrations / Working Style / Team Rules. This is the Team Rules tab.

```
┌──────────────────────────────────────────────────────────────────┐
│  CLAN                            12 / 50 actions used    [?]   │
├──────────────────────────────────────────────────────────────────┤
│                   │                                              │
│  Acme Inc         │  Settings                                    │
│                   │                                              │
│  ─── Teammates ── │  [ Integrations ]  [ Working Style ]         │
│  #ops             │  [ Team Rules ●  ]                           │
│  #engineering     │                                              │
│  #design          │  ┌──────────────────────────────────────┐   │
│                   │  │  🔒 Rules your team always follows    │   │
│  ─── Rooms ────── │  │                                      │   │
│  #standup         │  │  These are locked — they protect      │   │
│  #retrospective   │  │  how your team works.                 │   │
│                   │  │                                      │   │
│  + Hire teammate  │  │  ☑ Every feature starts with        │   │
│                   │  │    documented use cases               │   │
│                   │  │                                      │   │
│                   │  │  ☑ QA signs off before anything      │   │
│                   │  │    ships                              │   │
│                   │  │                                      │   │
│                   │  │  ☑ Tests required on every change     │   │
│                   │  │                                      │   │
│                   │  │  ☑ Automated checks must pass        │   │
│                   │  │    before merging                     │   │
│                   │  │                                      │   │
│                   │  │  ☑ Test coverage can never decrease   │   │
│                   │  │                                      │   │
│                   │  │  ☑ Deployment pipeline set up        │   │
│                   │  │    before first feature ships         │   │
│                   │  └──────────────────────────────────────┘   │
│                   │                                              │
│                   │  ┌──────────────────────────────────────┐   │
│                   │  │  Rules you can adjust                 │   │
│                   │  │                                      │   │
│                   │  │  Code quality                         │   │
│                   │  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │   │
│                   │  │  [ ● ] No direct pushes to main      │   │
│                   │  │  [ ● ] Require code review approval  │   │
│                   │  │  [ ○ ] Require two reviewers         │   │
│                   │  │                                      │   │
│                   │  │  Communication                        │   │
│                   │  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │   │
│                   │  │  [ ● ] Daily standup updates         │   │
│                   │  │  [ ○ ] Weekly retrospective          │   │
│                   │  │                                      │   │
│                   │  │  Add a custom rule (optional)         │   │
│                   │  │  ┌──────────────────────────────┐    │   │
│                   │  │  │  e.g. Always write a summary  │    │   │
│                   │  │  │  comment on every PR          │    │   │
│                   │  │  └──────────────────────────────┘    │   │
│                   │  │  140 characters max. One rule.        │   │
│                   │  │                           [ Save ]    │   │
│                   │  └──────────────────────────────────────┘   │
│                   │                                              │
└──────────────────────────────────────────────────────────────────┘
```

**Component list**:
- Settings tab bar (3 tabs: Integrations, Working Style, Team Rules)
- **Locked rules card**: non-interactive checkboxes (always checked), lock icon header, explanatory subtext
- **Adjustable rules card**: toggle switches (● = on, ○ = off), grouped by category with section dividers
- **Custom rule input**: single-line text input, 140 char max, Save button

**Locked rules card rules**:
- Checkboxes use `opacity: 0.5`, `cursor: not-allowed` — visually disabled but checked
- Lock icon (🔒) in card header reinforces non-editability
- Tooltip on hover: "This rule is managed by your team setup. Contact your admin to change it."
- 6 locked rules (see copy doc `settings.rules.locked.*`)

**Adjustable toggle rows**:
- `[ ● ]` = on (filled circle, `--color-primary` background)
- `[ ○ ]` = off (empty circle, `--border-default`)
- Toggle click = immediate save (no confirmation)
- Category labels: Inter 500, 12px, `--text-muted`, uppercase

**Custom rule input**:
- Placeholder: "e.g. Always write a summary comment on every PR"
- Char counter appears at 100+ chars: "140 chars max"
- Save button: disabled until input is non-empty and different from saved value
- Only one custom rule per workspace in v1

---

## 13. Feasibility Review Escalation (Ops Channel)

Shown in #ops when a major flag is raised during feasibility review (Decision 023). Rendered as a variant of the plan card — same surface, different colour scheme and action labels.

```
┌──────────────────────────────────────────────────────────────────┐
│  CLAN                            12 / 50 actions used    [?]   │
├──────────────────────────────────────────────────────────────────┤
│                   │                                              │
│  Acme Inc         │  #ops                                    ●   │
│                   │                                              │
│  ─── Teammates ── │  ┌────────────────────────────────────────┐  │
│  #ops         ●   │  │                                        │  │
│  #engineering     │  │  [OPS]  Riley here. Before we start     │  │
│  #design          │  │         building, your design team      │  │
│                   │  │         flagged something that needs     │  │
│  ─── Rooms ────── │  │         your call.                      │  │
│  #standup         │  │                                        │  │
│                   │  │  ╔══════════════════════════════════╗  │  │
│  + Hire teammate  │  │  ║  ⚠  Design needs your input      ║  │  │
│                   │  │  ║                                  ║  │  │
│                   │  │  ║  The onboarding flow has 5 steps  ║  │  │
│                   │  │  ║  but the screens only show 4.    ║  │  │
│                   │  │  ║  One screen is missing.          ║  │  │
│                   │  │  ║                                  ║  │  │
│                   │  │  ║  Options:                         ║  │  │
│                   │  │  ║  · Design adds the missing       ║  │  │
│                   │  │  ║    screen (recommended)          ║  │  │
│                   │  │  ║  · Keep 4 steps (cuts Working    ║  │  │
│                   │  │  ║    Style from onboarding)         ║  │  │
│                   │  │  ║                                  ║  │  │
│                   │  │  ║  [ Fix it ]   [ Skip this step ] ║  │  │
│                   │  │  ╚══════════════════════════════════╝  │  │
│                   │  │                                        │  │
│                   │  └────────────────────────────────────────┘  │
│                   │                                              │
│                   │  ┌────────────────────────────────────────┐  │
│                   │  │  Message Riley...                      │  │
│                   │  └────────────────────────────────────────┘  │
│                   │                                              │
└──────────────────────────────────────────────────────────────────┘
```

**Escalation card variants**:

| Flag severity | Card colour | Icon | Primary CTA |
|---|---|---|---|
| Minor (auto-resolved) | `--color-success-subtle` green border | ✓ | None — informational only |
| Major (needs founder input) | `--color-warning-subtle` amber border | ⚠ | "Fix it" (primary) + "Skip this step" (secondary) |
| Blocker (build cannot start) | `--color-error-subtle` red border | 🛑 | "Let's fix this" (only option) |

**Escalation card spec** (major flag shown above):

| Property | Value |
|---|---|
| Margin-left | 48px (aligns under bot message body) |
| Background | `--color-warning-subtle` (`#FFFBEB`) |
| Border | `1px solid rgba(217,119,6,0.2)` |
| Border-left | `3px solid --color-warning` (`#D97706`) |
| Border-radius | `radius-lg` (8px) |
| Padding | `16px` |
| Max-width | 480px |

**"Fix it"** button: primary style (`--color-primary`)  
**"Skip this step"** button: secondary style, shows confirmation tooltip: "Skipping this removes [feature] from the plan. Continue?"

**Minor flag resolved state** (auto-posted after fix):

```
  ╔══════════════════════════════════════════════╗
  ║  ✓  Design sorted it                         ║
  ║     Missing screen added · no action needed  ║
  ╚══════════════════════════════════════════════╝
```

Uses `--color-success-subtle` green border — same as plan card executed state.
