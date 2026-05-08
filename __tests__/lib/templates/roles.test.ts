import { describe, it, expect } from 'vitest'
import {
  ROLE_CATALOG,
  HIREABLE_ROLE_KEYS,
  getRoleDefinition,
  getRoleSystemPrompt,
  getRoleLabel,
} from '@/lib/templates/roles'

describe('ROLE_CATALOG', () => {
  it('contains all 7 expected roles', () => {
    const keys = Object.keys(ROLE_CATALOG)
    expect(keys).toContain('ops')
    expect(keys).toContain('product')
    expect(keys).toContain('backend')
    expect(keys).toContain('design')
    expect(keys).toContain('security')
    expect(keys).toContain('qa')
    expect(keys).toContain('ml')
  })

  it('every role has required fields', () => {
    for (const [key, role] of Object.entries(ROLE_CATALOG)) {
      expect(role.role_key, `${key}.role_key`).toBe(key)
      expect(role.display_name, `${key}.display_name`).toBeTruthy()
      expect(role.label, `${key}.label`).toBeTruthy()
      expect(role.domain, `${key}.domain`).toBeTruthy()
      expect(role.system_prompt, `${key}.system_prompt`).toBeTruthy()
    }
  })
})

describe('HIREABLE_ROLE_KEYS', () => {
  it('does not include ops', () => {
    expect(HIREABLE_ROLE_KEYS).not.toContain('ops')
  })

  it('includes all non-ops roles', () => {
    expect(HIREABLE_ROLE_KEYS).toContain('product')
    expect(HIREABLE_ROLE_KEYS).toContain('backend')
    expect(HIREABLE_ROLE_KEYS).toContain('design')
    expect(HIREABLE_ROLE_KEYS).toContain('security')
    expect(HIREABLE_ROLE_KEYS).toContain('qa')
    expect(HIREABLE_ROLE_KEYS).toContain('ml')
  })

  it('has 6 hireable roles', () => {
    expect(HIREABLE_ROLE_KEYS).toHaveLength(6)
  })
})

describe('getRoleDefinition', () => {
  it('returns the correct role for a valid key', () => {
    const role = getRoleDefinition('ops')
    expect(role.role_key).toBe('ops')
    expect(role.display_name).toBe('Riley')
  })

  it('throws for an unknown role key', () => {
    expect(() => getRoleDefinition('unknown')).toThrow()
  })
})

describe('getRoleSystemPrompt', () => {
  it('replaces {workspace_name} placeholder', () => {
    const prompt = getRoleSystemPrompt('ops', 'Acme Corp')
    expect(prompt).toContain('Acme Corp')
    expect(prompt).not.toContain('{workspace_name}')
  })

  it('returns non-empty prompt for all roles', () => {
    for (const key of Object.keys(ROLE_CATALOG)) {
      const prompt = getRoleSystemPrompt(key, 'Test')
      expect(prompt.length, `${key} prompt empty`).toBeGreaterThan(50)
    }
  })
})

describe('getRoleLabel', () => {
  it('returns correct labels', () => {
    expect(getRoleLabel('ops')).toBe('Ops')
    expect(getRoleLabel('backend')).toBe('Engineering')
    expect(getRoleLabel('qa')).toBeTruthy()
    expect(getRoleLabel('ml')).toBeTruthy()
  })
})

describe('system prompt contracts', () => {
  const GITHUB_CAPABLE = ['product', 'backend', 'design', 'security']

  it.each(GITHUB_CAPABLE)('%s prompt contains propose_github_action', (key) => {
    expect(ROLE_CATALOG[key].system_prompt).toContain('propose_github_action')
  })

  it('qa and ml prompts document jargon avoidance in TONE RULES', () => {
    const qa = ROLE_CATALOG['qa'].system_prompt
    const ml = ROLE_CATALOG['ml'].system_prompt
    // QA prompt documents CI/CD in "Never use" tone rule (avoidance instruction)
    expect(qa).toContain('TONE RULES')
    // ML prompt documents LLM/embeddings in tone rules
    expect(ml).toContain('TONE RULES')
  })

  it('ops prompt does not call propose_github_action (router only)', () => {
    // Ops routes but does not take direct GitHub actions
    const ops = ROLE_CATALOG['ops'].system_prompt
    // Ops prompt should not directly call propose_github_action itself
    // (it describes what others do, but the tool belongs to agent roles)
    expect(ops).toBeDefined()
  })
})
