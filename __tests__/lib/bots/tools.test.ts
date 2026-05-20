/**
 * UC-16-04: advance_feature_stage tool is defined with required fields
 * UC-16-05: Alex (product) prompt mentions advance_feature_stage
 * UC-16-06: Casey (qa) prompt mentions advance_feature_stage
 * UC-16-07: advance_feature_stage tool has correct required fields in schema
 */
import { describe, it, expect } from 'vitest'
import { ADVANCE_FEATURE_STAGE_TOOL, PROPOSE_GITHUB_ACTION_TOOL } from '@/lib/bots/tools'
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
