# Design System — Clan MVP

**Date**: 2026-04-21  
**Author**: UX Designer  
**Audience**: Frontend Engineer  
**Status**: Final — approved for implementation

---

## Design Principles

1. **Feels like a team, not a tool** — warmth over utility; founders should feel like they're talking to people
2. **Trust is earned at every interaction** — especially the plan approval modal; clarity over cleverness
3. **Calm by default** — never shout; surface urgency only when it's real
4. **Content leads** — no decorative chrome; UI steps back so conversation steps forward

---

## Colour Tokens

### Base Palette

```
--color-sidebar-bg:        #1A1D21   /* Near-black; Slack-style dark sidebar */
--color-sidebar-text:      #C9D1D9   /* Muted white for inactive items */
--color-sidebar-active:    #FFFFFF   /* Active channel label */
--color-sidebar-hover:     #27292D   /* Hover state on sidebar items */
--color-sidebar-badge:     #E01E5A   /* Unread dot */
--color-sidebar-divider:   #2E3136

--color-canvas:            #FFFFFF   /* Main message area */
--color-canvas-subtle:     #F7F8FA   /* Hover rows, input bg */
--color-border:            #E4E8EE   /* Dividers, input borders */
--color-border-strong:     #C1C9D2

--color-text-primary:      #111827
--color-text-secondary:    #6B7280
--color-text-muted:        #9CA3AF
--color-text-inverse:      #FFFFFF

--color-primary:           #4F46E5   /* Indigo-600; primary actions */
--color-primary-hover:     #4338CA
--color-primary-subtle:    #EEF2FF   /* Primary tinted bg */

--color-success:           #059669
--color-success-subtle:    #ECFDF5

--color-warning:           #D97706
--color-warning-subtle:    #FFFBEB

--color-error:             #DC2626
--color-error-subtle:      #FEF2F2

--color-plan-border:       #4F46E5   /* Plan card left accent */
--color-plan-bg:           #F5F3FF   /* Plan card background */
```

### Semantic Aliases (use these in components, not raw values)

```
--bg-page:          var(--color-canvas)
--bg-subtle:        var(--color-canvas-subtle)
--bg-sidebar:       var(--color-sidebar-bg)

--text-default:     var(--color-text-primary)
--text-soft:        var(--color-text-secondary)
--text-muted:       var(--color-text-muted)

--border-default:   var(--color-border)
--border-strong:    var(--color-border-strong)

--action-primary:   var(--color-primary)
--action-primary-hover: var(--color-primary-hover)
```

---

## Typography

**Font**: Inter (Google Fonts). Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

```css
/* Load */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
```

| Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `text-2xl` | 24px | 600 | 32px | Onboarding headings |
| `text-xl` | 20px | 600 | 28px | Modal titles, channel header |
| `text-lg` | 18px | 600 | 26px | Section labels |
| `text-base` | 15px | 400 | 22px | **Message body** (primary reading text) |
| `text-sm` | 13px | 400 | 20px | Helper text, timestamps, meta |
| `text-xs` | 11px | 500 | 16px | Badges, counters, caps |

**Message font size is 15px**, not 14px — this matches Slack's reading rhythm.

---

## Spacing Scale

Base unit: **4px**

| Token | Value | Use |
|---|---|---|
| `space-1` | 4px | Icon padding, tight gaps |
| `space-2` | 8px | Inline gaps, badge padding |
| `space-3` | 12px | Component inner padding (small) |
| `space-4` | 16px | Component inner padding (default) |
| `space-5` | 20px | Section gaps |
| `space-6` | 24px | Card padding, modal padding |
| `space-8` | 32px | Large section gaps |
| `space-12` | 48px | Top bar height |

---

## Border Radius

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4px | Badges, inline chips |
| `radius-md` | 6px | Buttons, inputs |
| `radius-lg` | 8px | Cards, plan cards |
| `radius-xl` | 12px | Modals |
| `radius-full` | 9999px | Avatar circles, unread dots |

---

## Elevation / Shadow

