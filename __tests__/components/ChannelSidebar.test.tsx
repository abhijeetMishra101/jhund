/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChannelSidebar } from '@/app/w/[slug]/components/ChannelSidebar'
import { PresenceProvider } from '@/app/w/[slug]/components/PresenceContext'
import type { ChannelWithMembers } from '@/lib/supabase/types'

const MEMBER_SAM = {
  bot_role_id: 'bot-sam', display_name: 'Sam', avatar_seed: 'sam-engineering-2026',
  role_key: 'backend', is_primary: true, status: 'online' as const,
}
const MEMBER_CASEY = {
  bot_role_id: 'bot-casey', display_name: 'Casey', avatar_seed: 'casey-qa-2026',
  role_key: 'qa', is_primary: false, status: 'offline' as const,
}
const MEMBER_RILEY = {
  bot_role_id: 'bot-riley', display_name: 'Riley', avatar_seed: 'riley-ops-2026',
  role_key: 'ops', is_primary: true, status: 'online' as const,
}

const CHANNELS: ChannelWithMembers[] = [
  {
    id: 'ch-1', name: 'engineering', display_name: 'Engineering',
    workspace_id: 'ws-1', bot_role_id: null, position: 0, archived: false, created_at: '',
    channel_type: 'channel', members: [MEMBER_SAM, MEMBER_CASEY],
  },
  {
    id: 'ch-2', name: 'product', display_name: 'Product',
    workspace_id: 'ws-1', bot_role_id: null, position: 1, archived: false, created_at: '',
    channel_type: 'channel', members: [],
  },
]

const DM_CHANNELS: ChannelWithMembers[] = [
  {
    id: 'dm-riley', name: 'dm-ops', display_name: 'Riley',
    workspace_id: 'ws-1', bot_role_id: 'bot-riley', position: 99, archived: false, created_at: '',
    channel_type: 'dm', members: [MEMBER_RILEY],
  },
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
  return {
    onSelect: props.onSelect,
    ...render(
      <PresenceProvider>
        <ChannelSidebar {...props} />
      </PresenceProvider>
    ),
  }
}

describe('ChannelSidebar', () => {
  it('renders workspace name', () => {
    renderSidebar()
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('renders CHANNELS section label', () => {
    renderSidebar()
    expect(screen.getByTestId('channels-section-label')).toBeInTheDocument()
  })

  it('renders all regular channels', () => {
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

  // ── Hover coverage (branch coverage for mouseEnter/mouseLeave handlers) ──

  it('changes background on mouseEnter for inactive channel', () => {
    renderSidebar({ activeChannelId: 'ch-1' })
    const inactiveBtn = screen.getByTestId('channel-ch-2')
    fireEvent.mouseEnter(inactiveBtn)
    expect(inactiveBtn.style.backgroundColor).toBe('rgb(39, 41, 45)')
  })

  it('restores background on mouseLeave for inactive channel', () => {
    renderSidebar({ activeChannelId: 'ch-1' })
    const inactiveBtn = screen.getByTestId('channel-ch-2')
    fireEvent.mouseEnter(inactiveBtn)
    fireEvent.mouseLeave(inactiveBtn)
    expect(inactiveBtn.style.backgroundColor).toBe('transparent')
  })

  it('does not change background on hover for active channel', () => {
    renderSidebar({ activeChannelId: 'ch-1' })
    const activeBtn = screen.getByTestId('channel-ch-1')
    const initialBg = activeBtn.style.backgroundColor
    fireEvent.mouseEnter(activeBtn)
    expect(activeBtn.style.backgroundColor).toBe(initialBg)
    fireEvent.mouseLeave(activeBtn)
    expect(activeBtn.style.backgroundColor).toBe(initialBg)
  })

  // ── Phase 14: multi-bot avatars + DM section ──

  it('shows member avatars (BotAvatar images) in regular channel row', () => {
    renderSidebar()
    // Engineering has Sam + Casey — both avatars should render
    const avatarImgs = screen.getAllByTestId('bot-avatar-img')
    expect(avatarImgs.length).toBeGreaterThanOrEqual(2)
  })

  it('shows overflow count when channel has more than 3 members', () => {
    const manyMembers = Array.from({ length: 5 }, (_, i) => ({
      bot_role_id: `bot-${i}`,
      display_name: `Bot${i}`,
      avatar_seed: `seed-${i}`,
      role_key: 'backend',
      is_primary: i === 0,
      status: 'online' as const,
    }))
    const ch: ChannelWithMembers = {
      ...CHANNELS[0], id: 'ch-many', members: manyMembers,
    }
    renderSidebar({ channels: [ch] })
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('shows DIRECT MESSAGES section when members exist', () => {
    renderSidebar({ channels: CHANNELS })
    expect(screen.getByTestId('dms-section-label')).toBeInTheDocument()
  })

  it('renders DM channels under DIRECT MESSAGES', () => {
    renderSidebar({ channels: [...CHANNELS, ...DM_CHANNELS] })
    // Riley should appear in the DM section
    expect(screen.getByTestId('dm-bot-riley')).toBeInTheDocument()
  })

  it('calls onOpenDm when a bot in DMs is clicked and no DM channel exists yet', async () => {
    const onOpenDm = vi.fn()
    renderSidebar({ channels: CHANNELS, onOpenDm })
    // Sam and Casey are members of Engineering, so they appear in DM section
    await userEvent.click(screen.getByTestId('dm-bot-sam'))
    expect(onOpenDm).toHaveBeenCalledWith('bot-sam', 'backend')
  })

  it('navigates to existing DM channel when clicked', async () => {
    const onSelect = vi.fn()
    renderSidebar({ channels: [...CHANNELS, ...DM_CHANNELS], onSelect })
    await userEvent.click(screen.getByTestId('dm-bot-riley'))
    expect(onSelect).toHaveBeenCalledWith('dm-riley')
  })
})
