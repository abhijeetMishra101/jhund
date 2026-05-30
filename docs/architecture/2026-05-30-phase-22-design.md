# Phase 22 — Architecture Design: `patch_github_file`

**Date**: 2026-05-30
**Author**: Architect
**Status**: Approved — implementation starting immediately
**Branch**: `feat/phase-22-patch-file`

---

## Problem

`commit_file` performs full-file replacement. Bots read files truncated at 8,000 characters. When a bot edits a large file, it submits a partial file and silently destroys the rest. PR #93 demonstrated this: Sam deleted 521 lines of `lib/bots/index.ts`.

---

## Decision

1. **Add `patch_github_file`** — surgical string replacement. Takes `old_string` + `new_string`, fetches the current file, validates the match, replaces, commits.
2. **Restrict `commit_file`** — reject if file already exists on the branch. New files only.
3. **Update tool descriptions** — bot must know which tool to use when.

---

## Module Map

```
lib/bots/tools.ts
  └── PATCH_GITHUB_FILE_TOOL    (new)
  └── COMMIT_FILE_TOOL          (updated description: "new files only")

lib/github/executor.ts
  └── patchGithubFile()         (new — fetch → match → replace → commit)
  └── commitFile()              (updated — rejects if file exists)

lib/bots/index.ts
  └── tool dispatch block       (add 'patch_github_file' case)

__tests__/lib/github/executor.test.ts   (new tests)
__tests__/lib/bots/index.test.ts        (new tool dispatch tests)
```

---

## `patchGithubFile()` — Data Flow

```
Bot calls patch_github_file({ file_path, old_string, new_string, branch })
  │
  ▼
executor.patchGithubFile(workspaceId, { file_path, old_string, new_string, branch })
  │
  ├─ 1. Fetch workspace installation (same pattern as commitFile)
  ├─ 2. getInstallationOctokit(installationId)
  ├─ 3. repos.getContent({ owner, repo, path: file_path, ref: branch })
  │      → decode base64 → currentContent (string), sha (string)
  │
  ├─ 4. Count occurrences of old_string in currentContent
  │      → 0 matches  → throw PatchNoMatchError("old_string not found...")
  │      → 2+ matches → throw PatchAmbiguousError("old_string matches N times...")
  │      → 1 match    → continue
  │
  ├─ 5. newContent = currentContent.replace(old_string, new_string)
  │
  └─ 6. repos.createOrUpdateFileContents({
           owner, repo, path: file_path,
           message: `patch: update ${file_path}`,
           content: base64(newContent),
           sha,          ← required for update (not create)
           branch
         })
```

---

## `commitFile()` — New Guard

```
executor.commitFile(workspaceId, { file_path, content, branch, ... })
  │
  ├─ 1. Try repos.getContent({ path: file_path, ref: branch })
  │      → file exists  → throw FileAlreadyExistsError(
  │                          "Use patch_github_file to edit existing files"
  │                        )
  │      → 404          → continue (file is new — proceed as before)
  │
  └─ 2. repos.createOrUpdateFileContents (create path, no sha)
```

---

## Error Classes (new, in `lib/github/executor.ts`)

```typescript
export class PatchNoMatchError extends Error {
  constructor(filePath: string) {
    super(`old_string not found in ${filePath}. Read the file again and use the exact text including whitespace and indentation.`)
  }
}

export class PatchAmbiguousError extends Error {
  constructor(filePath: string, count: number) {
    super(`old_string matches ${count} locations in ${filePath}. Provide more surrounding context to make it unique.`)
  }
}

export class FileAlreadyExistsError extends Error {
  constructor(filePath: string) {
    super(`${filePath} already exists. Use patch_github_file to edit existing files.`)
  }
}
```

---

## Tool Definition (`lib/bots/tools.ts`)

### `PATCH_GITHUB_FILE_TOOL`

