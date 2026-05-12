/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChannelSidebar } from '@/app/w/[slug]/components/ChannelSidebar'

const CHANNELS = [
  { id: 'ch-1', name: 'engineering', display_name: 'Engineering', workspace_id: 'ws-1', bot_role_id: null, position: 0, archived: false, channel_type: 'channel' as const, created_at: '' },
  { id: 'ch-2', name: 'product',     display_name: 'Product',     workspace_id: 'ws-1', bot_role_id: null, position: 1, archived: false, channel_type: 'channel' as const, created_at: '' },
]

function renderSidebar(overrides: Partial<Parameters<typeof ChannelSidebar>[0]> = {}) {
  const props = {
    workspaceName: 'Acme',
    workspaceSlug: 'acme',
    channels: CHANNELS,
    activeChannelId: 'ch-1',
    actionsUsed: 10,
    actionCap: 50,
    onSelect: vi.fn(),
    ...overrides,
  }
  return { onSelect: props.onSelect, ...render(<ChannelSidebar {...props} />) }
}

describe('ChannelSidebar', () => {
  it('renders workspace name', () => {
    renderSidebar()
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('renders all channels', () => {
    renderSidebar()
    expect(screen.getByText('# Engineering')).toBeInTheDocument()
    expect(screen.getByText('# Product')).toBeInTheDocument()
  })

  it('marks the active channel with aria-current="page"', () => {
    renderSidebar({ activeChannelId: 'ch-1' })
    expect(screen.getByTestId('channel-ch-1')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('channel-ch-2')).not.toHaveAttribute('aria-current')
  })

  it('calls onSelect with the channel id when clicked', async () => {
    const { onSelect } = renderSidebar()
    await userEvent.click(screen.getByTestId('channel-ch-2'))
    expect(onSelect).toHaveBeenCalledWith('ch-2')
  })

  it('renders the action counter', () => {
    renderSidebar({ actionsUsed: 20, actionCap: 50 })
    expect(screen.getByTestId('action-counter-label')).toHaveTextContent('20 / 50')
  })

  it('renders empty channel list gracefully', () => {
    renderSidebar({ channels: [] })
    expect(screen.queryByTestId(/^channel-/)).not.toBeInTheDocument()
  })
})
