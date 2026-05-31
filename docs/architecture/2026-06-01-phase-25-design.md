# Phase 25 — Bot-to-Bot Messaging + Stage Context Passing

**Date:** 2026-06-01  
**Author:** Architect  
**Status:** Approved for implementation  
**Estimated effort:** 1 session  

---

## Problem

The autonomous loop works (Phase 24). But every bot is still isolated:

1. **Stage handoffs lose context.** When `advance_feature_stage` fires, the receiving bot gets `"🔔 Feature X has entered Stage 5"` and nothing else. The Architect's ADR, the Designer's spec, the PO's requirements — invisible. The bot writes blind.

2. **Bots can't ask each other questions.** If the Backend bot needs to clarify something with the Architect mid-task, there is no mechanism. It either guesses or surfaces a question to the founder (noise).

3. **Bots can't signal they're stuck.** If a bot hits an ambiguity it cannot resolve, it has no way to pause and ask the founder. It continues incorrectly or loops.

---

## Solution — Three Targeted Additions

No new DB tables. No new API routes. Three additions to existing modules.

---

## Feature 1 — Stage Handoff With Context

### What changes

`postHandoffMessage` in `lib/feature-stages/dispatch.ts` currently sends a generic `🔔` message. The calling bot's `notes` field (what it accomplished) is already available in `lib/bots/index.ts` at the dispatch site but is dropped on the floor.

**Change:** Pass `notes` through to the handoff message so the receiving bot knows what the previous stage delivered.

### New message format

```
🔔 **Feature X** design is signed off. Architecture (Stage 4) is starting — please post your ADR and technical approach.

**Handed off by the Design team:**
[notes from advance_feature_stage call — the deliverable summary]
```

### Interface change

```typescript
// lib/feature-stages/dispatch.ts
export function handoffMessage(featureTitle: string, toStage: number, context?: string): string

export async function postHandoffMessage(
  channelId: string,
  featureTitle: string,
  toStage: number,
  context?: string   // ← new optional param
): Promise<string>
```

### Caller change (lib/bots/index.ts)

```typescript
// In advance_feature_stage handler, pass input.notes to postHandoffMessage
await postHandoffMessage(target.channelId, featureTitle, input.to_stage, input.notes)
```

**No DB migration needed.**

---

## Feature 2 — `message_teammate` Tool

### What it does

Bot A calls `message_teammate({ role: 'backend', message: '...' })`. The server:
1. Finds Bot B's channel in this workspace
2. Posts Bot A's message there (authored as Bot A)
3. Calls `respondToMessage(botBChannelId, workspaceId, undefined, undefined, true)` — the `true` flag marks this as a bot-to-bot call, preventing infinite recursion
4. Returns Bot B's reply text as the `tool_result` so Bot A continues

Bot A receives the answer inline and continues its work loop. The founder sees both sides of the conversation in the respective channels — no founder input required.

### New tool definition (lib/bots/tools.ts)

```typescript
export const MESSAGE_TEAMMATE_TOOL: Anthropic.Tool = {
  name: 'message_teammate',
  description:
    'Send a message to another teammate and get their reply. ' +
    'Use this when you need input from a specific team member before continuing your work. ' +
    'The other bot will reply and you will receive their answer as the result. ' +
    'Do NOT use this to loop endlessly — one question, one answer, then continue.',
  input_schema: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        enum: ['ops', 'product', 'backend', 'design', 'security', 'qa', 'ml'],
        description: 'The role of the teammate to message',
      },
      message: {
        type: 'string',
        description: 'The message to send — be specific about what you need',
      },
    },
    required: ['role', 'message'],
  },
}
```

### New module: lib/bots/bot-to-bot.ts

```typescript
export async function messageTeammate(
  callingBotId: string,
  callingBotName: string,
  targetRole: string,
  message: string,
  workspaceId: string
): Promise<string>
```

Responsibilities:
- Find target channel by `role_key` in workspace (same pattern as `getDispatchTargets`)
- Insert the message to that channel, `author_type: 'bot'`, `author_id: callingBotId`
- Call `respondToMessage(targetChannelId, workspaceId, undefined, message, true)`
- Return the reply message content (fetch by returned ID)

### Recursion guard

Add `isBotToBotCall?: boolean` parameter to `respondToMessage`. When `true`:
- Do NOT include `MESSAGE_TEAMMATE_TOOL` in the tools array passed to Claude
- This prevents Bot B from calling `message_teammate` inside a bot-to-bot response (depth cap = 1)

### Handler in lib/bots/index.ts