```typescript
{
  name: 'patch_github_file',
  description: `Edit an existing file in the GitHub repository by replacing an exact section of text.
  
  Rules:
  - old_string must match exactly — including whitespace and indentation
  - old_string must be unique in the file (add surrounding context if needed)
  - If the match fails, read the file again and use the exact text
  - Do NOT use this to create new files — use commit_file for that`,
  input_schema: {
    type: 'object',
    properties: {
      file_path:   { type: 'string', description: 'Path to the file, e.g. lib/bots/index.ts' },
      old_string:  { type: 'string', description: 'The exact text to replace, including surrounding whitespace' },
      new_string:  { type: 'string', description: 'The replacement text' },
      branch:      { type: 'string', description: 'Branch to commit to, e.g. bot/fix-comments' },
    },
    required: ['file_path', 'old_string', 'new_string', 'branch'],
  },
}
```

### `commit_file` description update

Add to the top of the description:
> "**Use this only to create new files that do not yet exist.** To edit an existing file, use `patch_github_file`."

---

## Bot Dispatch (`lib/bots/index.ts`)

Add case to the tool dispatch block:

```typescript
case 'patch_github_file': {
  const input = toolUseBlock.input as {
    file_path: string
    old_string: string
    new_string: string
    branch: string
  }
  // patch_github_file goes through the same plan-gate as commit_file
  // It is NOT auto-approvable by default (isAutoApprovable handles commit_file only)
  // Treat it as a propose_github_action with type 'commit_file' semantics
  // i.e. insert a plan row, post the chip, wait for approval
  break
}
```

Actually — `patch_github_file` should be a **first-class proposed action**, not a direct executor call. It flows through the same plan chip → approval → execute path as `commit_file`. This preserves the plan-before-action guarantee.

In `PROPOSE_GITHUB_ACTION_TOOL`, add `'patch_github_file'` to the `action_type` enum. The executor handles it like `commit_file` but calls `patchGithubFile()` instead.

---

## isAutoApprovable update

`patch_github_file` actions on `docs/` or `__tests__/` paths on a `bot/` branch should be auto-approvable — same rules as `commit_file`. Update `lib/bots/auto-approve.ts`:

```typescript
// Allow both commit_file (new) and patch_github_file (edit) action types
if (actions.some(a => a.action_type !== 'commit_file' && a.action_type !== 'patch_github_file')) return false
```

---

## Test Coverage Required

### `executor.test.ts` (new tests)

- `patchGithubFile` — happy path: fetches file, replaces once, commits with SHA
- `patchGithubFile` — no match: throws `PatchNoMatchError`
- `patchGithubFile` — ambiguous (2 matches): throws `PatchAmbiguousError`
- `patchGithubFile` — large file (700+ lines): only targeted section changes
- `commitFile` — file exists: throws `FileAlreadyExistsError`
- `commitFile` — file does not exist (404): proceeds as normal

### `index.test.ts` (new tests)

- Bot calls `patch_github_file` action type → `patchGithubFile` is called in executor
- `patch_github_file` on `docs/` path with `bot/` branch → `isAutoApprovable` returns true
- `patch_github_file` on `lib/` path → `isAutoApprovable` returns false, plan chip shown

---

## Files Changed

| File | Change |
|------|--------|
| `lib/github/executor.ts` | Add `patchGithubFile()`, update `commitFile()` with exist-check, add 3 error classes |
| `lib/bots/tools.ts` | Add `PATCH_GITHUB_FILE_TOOL`, update `commit_file` description, add `patch_github_file` to action_type enum |
| `lib/bots/auto-approve.ts` | Allow `patch_github_file` alongside `commit_file` in action type check |
| `lib/bots/index.ts` | Add `patch_github_file` case to executor dispatch |
| `__tests__/lib/github/executor.test.ts` | New tests for both functions |
| `__tests__/lib/bots/index.test.ts` | New dispatch tests |
| `__tests__/lib/bots/auto-approve.test.ts` | New tests for updated type check |

No DB migrations. No new env vars.

---

## Phase Renumbering Note

Original Phase 22 (Workspace Context — CONTEXT.md injection) is deferred to Phase 23.
All subsequent phase numbers shift by one.
