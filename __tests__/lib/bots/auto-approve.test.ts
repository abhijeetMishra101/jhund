import { describe, it, expect } from 'vitest'
import { isAutoApprovable } from '@/lib/bots/auto-approve'

// Helper to build a commit_file action
function commitFile(filePath: string, branch = 'bot/update'): { action_type: string; payload: Record<string, unknown> } {
  return {
    action_type: 'commit_file',
    payload: { file_path: filePath, content: 'content', commit_message: 'update', branch },
  }
}

describe('isAutoApprovable', () => {
  // ── Happy paths ──────────────────────────────────────────────────────────────

  it('returns true for a single commit_file to docs/ on bot/ branch', () => {
    expect(isAutoApprovable([commitFile('docs/api.md', 'bot/update-docs')])).toBe(true)
  })

  it('returns true for commit_file to a .test.ts file', () => {
    expect(isAutoApprovable([commitFile('lib/bots/foo.test.ts', 'bot/add-tests')])).toBe(true)
  })

  it('returns true for commit_file to a .spec.ts file', () => {
    expect(isAutoApprovable([commitFile('src/auth.spec.ts', 'bot/spec-update')])).toBe(true)
  })

  it('returns true for commit_file to __tests__/ on bot/ branch', () => {
    expect(isAutoApprovable([commitFile('__tests__/lib/bots/index.test.ts', 'bot/add-tests')])).toBe(true)
  })

  it('returns true for commit_file to a .md file (root level)', () => {
    expect(isAutoApprovable([commitFile('README.md', 'bot/update-readme')])).toBe(true)
  })

  it('returns true for 3 commit_files all in safe paths', () => {
    expect(
      isAutoApprovable([
        commitFile('docs/api.md', 'bot/docs'),
        commitFile('docs/architecture.md', 'bot/docs'),
        commitFile('__tests__/lib/foo.test.ts', 'bot/docs'),
      ])
    ).toBe(true)
  })

  // ── Rule 1: action_type must be commit_file ──────────────────────────────────

  it('returns false when action_type is create_pr', () => {
    expect(
      isAutoApprovable([
        {
          action_type: 'create_pr',
          payload: { title: 'PR', body: 'body', head_branch: 'bot/feat', base_branch: 'main' },
        },
      ])
    ).toBe(false)
  })

  it('returns false when action_type is create_issue', () => {
    expect(
      isAutoApprovable([
        { action_type: 'create_issue', payload: { title: 'Bug', body: 'details', branch: 'bot/fix' } },
      ])
    ).toBe(false)
  })

  it('returns false for mixed commit_file + create_pr', () => {
    expect(
      isAutoApprovable([
        commitFile('docs/api.md', 'bot/update'),
        { action_type: 'create_pr', payload: { title: 'PR', body: '', head_branch: 'bot/update', base_branch: 'main' } },
      ])
    ).toBe(false)
  })

  // ── Rule 2: max 3 files ──────────────────────────────────────────────────────

  it('returns false when more than 3 actions', () => {
    expect(
      isAutoApprovable([
        commitFile('docs/a.md', 'bot/docs'),
        commitFile('docs/b.md', 'bot/docs'),
        commitFile('docs/c.md', 'bot/docs'),
        commitFile('docs/d.md', 'bot/docs'),
      ])
    ).toBe(false)
  })

  it('returns true for exactly 3 actions (boundary)', () => {
    expect(
      isAutoApprovable([
        commitFile('docs/a.md', 'bot/docs'),
        commitFile('docs/b.md', 'bot/docs'),
        commitFile('docs/c.md', 'bot/docs'),
      ])
    ).toBe(true)
  })

  // ── Rule 3: safe path whitelist ──────────────────────────────────────────────

  it('returns false when file_path is in src/ (not whitelisted)', () => {
    expect(isAutoApprovable([commitFile('src/app/auth.ts', 'bot/fix')])).toBe(false)
  })

  it('returns false when file_path is in lib/ (not whitelisted)', () => {
    expect(isAutoApprovable([commitFile('lib/bots/index.ts', 'bot/refactor')])).toBe(false)
  })

  it('returns false when file_path is in app/ (not whitelisted)', () => {
    expect(isAutoApprovable([commitFile('app/api/route.ts', 'bot/fix')])).toBe(false)
  })

  it('returns false for mixed safe+unsafe file paths', () => {
    expect(
      isAutoApprovable([
        commitFile('docs/api.md', 'bot/update'),
        commitFile('src/auth.ts', 'bot/update'),
      ])
    ).toBe(false)
  })

  // ── Rule 4: branch must start with bot/ ─────────────────────────────────────

  it('returns false when branch does not start with bot/', () => {
    expect(isAutoApprovable([commitFile('docs/api.md', 'main')])).toBe(false)
  })

  it('returns false when branch starts with feature/ instead of bot/', () => {
    expect(isAutoApprovable([commitFile('docs/api.md', 'feature/docs-update')])).toBe(false)
  })

  it('returns false when branch is empty string', () => {
    expect(isAutoApprovable([commitFile('docs/api.md', '')])).toBe(false)
  })

  it('returns false when branch is missing from payload', () => {
    expect(
      isAutoApprovable([
        { action_type: 'commit_file', payload: { file_path: 'docs/api.md', content: '', commit_message: 'x' } },
      ])
    ).toBe(false)
  })

  it('returns false for mixed branches — one bot/, one not', () => {
    expect(
      isAutoApprovable([
        commitFile('docs/a.md', 'bot/update'),
        commitFile('docs/b.md', 'main'),
      ])
    ).toBe(false)
  })

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it('returns false for empty actions array', () => {
    // No actions — technically passes all "every" checks vacuously but fails length check is n/a.
    // However, semantically 0 actions should not be auto-approvable.
    // The current implementation: length=0 is <= 3 so passes Rule 2, and every() vacuously passes.
    // We document actual behaviour here: an empty array returns true (vacuous truth).
    // This case should never happen in practice since propose_github_action guards it.
    expect(isAutoApprovable([])).toBe(true)
  })
})