```typescript
if (toolUseBlock?.name === 'message_teammate') {
  const input = toolUseBlock.input as { role: string; message: string }
  
  let reply: string
  try {
    reply = await messageTeammate(botRole.id, botRole.display_name, input.role, input.message, workspaceId)
  } catch (err) {
    reply = `Could not reach that teammate: ${err instanceof Error ? err.message : 'unknown error'}`
  }
  
  // Feed reply back as tool_result and re-invoke Claude to continue
  messages.push({ role: 'assistant', content: response.content })
  messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: reply }] })
  // re-run Claude with updated messages — continue normal flow
}
```

---

## Feature 3 — `escalate_to_founder` Tool

### What it does

Bot calls `escalate_to_founder({ reason: '...', question: '...' })`. Server posts a clearly marked system message and the bot's turn ends. When the founder replies, `respondToMessage` fires normally — the bot's last message (the escalation) is in history, so it naturally picks up from there.

No "resume" mechanism, no new state. The conversation history IS the resume mechanism.

### New tool definition (lib/bots/tools.ts)

```typescript
export const ESCALATE_TO_FOUNDER_TOOL: Anthropic.Tool = {
  name: 'escalate_to_founder',
  description:
    'Ask the founder for input when you are blocked and cannot continue without their decision. ' +
    'Use this sparingly — only when you have a genuine blocker, not for routine check-ins. ' +
    'The founder will be notified and can reply directly in this channel.',
  input_schema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Why you are blocked — what you have tried and what is missing',
      },
      question: {
        type: 'string',
        description: 'The specific question the founder needs to answer',
      },
    },
    required: ['reason', 'question'],
  },
}
```

### Handler in lib/bots/index.ts

```typescript
if (toolUseBlock?.name === 'escalate_to_founder') {
  const input = toolUseBlock.input as { reason: string; question: string }
  
  const content = `⚠️ **${botRole.display_name} needs your input**\n\n${input.reason}\n\n**Question:** ${input.question}`
  
  const { data: stored } = await supabase.from('messages').insert({
    channel_id: channelId,
    author_type: 'system',
    author_id: botRole.id,
    content,
  }).select('id').single()
  
  return stored!.id
}
```

---

## System Flow Diagram

```
Phase 25 — bot-to-bot call flow

Bot A (product, #product channel)
  │
  ├─ Claude: "I need the Architect's input on feasibility"
  │   → calls message_teammate({ role: 'backend', message: '...' })
  │
  ├─ Handler: posts message to #engineering as Bot A
  │
  ├─ Handler: calls respondToMessage(engineeringChannelId, ..., isBotToBotCall=true)
  │   │
  │   └─ Bot B (backend, #engineering)
  │       Claude gets the message, responds with answer
  │       reply stored in #engineering
  │       reply text returned to Bot A handler
  │
  ├─ tool_result injected into Bot A's conversation
  │
  └─ Claude (Bot A) continues with answer in context


Stage advance with context flow

Bot A calls advance_feature_stage({ notes: "Design complete. Wireframes at docs/design.md. Key decision: modal-first flow." })
  │
  ├─ postHandoffMessage(targetChannelId, featureTitle, toStage, notes)
  │
  └─ Bot B receives:
      "🔔 Feature X design is signed off. Architecture starting.
       
       Handed off by the Design team:
       Design complete. Wireframes at docs/design.md. Key decision: modal-first flow."
```

---

## Files Changed

| File | Change |
|------|--------|
| `lib/bots/tools.ts` | Add `MESSAGE_TEAMMATE_TOOL`, `ESCALATE_TO_FOUNDER_TOOL` |
| `lib/bots/bot-to-bot.ts` | New module — `messageTeammate()` |
| `lib/bots/index.ts` | Add `isBotToBotCall` param; add handlers for 2 new tools; pass `input.notes` to `postHandoffMessage` |
| `lib/feature-stages/dispatch.ts` | Add `context?: string` to `handoffMessage` and `postHandoffMessage` |
| `lib/templates/roles.ts` | Add instructions for new tools to relevant roles (all roles get `escalate_to_founder`; PO, Architect, Backend get `message_teammate`) |

---

## DB Migrations

**None required.** All state lives in `messages` rows already.

---

## What This Unlocks

After Phase 25:
- PO briefs Architect → Architect has context without re-reading the whole product channel
- Backend asks Design a clarifying question → Design answers → Backend continues
- Bot hits ambiguity → escalates to founder with specific question → founder answers → bot resumes
- **Guinea pig gate moves within reach after Phase 26 (escalation notification).**

---

## Out of Scope (Phase 25)

- Long-term memory / decision injection — Phase 28
- Email/push notification to founder on escalation — Phase 26
- Bot-to-bot threading (parent_id) — P2, deferred
