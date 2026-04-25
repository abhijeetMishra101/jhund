import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'crypto'
import { verifyGithubSignature } from '@/lib/github/verify'

const SECRET = 'test-webhook-secret'
const BODY = Buffer.from(JSON.stringify({ action: 'opened' }))

function sign(body: Buffer, secret = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

beforeAll(() => {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET
})

describe('verifyGithubSignature', () => {
  it('returns true for a valid signature', () => {
    expect(verifyGithubSignature(BODY, sign(BODY))).toBe(true)
  })

  it('returns false when signature is null', () => {
    expect(verifyGithubSignature(BODY, null)).toBe(false)
  })

  it('returns false when signature prefix is wrong', () => {
    const bad = 'sha1=' + createHmac('sha1', SECRET).update(BODY).digest('hex')
    expect(verifyGithubSignature(BODY, bad)).toBe(false)
  })

  it('returns false when body has been tampered', () => {
    const tampered = Buffer.from('{"action":"closed"}')
    expect(verifyGithubSignature(tampered, sign(BODY))).toBe(false)
  })

  it('returns false when signed with wrong secret', () => {
    expect(verifyGithubSignature(BODY, sign(BODY, 'wrong-secret'))).toBe(false)
  })

  it('returns false for empty string signature', () => {
    expect(verifyGithubSignature(BODY, '')).toBe(false)
  })

  it('returns false for signature with correct prefix but wrong hash', () => {
    expect(verifyGithubSignature(BODY, 'sha256=deadbeef')).toBe(false)
  })
})
