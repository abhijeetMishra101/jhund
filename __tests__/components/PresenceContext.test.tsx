/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PresenceProvider, usePresence } from '@/app/w/[slug]/components/PresenceContext'

// Simple consumer component so we can call context functions from tests
function Consumer({ onRef }: { onRef: (ctx: ReturnType<typeof usePresence>) => void }) {
  const ctx = usePresence()
  onRef(ctx)
  const status = ctx.presenceMap['bot-1'] ?? 'not-set'
  return <div data-testid="status">{status}</div>
}

describe('PresenceContext', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('provides initial presence values to consumers', () => {
    render(
      <PresenceProvider initial={{ 'bot-1': 'online' }}>
        <Consumer onRef={() => {}} />
      </PresenceProvider>
    )
    expect(screen.getByTestId('status')).toHaveTextContent('online')
  })

  it('setPresence updates the presence map', () => {
    let ctx!: ReturnType<typeof usePresence>
    render(
      <PresenceProvider>
        <Consumer onRef={(c) => { ctx = c }} />
      </PresenceProvider>
    )
    expect(screen.getByTestId('status')).toHaveTextContent('not-set')

    act(() => { ctx.setPresence('bot-1', 'busy') })
    expect(screen.getByTestId('status')).toHaveTextContent('busy')
  })

  it('markBotActive sets status to online immediately', () => {
    let ctx!: ReturnType<typeof usePresence>
    render(
      <PresenceProvider>
        <Consumer onRef={(c) => { ctx = c }} />
      </PresenceProvider>
    )
    act(() => { ctx.markBotActive('bot-1') })
    expect(screen.getByTestId('status')).toHaveTextContent('online')
  })

  it('markBotActive reverts status to offline after 5 minutes', () => {
    let ctx!: ReturnType<typeof usePresence>
    render(
      <PresenceProvider>
        <Consumer onRef={(c) => { ctx = c }} />
      </PresenceProvider>
    )
    act(() => { ctx.markBotActive('bot-1') })
    expect(screen.getByTestId('status')).toHaveTextContent('online')

    // Advance past the 5-minute timeout
    act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1) })
    expect(screen.getByTestId('status')).toHaveTextContent('offline')
  })

  it('repeated markBotActive resets the timer', () => {
    let ctx!: ReturnType<typeof usePresence>
    render(
      <PresenceProvider>
        <Consumer onRef={(c) => { ctx = c }} />
      </PresenceProvider>
    )
    act(() => { ctx.markBotActive('bot-1') })
    // Advance 4 minutes, call markBotActive again
    act(() => { vi.advanceTimersByTime(4 * 60 * 1000) })
    act(() => { ctx.markBotActive('bot-1') })
    // Another 4 minutes — still online (timer was reset)
    act(() => { vi.advanceTimersByTime(4 * 60 * 1000) })
    expect(screen.getByTestId('status')).toHaveTextContent('online')
    // Advance past remaining 1 minute — now offline
    act(() => { vi.advanceTimersByTime(60 * 1001) })
    expect(screen.getByTestId('status')).toHaveTextContent('offline')
  })
})