```css
--shadow-sm:  0 1px 2px rgba(0,0,0,0.06);          /* Inputs on focus */
--shadow-md:  0 4px 12px rgba(0,0,0,0.10);          /* Cards */
--shadow-lg:  0 8px 32px rgba(0,0,0,0.16);          /* Modals */
--shadow-overlay: 0 0 0 1px rgba(0,0,0,0.04),
                  0 8px 32px rgba(0,0,0,0.18);       /* Dropdowns */
```

---

## Layout

### App Shell

```
Total viewport: 100vw × 100vh (no scroll on shell)

┌────────────────────────────────────────────────────┐  ← 48px top bar
├──────────┬─────────────────────────────────────────┤
│  240px   │           flex-1                        │
│ sidebar  │       message area                      │
│          │    (overflow-y: scroll)                 │
│          │                                         │
│          │                                         │
└──────────┴─────────────────────────────────────────┘
```

| Zone | Width / Height | Overflow |
|---|---|---|
| Top bar | 100% × 48px | hidden |
| Sidebar | 240px × calc(100vh - 48px) | hidden (items scroll within) |
| Message area | flex-1 × calc(100vh - 48px - 64px) | scroll-y |
| Message input | 100% × 64px | hidden |

### Onboarding Shell
Single centred column, max-width 480px, vertically centred. No sidebar.

### Modal Overlay
`position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.48)`, `z-index: 100`.  
Modal panel: max-width 480px, centred, `border-radius: radius-xl`.

---

## Avatar System

Bot avatars are generated deterministically from `avatar_seed` using [dicebear.com](https://dicebear.com) `bottts` style (robots — fits AI theme, approachable).

```
URL pattern: https://api.dicebear.com/7.x/bottts/svg?seed={avatar_seed}
```

| Context | Size |
|---|---|
| Message thread | 36px × 36px |
| Sidebar (if shown) | 24px × 24px |
| Hire modal card | 48px × 48px |
| Onboarding team intro | 48px × 48px |

Founder avatar: initials in a circle (`background: --color-primary-subtle`, `color: --color-primary`).

---

## Motion

Keep animation minimal — founders are working, not watching.

| Event | Duration | Easing | Notes |
|---|---|---|---|
| Modal open | 180ms | `ease-out` | scale 0.97→1.0 + fade |
| Modal close | 140ms | `ease-in` | fade only |
| Plan card appear | 220ms | `ease-out` | slide-up 8px + fade |
| Bot typing indicator | loop | — | three dots pulse |
| Message send | 80ms | — | input clears immediately |
| Sidebar badge appear | 200ms | `ease-out` | scale 0→1 |
| Action counter update | 300ms | `ease-in-out` | number flip |

No animations on: navigation, hover states, scroll.

---

## Icons

Use [Lucide](https://lucide.dev) — clean, consistent, MIT licensed, React-native.

| Icon | `lucide-react` name | Use |
|---|---|---|
| Plus | `Plus` | Hire teammate |
| Hash | `Hash` | Channel prefix |
| Lock | `Lock` | Action cap hit |
| AlertTriangle | `AlertTriangle` | Warning state |
| CheckCircle | `CheckCircle` | Plan executed |
| XCircle | `XCircle` | Plan failed |
| GitPullRequest | `GitPullRequest` | GitHub PR trigger |
| Tag | `Tag` | GitHub label trigger |
| GitMerge | `GitMerge` | GitHub merge trigger |
| Settings | `Settings` | Workspace settings |
| HelpCircle | `HelpCircle` | Help |
| X | `X` | Close modal |
| ChevronRight | `ChevronRight` | Continue arrow |
| Zap | `Zap` | Action counter (active) |

Icon size: 16px in-line, 20px standalone. Stroke-width: 1.5 (Lucide default).

---

## Component Library

Use **shadcn/ui** as the base layer. Install selectively — only what's needed.

```bash
npx shadcn@latest add button input dialog badge separator avatar
```

All shadcn components are customised to match the tokens above via `tailwind.config.ts`. Do not override inline — update the theme.
