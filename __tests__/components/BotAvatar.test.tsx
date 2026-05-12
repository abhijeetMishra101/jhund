/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BotAvatar } from '@/app/w/[slug]/components/BotAvatar'

describe('BotAvatar', () => {
  it('renders DiceBear URL with correct seed', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" />)
    const img = screen.getByTestId('bot-avatar-img') as HTMLImageElement
    expect(img.src).toContain('api.dicebear.com/7.x/avataaars/svg')
    expect(img.src).toContain('riley-ops-2026')
    expect(img.src).toContain('backgroundColor=b6e3f4')
  })

  it('shows no status dot when status prop is not provided', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" />)
    expect(screen.queryByTestId('bot-avatar-status-online')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bot-avatar-status-offline')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bot-avatar-status-busy')).not.toBeInTheDocument()
  })

  it('shows green dot when status=online', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" status="online" />)
    const dot = screen.getByTestId('bot-avatar-status-online')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#22c55e' })
  })

  it('shows yellow dot when status=busy', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" status="busy" />)
    const dot = screen.getByTestId('bot-avatar-status-busy')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#eab308' })
  })

  it('shows grey dot when status=offline', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" status="offline" />)
    const dot = screen.getByTestId('bot-avatar-status-offline')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveStyle({ backgroundColor: '#9ca3af' })
  })

  it('applies sm size (24px) correctly', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" size="sm" />)
    const img = screen.getByTestId('bot-avatar-img') as HTMLImageElement
    expect(img).toHaveAttribute('width', '24')
    expect(img).toHaveAttribute('height', '24')
  })

  it('applies md size (32px) correctly', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" size="md" />)
    const img = screen.getByTestId('bot-avatar-img') as HTMLImageElement
    expect(img).toHaveAttribute('width', '32')
    expect(img).toHaveAttribute('height', '32')
  })

  it('applies lg size (40px) correctly', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" size="lg" />)
    const img = screen.getByTestId('bot-avatar-img') as HTMLImageElement
    expect(img).toHaveAttribute('width', '40')
    expect(img).toHaveAttribute('height', '40')
  })

  it('defaults to md size when size is not provided', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" />)
    const img = screen.getByTestId('bot-avatar-img') as HTMLImageElement
    expect(img).toHaveAttribute('width', '32')
  })

  it('sets alt and title to displayName', () => {
    render(<BotAvatar seed="riley-ops-2026" displayName="Riley" />)
    const img = screen.getByTestId('bot-avatar-img') as HTMLImageElement
    expect(img).toHaveAttribute('alt', 'Riley')
    expect(img).toHaveAttribute('title', 'Riley')
  })
})
