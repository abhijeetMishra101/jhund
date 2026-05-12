/**
 * Phase 14 — Multi-bot channel routing tests
 *
 * These tests exercise `resolveBotForMessage` from lib/bots/index directly,
 * so they must NOT mock the @/lib/bots module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() }
  },
}))

vi.mock('@/lib/bots/context', () => ({
  buildMessageHistory: vi.fn().mockResolvedValue([{ role: 'user', content: 'hello' }]),
}))

const CHANNEL_ID = 'ch-uuid'
const WORKSPACE_ID = 'ws-uuid'
const SAM_BOT_ID = 'bot-sam-id'
const CASEY_BOT_ID = 'bot-casey-id'

const SAM_BOT = {
  id: SAM_BOT_ID, workspace_id: WORKSPACE_ID, role_key: 'backend',
  display_name: 'Sam', system_prompt: 'You are Sam.', avatar_seed: 'sam',
  status: 'online' as const, status_updated_at: null, created_at: '',
}
const CASEY_BOT = {
  id: CASEY_BOT_ID, workspace_id: WORKSPACE_ID, role_key: 'qa',
  display_name: 'Casey', system_prompt: 'You are Casey.', avatar_seed: 'casey',
  status: 'online' as const, status_updated_at: null, created_at: '',
}

function membersChain(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function botRolesInChain(bots: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: bots, error: null }),
  }
}

function channelSingleChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: data ? null : { message: 'not found' } }),
  }
}

describe('resolveBotForMessage — multi-bot channel routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
  })

  it('routes to Casey when message starts with @Casey in Sam+Casey channel', async () => {
    const memberRows = [
      { bot_role_id: SAM_BOT_ID, is_primary: true },
      { bot_role_id: CASEY_BOT_ID, is_primary: false },
    ]

    mockServiceFrom
      .mockReturnValueOnce(membersChain(memberRows))
      .mockReturnValueOnce(botRolesInChain([SAM_BOT, CASEY_BOT]))

    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, '@Casey fix the tests')

    expect(bot?.id).toBe(CASEY_BOT_ID)
    expect(bot?.display_name).toBe('Casey')
  })

  it('routes to Sam (primary) when no @mention', async () => {
    const memberRows = [
      { bot_role_id: SAM_BOT_ID, is_primary: true },
      { bot_role_id: CASEY_BOT_ID, is_primary: false },
    ]

    mockServiceFrom
      .mockReturnValueOnce(membersChain(memberRows))
      .mockReturnValueOnce(botRolesInChain([SAM_BOT, CASEY_BOT]))

    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, 'Can you review the PR?')

    expect(bot?.id).toBe(SAM_BOT_ID)
    expect(bot?.display_name).toBe('Sam')
  })

  it('routes to Sam (primary) when @mention does not match any channel member', async () => {
    const memberRows = [
      { bot_role_id: SAM_BOT_ID, is_primary: true },
      { bot_role_id: CASEY_BOT_ID, is_primary: false },
    ]

    mockServiceFrom
      .mockReturnValueOnce(membersChain(memberRows))
      .mockReturnValueOnce(botRolesInChain([SAM_BOT, CASEY_BOT]))

    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, '@Jordan any design thoughts?')

    // Unknown @mention → falls through to primary
    expect(bot?.id).toBe(SAM_BOT_ID)
  })

  it('falls back to channels.bot_role_id when no channel_members rows exist', async () => {
    mockServiceFrom
      .mockReturnValueOnce(membersChain([]))                          // no members
      .mockReturnValueOnce(channelSingleChain({ bot_role_id: SAM_BOT_ID }))  // channels fallback
      .mockReturnValueOnce(channelSingleChain(SAM_BOT))              // bot_roles lookup

    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, 'hello')

    expect(bot?.id).toBe(SAM_BOT_ID)
  })
})
