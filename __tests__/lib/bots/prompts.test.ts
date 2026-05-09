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
