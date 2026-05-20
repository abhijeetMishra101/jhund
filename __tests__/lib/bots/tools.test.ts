/**
 * UC-16-04: advance_feature_stage tool is defined with required fields
 * UC-16-05: Alex (product) prompt mentions advance_feature_stage
 * UC-16-06: Casey (qa) prompt mentions advance_feature_stage
 * UC-16-07: advance_feature_stage tool has correct required fields in schema
 * UC-16B-10: create_feature tool is exported and has correct schema
 * UC-16B-11: Alex prompt instructs to use create_feature for feature ideas
 * UC-16B-12: Jordan prompt has handoff awareness for stages 2 and 3
 * UC-16B-13: Casey prompt has handoff awareness for stage 6
 * UC-16B-14: Riley prompt has handoff awareness for stage 7
 */
import { describe, it, expect } from 'vitest'
import { ADVANCE_FEATURE_STAGE_TOOL, PROPOSE_GITHUB_ACTION_TOOL, CREATE_FEATURE_TOOL } from '@/lib/bots/tools'
import { ROLE_CATALOG } from '@/lib/templates/roles'

describe('ADVANCE_FEATURE_STAGE_TOOL — UC-16-04, UC-16-07', () => {
  it('UC-16-04: is exported and named correctly', () => {
    expect(ADVANCE_FEATURE_STAGE_TOOL).toBeDefined()
    expect(ADVANCE_FEATURE_STAGE_TOOL.name).toBe('advance_feature_stage')
  })

  it('UC-16-07: required fields are feature_id, to_stage, gate_type, notes', () => {
    const schema = ADVANCE_FEATURE_STAGE_TOOL.input_schema as unknown as {
      required: string[]
      properties: Record<string, { type?: string; enum?: string[] }>
    }
    expect(schema.required).toEqual(
      expect.arrayContaining(['feature_id', 'to_stage', 'gate_type', 'notes'])
    )
    expect(schema.required).toHaveLength(4)
  })

  it('gate_type enum includes bot_signoff, founder_approval, auto_clear', () => {
    const schema = ADVANCE_FEATURE_STAGE_TOOL.input_schema as unknown as {
      properties: {
        gate_type: { enum: string[] }
      }
    }
    expect(schema.properties.gate_type.enum).toEqual(
      expect.arrayContaining(['bot_signoff', 'founder_approval', 'auto_clear'])
    )
  })

  it('feature_id and notes are string type', () => {
    const schema = ADVANCE_FEATURE_STAGE_TOOL.input_schema as unknown as {
      properties: {
        feature_id: { type: string }
        notes: { type: string }
      }
    }
    expect(schema.properties.feature_id.type).toBe('string')
    expect(schema.properties.notes.type).toBe('string')
  })

  it('to_stage is number type', () => {
    const schema = ADVANCE_FEATURE_STAGE_TOOL.input_schema as unknown as {
      properties: { to_stage: { type: string } }
    }
    expect(schema.properties.to_stage.type).toBe('number')
  })
})

describe('PROPOSE_GITHUB_ACTION_TOOL — still present and named correctly', () => {
  it('is exported and named correctly', () => {
    expect(PROPOSE_GITHUB_ACTION_TOOL).toBeDefined()
    expect(PROPOSE_GITHUB_ACTION_TOOL.name).toBe('propose_github_action')
  })
})

describe('Alex (product) system prompt — UC-16-05', () => {
  it('UC-16-05: Alex prompt mentions advance_feature_stage tool', () => {
    const alex = ROLE_CATALOG['product']
    expect(alex).toBeDefined()
    expect(alex.system_prompt).toContain('advance_feature_stage')
  })

  it('Alex prompt specifies stage 1 → 2 gate', () => {
    const alex = ROLE_CATALOG['product']
    expect(alex.system_prompt).toMatch(/stage 1.*stage 2|Idea.*Requirements/i)
  })
})

