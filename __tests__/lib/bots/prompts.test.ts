/**
 * Prompt contract tests — no API calls, no mocks needed.
 *
 * These tests enforce that every bot capable of GitHub actions explicitly
 * instructs Claude to call the propose_github_action tool. If a prompt is
 * edited to remove that instruction, CI will catch it before deployment.
 */
import { describe, it, expect } from 'vitest'
import { ROLE_CATALOG } from '@/lib/templates/roles'

const GITHUB_CAPABLE_ROLES = ['backend', 'product', 'design', 'security']

describe('bot system prompts — propose_github_action tool contract', () => {
  it.each(GITHUB_CAPABLE_ROLES)(
    '%s bot prompt instructs Claude to call propose_github_action tool',
    (roleKey) => {
      const role = ROLE_CATALOG[roleKey]
      expect(role, `No role found with key "${roleKey}"`).toBeDefined()
      expect(role.system_prompt).toContain('propose_github_action')
    }
  )

  it('ops bot does not perform GitHub actions (no tool instruction needed)', () => {
    const ops = ROLE_CATALOG['ops']
    expect(ops).toBeDefined()
    // Ops is a router/admin bot — no direct GitHub actions
    // This test documents the intentional omission, not a gap
  })

  it.each(GITHUB_CAPABLE_ROLES)(
    '%s bot prompt does not instruct Claude to describe plans in text instead of using the tool',
    (roleKey) => {
      const role = ROLE_CATALOG[roleKey]
      // These phrases caused the regression — bot wrote text plans instead of calling the tool
      expect(role.system_prompt).not.toMatch(/post a plain-English plan/i)
      expect(role.system_prompt).not.toMatch(/propose a plan(?! using| card)/i)
    }
  )
})

// ── UC-7-04: Bot refuses push-to-main ────────────────────────────────────────
describe('bot system prompts — push-to-main prevention (UC-7-04)', () => {
  it('backend (Sam) prompt explicitly forbids pushing directly to main', () => {
    const backend = ROLE_CATALOG['backend']
    // The system prompt must contain an explicit constraint against direct pushes.
    // This ensures Claude refuses when a founder asks "push this to main".
    expect(backend.system_prompt).toMatch(/never push.*main|direct.*push/i)
  })

  it('backend (Sam) prompt requires all branches to start with "bot/"', () => {
    const backend = ROLE_CATALOG['backend']
    // Every code change must go through a bot/ branch → PR, never direct to main.
    // This is the structural enforcement of the no-direct-push rule.
    expect(backend.system_prompt).toContain('bot/')
  })

  it('backend (Sam) prompt instructs using pull requests for all code changes', () => {
    const backend = ROLE_CATALOG['backend']
    expect(backend.system_prompt).toMatch(/pull request/i)
  })

  it('propose_github_action tool enum in backend prompt has no push_to_main action type', () => {
    // The available action types listed in the system prompt must not include
    // any direct-push variant. The tool's enum is the hard structural gate.
    const backend = ROLE_CATALOG['backend']
    expect(backend.system_prompt).not.toMatch(/push_to_main|push_to_branch|direct_push/i)
    // PR-based workflow action types are present
    expect(backend.system_prompt).toContain('commit_file')
    expect(backend.system_prompt).toContain('create_pr')
  })
})
