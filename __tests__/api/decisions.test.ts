/**
 * Tests for GET /api/decisions
 *
 * UC-19-06: unauthenticated → 401
 * UC-19-07: authenticated with decisions → 200 { decisions: [...] }
 * UC-19-08: authenticated, no decisions → 200 { decisions: [] }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

const DECISIONS = [
  {
    id: 'dec-1',
    title: 'Use TypeScript strict mode',
    summary: 'Enables strictNullChecks',
    action: null,
    action_dispatched_at: null,
    channel_id: 'ch-1',
    bot_role_id: 'bot-1',
    created_at: '2026-05-26T10:00:00.000Z',
  },
]

function usersChain(workspaceId: string) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { workspace_id: workspaceId }, error: null }),
      }),
    }),
  }
}

function decisionsChain(decisions: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: decisions, error: null }),
        }),
      }),
    }),
  }
}

function decisionsErrorChain() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    }),
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('UC-19-06: unauthenticated → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { GET } = await import('@/app/api/decisions/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('UC-19-07: authenticated with decisions → 200 with decisions array', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    mockServiceFrom
      .mockReturnValueOnce(usersChain('ws-1'))
      .mockReturnValueOnce(decisionsChain(DECISIONS))

    const { GET } = await import('@/app/api/decisions/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.decisions).toHaveLength(1)
    expect(body.decisions[0].title).toBe('Use TypeScript strict mode')
  })

  it('UC-19-08: authenticated, no decisions → 200 with empty array', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    mockServiceFrom
      .mockReturnValueOnce(usersChain('ws-1'))
      .mockReturnValueOnce(decisionsChain([]))

    const { GET } = await import('@/app/api/decisions/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.decisions).toEqual([])
  })

  it('user not found → 404', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-orphan' } } })

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })

    const { GET } = await import('@/app/api/decisions/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('User not found')
  })

  it('DB error on decisions query → 500', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    mockServiceFrom
      .mockReturnValueOnce(usersChain('ws-1'))
      .mockReturnValueOnce(decisionsErrorChain())

    const { GET } = await import('@/app/api/decisions/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('Failed to fetch decisions')
  })
})
