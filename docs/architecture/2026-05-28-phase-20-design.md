# Phase 20: GitHub Read Access — Architecture Design

**Date**: 2026-05-28  
**Author**: Architect  
**Status**: Approved for implementation  
**Branch**: `feat/phase-20-github-read`

---

## Problem

Bots write blind. When the Backend bot is dispatched to build M2, it has never seen M1's code. It invents structure, duplicates models, picks inconsistent naming. The founder discovers this on review — three cycles later.

`read_github_file` closes this gap. Bots fetch what exists before proposing what to change.

---

## What Is NOT Being Built

- File listing / directory browsing — not needed for M2
- Semantic search / RAG — premature; tool-based fetch is sufficient
- Caching — premature; Octokit calls are fast enough for conversational use
- New API routes — reads stay server-side, never touch the executor or plan flow
- Changes to `executor.ts` — reads bypass the plan/approve/execute pipeline entirely
- Reading private files outside the connected repo — scope is one repo per workspace

---

## Design

### Core Principle

**Reads are not actions.** They carry no risk, require no approval, and must not block the founder. They bypass the `plans` table and the `executor.ts` entirely. They execute immediately when Claude calls the tool, before Claude composes its final response.

### 1. New Tool: `READ_GITHUB_FILE_TOOL`

Add to `lib/bots/tools.ts`:

```typescript
{
  name: 'read_github_file',
  description:
    'Read the current contents of a file from the connected GitHub repository. ' +
    'Call this BEFORE proposing any change to an existing file. ' +
    'You may call it multiple times in one response to read several files. ' +
    'Do NOT call this for files you are about to create from scratch.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to repo root, e.g. "src/m1/collector.py"',
      },
      branch: {
        type: 'string',
        description: 'Branch to read from. Omit to use the repo default branch.',
      },
    },
    required: ['path'],
  },
}
```

Add to the tools array passed to Claude in `respondToMessage`. No change to any other tool.

### 2. New Module: `lib/github/reader.ts`

Single exported function:

```typescript
export async function readGithubFile(
  workspaceId: string,
  path: string,
  branch?: string
): Promise<{ content: string; sha: string; truncated: boolean }>
```

**Behaviour:**
1. Resolves `github_installations` for `workspaceId` — throws if none linked
2. Calls `getInstallationOctokit(installation_id)`
3. Calls `octokit.repos.getContent({ owner, repo, path, ref: branch ?? defaultBranch })`
4. Decodes base64 content
5. Truncates to 8 000 characters if content exceeds that — sets `truncated: true`
6. Returns `{ content, sha, truncated }`

**Error cases (caller formats the message):**
- `404` → `FileNotFoundError`
- `403` → `FileAccessDeniedError`
- No installation → `NoGithubInstallationError`

No caching. No retry logic. Errors surface to the bot handler which formats them as tool_result content so Claude can tell the founder gracefully.

### 3. Bot Handler: Tool-Use Loop in `respondToMessage`

Current flow:
```
buildMessages → callClaude → checkToolUse → handleTool → storeBotMessage
```

Extended flow for `read_github_file`:
```
buildMessages → callClaude → [if read_github_file: fetchFile → appendToolResult → callClaude again]
             → [repeat up to 5 times] → handleOtherTool OR storeBotMessage
```

**Implementation in `lib/bots/index.ts`:**

Extract the Claude call + tool-use dispatch into a loop. Before the existing tool-use checks, intercept `read_github_file`:

```
const MAX_READ_ITERATIONS = 5
let iteration = 0

while (iteration < MAX_READ_ITERATIONS) {
  response = await callClaude(messages)
  toolUse = extractToolUse(response)
  
  if (toolUse?.name !== 'read_github_file') break  // hand off to existing handlers
  
  // Fetch the file and append tool_result
  const result = await readGithubFile(workspaceId, toolUse.input.path, toolUse.input.branch)
  messages.push(
    { role: 'assistant', content: response.content },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result.content }] }
  )
  iteration++
}

// If we hit the cap without getting a text response, force-break by not calling Claude again
// and store a system message: "I've read the files I needed. Ask me to continue."
```

The existing `if (toolUseBlock?.name === '...')` blocks below remain unchanged — they process the final tool call after the read loop exits.

**The loop cap (5):** Prevents runaway calls. Claude almost never needs more than 2–3 reads in a single response. If it hits 5, it has enough context to work with.

### 4. Token Budget Awareness

File reads add content tokens to Claude's context window. 8 000 chars ≈ 2 000 tokens. Five reads ≈ 10 000 tokens. At claude-sonnet-4-6's 200k context, this is negligible.

No token tracking needed. The 8 000 char truncation per file is the only guard.

### 5. Action Cap

`read_github_file` does **not** increment `actions_used`. Reads are not actions. The action cap RPC is not called.

---

## Data Flow

```
Founder: "What does M1's data collector look like?"

Bot (Claude) → tool_use: read_github_file { path: "src/m1/collector.py" }
  ↓
lib/github/reader.ts → getInstallationOctokit → octokit.repos.getContent
  ↓
tool_result: "import fastapi\n class Collector:..."
  ↓
Claude (second call, with file content in context)
  → text: "M1's collector uses FastAPI and a Pydantic model. For M2 I'd..."
  ↓
Bot stores text response as message
```

---

## Module Map

```
lib/github/
  auth.ts          ← unchanged
  executor.ts      ← unchanged (writes only)
  reader.ts        ← NEW: readGithubFile()
  events.ts        ← unchanged
  verify.ts        ← unchanged

lib/bots/
  tools.ts         ← add READ_GITHUB_FILE_TOOL
  index.ts         ← add read loop before existing tool handlers
  context.ts       ← unchanged
```

No DB migrations. No new API routes. No env vars (reuses existing `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`).

---

## What the Bot System Prompt Should Say

Add to each bot's system prompt in `lib/templates/roles.ts`:

> Before proposing any change to an existing file, call `read_github_file` to see what is already there. Never invent imports, class names, or conventions — check first.

This is a system prompt change, not a new prompt — one line per role.

---

## Use Cases Implemented by This Design

| UC | Description | Covered? |
|---|---|---|
| UC-20-01 | Bot reads file before proposing changes, cites actual code | ✅ via tool_use loop |
| UC-20-02 | Bot reads multiple files in one dispatch | ✅ up to 5 iterations |
| UC-20-03 | File not found → graceful error, no hallucination | ✅ FileNotFoundError → tool_result error string |
| UC-20-04 | Reads don't count against action cap | ✅ RPC not called |
| UC-20-05 | No founder approval required for reads | ✅ bypasses plans table entirely |

---

## Implementation Order for Backend/ML Engineer

1. `lib/github/reader.ts` — standalone, no dependencies on other Phase 20 files  
2. `lib/bots/tools.ts` — add `READ_GITHUB_FILE_TOOL`  
3. `lib/bots/index.ts` — add read loop (depends on 1 + 2)  
4. `lib/templates/roles.ts` — add one line to each bot system prompt  
5. Tests: `__tests__/lib/github/reader.test.ts` + extend `__tests__/lib/bots/index.test.ts`

No migrations. No Vercel env changes. No UI changes.

**Estimated: 1 session.**