describe('Casey (qa) system prompt — UC-16-06', () => {
  it('UC-16-06: Casey prompt mentions advance_feature_stage tool', () => {
    const casey = ROLE_CATALOG['qa']
    expect(casey).toBeDefined()
    expect(casey.system_prompt).toContain('advance_feature_stage')
  })

  it('Casey prompt specifies stage 6 → 7 gate (QA → Shipped)', () => {
    const casey = ROLE_CATALOG['qa']
    expect(casey.system_prompt).toMatch(/stage 6.*stage 7|QA.*Shipped/i)
  })

  it('Casey prompt specifies verified_at or waived_at gate condition', () => {
    const casey = ROLE_CATALOG['qa']
    expect(casey.system_prompt).toMatch(/verified_at|waived_at/i)
  })
})

// ── CREATE_FEATURE_TOOL ───────────────────────────────────────────────────────

describe('CREATE_FEATURE_TOOL — UC-16B-10', () => {
  it('UC-16B-10: is exported and named correctly', () => {
    expect(CREATE_FEATURE_TOOL).toBeDefined()
    expect(CREATE_FEATURE_TOOL.name).toBe('create_feature')
  })

  it('required fields are title, description, complexity', () => {
    const schema = CREATE_FEATURE_TOOL.input_schema as unknown as {
      required: string[]
      properties: Record<string, unknown>
    }
    expect(schema.required).toEqual(
      expect.arrayContaining(['title', 'description', 'complexity'])
    )
    expect(schema.required).toHaveLength(3)
  })

  it('complexity enum has hotfix, small, medium, large', () => {
    const schema = CREATE_FEATURE_TOOL.input_schema as unknown as {
      properties: { complexity: { enum: string[] } }
    }
    expect(schema.properties.complexity.enum).toEqual(
      expect.arrayContaining(['hotfix', 'small', 'medium', 'large'])
    )
  })

  it('description mentions Pipeline as source of truth', () => {
    expect(CREATE_FEATURE_TOOL.description).toContain('Pipeline')
    // The description explicitly warns NOT to use propose_github_action — correct
    expect(CREATE_FEATURE_TOOL.description).toContain('source of truth')
  })
})

// ── Role prompt: Phase 16B handoff awareness ──────────────────────────────────

describe('Alex (product) Phase 16B — UC-16B-11', () => {
  it('UC-16B-11: Alex prompt instructs to use create_feature tool for feature ideas', () => {
    const alex = ROLE_CATALOG['product']
    expect(alex.system_prompt).toContain('create_feature')
  })

  it('Alex prompt says Pipeline is source of truth for features', () => {
    const alex = ROLE_CATALOG['product']
    expect(alex.system_prompt).toContain('Pipeline')
  })
})

describe('Jordan (design) Phase 16B — UC-16B-12', () => {
  it('UC-16B-12: Jordan prompt mentions feasibility review for stage 2 handoff', () => {
    const jordan = ROLE_CATALOG['design']
    expect(jordan.system_prompt).toContain('feasibility review')
    expect(jordan.system_prompt).toMatch(/Stage 2|stage 2/i)
  })

  it('Jordan prompt mentions Clear or Red Flag response', () => {
    const jordan = ROLE_CATALOG['design']
    expect(jordan.system_prompt).toMatch(/Clear|Red Flag/)
  })

  it('Jordan prompt mentions stage 3 full design', () => {
    const jordan = ROLE_CATALOG['design']
    expect(jordan.system_prompt).toMatch(/Stage 3|stage 3/i)
  })
})

describe('Casey (qa) Phase 16B — UC-16B-13', () => {
  it('UC-16B-13: Casey prompt mentions stage 6 handoff awareness', () => {
    const casey = ROLE_CATALOG['qa']
    expect(casey.system_prompt).toMatch(/handoff.*stage 6|stage 6.*handoff/i)
  })
})

describe('Riley (ops) Phase 16B — UC-16B-14', () => {
  it('UC-16B-14: Riley prompt mentions shipped announcement for stage 7 handoff', () => {
    const riley = ROLE_CATALOG['ops']
    expect(riley.system_prompt).toMatch(/shipped|🚀/i)
    expect(riley.system_prompt).toMatch(/stage 7|announce/i)
  })
})
