/**
 * Tests for lib/feature-stages/dispatch.ts
 *
 * UC-16B-01: handoffMessage returns expected strings per stage
 * UC-16B-02: handoffMessage fallback for unknown stage
 * UC-16B-03: getDispatchTargets returns empty array for unconfigured stage
 * UC-16B-04: getDispatchTargets returns channel IDs for stage 2 (design + ml, parallel)
 * UC-16B-05: getDispatchTargets returns empty array when no rows match
 * UC-16B-06: postHandoffMessage inserts system message and returns id
 * UC-16B-07: postHandoffMessage throws when insert fails
 * UC-16B-08: STAGE_DISPATCH uses 'backend' (not 'engineering') for stages 4 and 5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handoffMessage,
  getDispatchTargets,
  postHandoffMessage,
  STAGE_DISPATCH,
} from '@/lib/feature-stages/dispatch'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

// ── handoffMessage ────────────────────────────────────────────────────────────

describe('handoffMessage', () => {
  it('UC-16B-01: stage 2 mentions feasibility review', () => {
    const msg = handoffMessage('Dark Mode', 2)
    expect(msg).toContain('Dark Mode')
    expect(msg).toContain('feasibility review')
  })

  it('UC-16B-01: stage 3 mentions design', () => {
    const msg = handoffMessage('Dark Mode', 3)
    expect(msg).toContain('Dark Mode')
    expect(msg).toContain('Design')
  })

  it('UC-16B-01: stage 6 mentions QA', () => {
    const msg = handoffMessage('Dark Mode', 6)
    expect(msg).toContain('Dark Mode')
    expect(msg).toContain('QA')
  })

  it('UC-16B-01: stage 7 contains shipped rocket emoji', () => {
    const msg = handoffMessage('Dark Mode', 7)
    expect(msg).toContain('🚀')
    expect(msg).toContain('Dark Mode')
  })

  it('UC-16B-02: unknown stage returns generic fallback', () => {
    const msg = handoffMessage('Dark Mode', 99)
    expect(msg).toContain('Dark Mode')
    expect(msg).toContain('Stage 99')
  })
})

// ── STAGE_DISPATCH correctness ────────────────────────────────────────────────

describe('STAGE_DISPATCH', () => {
  it('UC-16B-08: stages 4 and 5 use "backend" role key, not "engineering"', () => {
    expect(STAGE_DISPATCH[4].roles).toContain('backend')
    expect(STAGE_DISPATCH[4].roles).not.toContain('engineering')
    expect(STAGE_DISPATCH[5].roles).toContain('backend')
    expect(STAGE_DISPATCH[5].roles).not.toContain('engineering')
  })

  it('stage 2 is parallel with design and ml', () => {
    expect(STAGE_DISPATCH[2].parallel).toBe(true)
    expect(STAGE_DISPATCH[2].roles).toEqual(expect.arrayContaining(['design', 'ml']))
  })

  it('stage 6 is sequential with qa', () => {
    expect(STAGE_DISPATCH[6].parallel).toBe(false)
    expect(STAGE_DISPATCH[6].roles).toEqual(['qa'])
  })

  it('stage 7 is sequential with ops', () => {
    expect(STAGE_DISPATCH[7].parallel).toBe(false)
    expect(STAGE_DISPATCH[7].roles).toEqual(['ops'])
  })
})

// ── getDispatchTargets ────────────────────────────────────────────────────────

describe('getDispatchTargets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('UC-16B-03: returns empty array for stage 0 (no config)', async () => {
    const targets = await getDispatchTargets('ws-1', 0)
    expect(targets).toEqual([])
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('UC-16B-04: returns channel IDs with parallel=true for stage 2', async () => {
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [
          { channel_id: 'ch-design', bot_roles: { role_key: 'design' }, channels: { workspace_id: 'ws-1', channel_type: 'channel' } },
          { channel_id: 'ch-ml', bot_roles: { role_key: 'ml' }, channels: { workspace_id: 'ws-1', channel_type: 'channel' } },
        ],
        error: null,
      }),
    })

    const targets = await getDispatchTargets('ws-1', 2)
    expect(targets).toHaveLength(2)
    expect(targets[0].channelId).toBe('ch-design')
    expect(targets[0].parallel).toBe(true)
    expect(targets[1].channelId).toBe('ch-ml')
    expect(targets[1].parallel).toBe(true)
  })

  it('UC-16B-05: returns empty array when DB returns no rows', async () => {
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    const targets = await getDispatchTargets('ws-1', 6)
    expect(targets).toEqual([])
  })

  it('returns empty array when DB rows is empty array', async () => {
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const targets = await getDispatchTargets('ws-1', 7)
    expect(targets).toEqual([])
  })
})

// ── postHandoffMessage ────────────────────────────────────────────────────────

describe('postHandoffMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('UC-16B-06: inserts system message and returns the new message id', async () => {
    const insertFn = vi.fn().mockReturnThis()
    const selectFn = vi.fn().mockReturnThis()
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'msg-99' }, error: null })

    mockServiceFrom.mockReturnValueOnce({
      insert: insertFn,
      select: selectFn,
      single: singleFn,
    })

    const id = await postHandoffMessage('ch-design', 'Dark Mode', 2)
    expect(id).toBe('msg-99')
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'ch-design',
        author_type: 'system',
      })
    )
  })

  it('UC-16B-07: throws when insert returns an error', async () => {
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
    })

    await expect(postHandoffMessage('ch-design', 'Dark Mode', 2)).rejects.toThrow(
      'Failed to post handoff message'
    )
  })
})
