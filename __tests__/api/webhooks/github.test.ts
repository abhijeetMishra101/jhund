import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

const mockVerify = vi.hoisted(() => vi.fn())
const mockRouteGithubEvent = vi.hoisted(() => vi.fn())
const mockRespondToMessage = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/github/verify', () => ({ verifyGithubSignature: mockVerify }))
vi.mock('@/lib/github/router', () => ({ routeGithubEvent: mockRouteGithubEvent }))
vi.mock('@/lib/bots', () => ({ respondToMessage: mockRespondToMessage }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn((p: Promise<unknown>) => p) }))
vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [] }) }))

const CHANNEL_ID = 'channel-uuid'
const WORKSPACE_ID = 'workspace-uuid'

function makeWebhookReq(payload: Record<string, unknown>, eventType: string, valid = true) {
  const body = JSON.stringify(payload)
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers: {
      'x-github-event': eventType,
      'x-hub-signature-256': valid ? 'sha256=valid' : 'sha256=bad',
      'content-type': 'application/json',
    },
    body,
  })
}

describe('POST /api/webhooks/github', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockReturnValue(true)
    mockRouteGithubEvent.mockResolvedValue([])
    mockRespondToMessage.mockResolvedValue('msg-uuid')
  })

  it('returns 401 when signature is invalid', async () => {
    mockVerify.mockReturnValue(false)
    const { POST } = await import('@/app/api/webhooks/github/route')
    const req = makeWebhookReq({}, 'pull_request', false)
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 ok when event produces no summary (unknown type)', async () => {
    const { POST } = await import('@/app/api/webhooks/github/route')
    const req = makeWebhookReq({}, 'workflow_run')
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockRouteGithubEvent).not.toHaveBeenCalled()
  })

  it('returns 200 ok when no channels match the event', async () => {
    mockRouteGithubEvent.mockResolvedValue([])
    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'opened',
      pull_request: { number: 1, title: 'Fix bug', user: { login: 'alice' }, merged: false },
      repository: { name: 'my-repo' },
      installation: { id: 123 },
    }
    const res = await POST(makeWebhookReq(payload, 'pull_request'))
    expect(res.status).toBe(200)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('returns 200 ok when installation field is absent (installationId defaults to empty string)', async () => {
    mockRouteGithubEvent.mockResolvedValue([])
    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'opened',
      pull_request: { number: 2, title: 'No install', user: { login: 'bob' }, merged: false },
      repository: { name: 'my-repo' },
      // no installation field
    }
    const res = await POST(makeWebhookReq(payload, 'pull_request'))
    expect(res.status).toBe(200)
    expect(mockRouteGithubEvent).toHaveBeenCalledWith('', 'pull_request', expect.any(Array))
  })

  it('inserts a system message and calls respondToMessage when a channel matches', async () => {
    mockRouteGithubEvent.mockResolvedValue([{ channelId: CHANNEL_ID, workspaceId: WORKSPACE_ID }])
    mockServiceFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'msg-uuid' }, error: null }),
    })

    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'opened',
      pull_request: { number: 1, title: 'Fix bug', user: { login: 'alice' }, merged: false },
      repository: { name: 'my-repo' },
      installation: { id: 123 },
    }
    const res = await POST(makeWebhookReq(payload, 'pull_request'))

    expect(res.status).toBe(200)
    expect(mockServiceFrom).toHaveBeenCalled()
    expect(mockRespondToMessage).toHaveBeenCalledWith(CHANNEL_ID, WORKSPACE_ID)
  })

  it('does not crash and still returns 200 when respondToMessage throws inside the waitUntil map', async () => {
    mockRouteGithubEvent.mockResolvedValue([{ channelId: CHANNEL_ID, workspaceId: WORKSPACE_ID }])
    mockRespondToMessage.mockRejectedValueOnce(new Error('bot failure'))
    mockServiceFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'msg-uuid' }, error: null }),
    })

    // Capture the promise from waitUntil so we can await it
    let capturedPromise: Promise<unknown> | null = null
    const { waitUntil } = await import('@vercel/functions')
    vi.mocked(waitUntil).mockImplementationOnce((p: Promise<unknown>) => {
      capturedPromise = p
    })

    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'opened',
      pull_request: { number: 1, title: 'Fix bug', user: { login: 'alice' }, merged: false },
      repository: { name: 'my-repo' },
      installation: { id: 123 },
    }
    const res = await POST(makeWebhookReq(payload, 'pull_request'))
    expect(res.status).toBe(200)

    // Await the background task — should not throw
    await capturedPromise
    // respondToMessage was called and threw, but it was caught
    expect(mockRespondToMessage).toHaveBeenCalledWith(CHANNEL_ID, WORKSPACE_ID)
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
    expect(mockRouteGithubEvent).toHaveBeenCalledWith(
      expect.any(String),
      'check_run',
      expect.any(Array)
    )
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
    expect(mockRouteGithubEvent).toHaveBeenCalledWith(
      expect.any(String),
      'release',
      expect.any(Array)
    )
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

  it('skips respondToMessage when message insert returns null', async () => {
    mockRouteGithubEvent.mockResolvedValue([{ channelId: CHANNEL_ID, workspaceId: WORKSPACE_ID }])
    mockServiceFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    })

    const { POST } = await import('@/app/api/webhooks/github/route')
    const payload = {
      action: 'opened',
      pull_request: { number: 1, title: 'PR', user: { login: 'bob' }, merged: false },
      repository: { name: 'repo' },
      installation: { id: 123 },
    }
    await POST(makeWebhookReq(payload, 'pull_request'))
    expect(mockRespondToMessage).not.toHaveBeenCalled()
  })
})
