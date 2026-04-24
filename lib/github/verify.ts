import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verifies the GitHub webhook HMAC-SHA256 signature.
 * Returns true only if the signature is valid.
 *
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyGithubSignature(rawBody: Buffer, signature: string | null): boolean {
  if (!signature) return false

  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET env var is not set')

  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    // Buffers differ in length — definitely invalid
    return false
  }
}
