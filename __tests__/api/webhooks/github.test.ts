import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVerify = vi.hoisted(() => vi.fn())
const mockRouteGithubEvent = vi.hoisted(() => vi.fn())
const mockBuildChains = vi.hoisted(() => vi.fn())
const mockExecuteChain = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/github/verify', () => ({ verifyGithubSignature: mockVerify }))
vi.mock('@/lib/github/router', () => ({ routeGithubEvent: mockRouteGithubEvent }))
vi.mock('@/lib/workflow-chain', () => ({
  buildChains: mockBuildChains,
  executeChain: mockExecuteChain,
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn((p: Promise<unknown>) => p) }))
vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [] }) }))

const CHANNEL_ID = 'channel-uuid'
const WORKSPACE_ID = 'workspace-uuid'

function chainStep(overrides = {}) {
  return {
    channelId: CHANNEL_ID,
    workspaceId: WORKSPACE_ID,
    chainGroup: null,
    chainType: 'parallel' as const,
    chainOrder: 0,
    ...overrides,
  }
}

function makeWebhookReq(payload: Record<string, unknown>, eventType: string, valid = true) {
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers: {
      'x-github-event': eventType,
      'x-hub-signature-256': valid ? 'sha256=valid' : 'sha256=bad',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

const PR_PAYLOAD = {
  action: 'opened',
  pull_request: { number: 1, title: 'Fix bug', user: { login: 'alice' }, merged: false },
  repository: { name: 'my-repo' },
  installation: { id: 123 },
}

describe('POST /api/webhooks/github', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockReturnValue(true)
    mockRouteGithubEvent.mockResolvedValue([])
    mockBuildChains.mockReturnValue([])
    mockExecuteChain.mockResolvedValue(undefined)
  })

  it('returns 401 when signature is invalid', async () => {
    mockVerify.mockReturnValue(false)
    const { POST } = await import('@/app/api/webhooks/github/route')
    const res = await POST(makeWebhookReq({}, 'pull_request', false))
    expect(res.status).toBe(401)
  })

  it('returns 200 and skips routing for unknown event types (no summary)', async () => {
    const { POST } = await import('@/app/api/webhooks/github/route')
    const res = await POST(makeWebhookReq({}, 'workflow_run'))
    expect(res.status).toBe(200)
    expect(mockRouteGithubEvent).not.toHaveBeenCalled()
  })

  it('returns 200 when no channels match the event', async () => {
    mockRouteGithubEvent.mockResolvedValue([])
    const { POST } = await import('@/app/api/webhooks/github/route')
    const res = await POST(makeWebhookReq(PR_PAYLOAD, 'pull_request'))
    expect(res.status).toBe(200)
    expect(mockServiceFrom).not.toHaveBeenCalled()
    expect(mockBuildChains).not.toHaveBeenCalled()
  })

  it('inserts system messages and calls buildChains + executeChain when channels match', async () => {
    const step = chainStep()
    mockRouteGithubEvent.mockResolvedValue([step])
    mockBuildChains.mockReturnValue([[step]])
    mockServiceFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) })

    let capturedPromise: Promise<unknown> | null = null
    const { waitUntil } = await import('@vercel/functions')
    vi.mocked(waitUntil).mockImplementationOnce((p: Promise<unknown>) => { capturedPromise = p })

    const { POST } = await import('@/app/api/webhooks/github/route')
    const res = await POST(makeWebhookReq(PR_PAYLOAD, 'pull_request'))
    await capturedPromise

    expect(res.status).toBe(200)
    expect(mockServiceFrom).toHaveBeenCalled()
    expect(mockBuildChains).toHaveBeenCalledWith([step])
    expect(mockExecuteChain).toHaveBeenCalledWith([step])
  })

  it('calls executeChain once per chain group', async () => {
    const stepA = chainStep({ channelId: 'ch-eng', chainGroup: 'pr-review', chainOrder: 0 })
    const stepB = chainStep({ channelId: 'ch-qa',  chainGroup: 'pr-review', chainOrder: 1 })
    mockRouteGithubEvent.mockResolvedValue([stepA, stepB])
    mockBuildChains.mockReturnValue([[stepA, stepB]])
    mockServiceFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) })

    let capturedPromise: Promise<unknown> | null = null
    const { waitUntil } = await import('@vercel/functions')
    vi.mocked(waitUntil).mockImplementationOnce((p: Promise<unknown>) => { capturedPromise = p })

    const { POST } = await import('@/app/api/webhooks/github/route')
    await POST(makeWebhookReq(PR_PAYLOAD, 'pull_request'))
    await capturedPromise

    expect(mockExecuteChain).toHaveBeenCalledOnce()
    expect(mockExecuteChain).toHaveBeenCalledWith([stepA, stepB])
  })

  it('still returns 200 when installation field is absent', async () => {
    mockRouteGithubEvent.mockResolvedValue([])
    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'opened',
      pull_request: { number: 2, title: 'No install', user: { login: 'bob' }, merged: false },
      repository: { name: 'my-repo' },
    }
    const res = await POST(makeWebhookReq(payload, 'pull_request'))
    expect(res.status).toBe(200)
    expect(mockRouteGithubEvent).toHaveBeenCalledWith('', 'pull_request', expect.any(Array))
  })

  it('routes check_run event → routeGithubEvent called with "check_run"', async () => {
    mockRouteGithubEvent.mockResolvedValue([])
    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'completed',
      check_run: { name: 'Lint', conclusion: 'failure', check_suite: { head_branch: 'main' } },
      repository: { full_name: 'owner/my-repo' },
      installation: { id: 123 },
    }
    const res = await POST(makeWebhookReq(payload, 'check_run'))
    expect(res.status).toBe(200)
    expect(mockRouteGithubEvent).toHaveBeenCalledWith(expect.any(String), 'check_run', expect.any(Array))
  })

  it('routes release event → routeGithubEvent called with "release"', async () => {
    mockRouteGithubEvent.mockResolvedValue([])
    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'published',
      release: { tag_name: 'v1.0.0' },
      repository: { full_name: 'owner/my-repo' },
      installation: { id: 123 },
    }
    const res = await POST(makeWebhookReq(payload, 'release'))
    expect(res.status).toBe(200)
    expect(mockRouteGithubEvent).toHaveBeenCalledWith(expect.any(String), 'release', expect.any(Array))
  })

  it('returns 401 for check_run with invalid signature', async () => {
    mockVerify.mockReturnValue(false)
    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'completed',
      check_run: { name: 'Lint', conclusion: 'failure', check_suite: { head_branch: 'main' } },
      repository: { full_name: 'owner/my-repo' },
      installation: { id: 123 },
    }
    const res = await POST(makeWebhookReq(payload, 'check_run', false))
    expect(res.status).toBe(401)
  })

  // UC-4-01: system message inserted for a matched event contains a meaningful summary
  it('UC-4-01: system message inserted in channel contains PR event summary', async () => {
    const step = chainStep()
    mockRouteGithubEvent.mockResolvedValue([step])
    mockBuildChains.mockReturnValue([[step]])

    let insertedPayload: Record<string, unknown> | null = null
    mockServiceFrom.mockReturnValue({
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        insertedPayload = payload
        return Promise.resolve({ error: null })
      }),
    })

    let capturedPromise: Promise<unknown> | null = null
    const { waitUntil } = await import('@vercel/functions')
    vi.mocked(waitUntil).mockImplementationOnce((p: Promise<unknown>) => { capturedPromise = p })

    const { POST } = await import('@/app/api/webhooks/github/route')
    await POST(makeWebhookReq(PR_PAYLOAD, 'pull_request'))
    await capturedPromise

    // The inserted system message must reference the PR
    // (summariseEvent is the real implementation — no mock — so it produces a real summary)
    expect(insertedPayload).not.toBeNull()
    expect(insertedPayload!.author_type).toBe('system')
    expect(typeof insertedPayload!.content).toBe('string')
    expect(insertedPayload!.content as string).toMatch(/Fix bug|#1|pull request|PR/i)
  })
})
