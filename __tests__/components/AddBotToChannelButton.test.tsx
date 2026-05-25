/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddBotToChannelButton } from '@/app/w/[slug]/components/AddBotToChannelButton'

const CHANNEL_ID = 'ch-1'
const CHANNEL_NAME = '# engineering'

const BOT_SAM = { id: 'bot-1', display_name: 'Sam', avatar_seed: 'sam', role_key: 'backend', status: 'online' }
const BOT_CASEY = { id: 'bot-2', display_name: 'Casey', avatar_seed: 'casey', role_key: 'qa', status: 'online' }

function stubFetch(availableBots: typeof BOT_SAM[], addStatus = 201) {
  global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (!opts?.method || opts.method === 'GET') {
      // available-bots fetch
      return Promise.resolve({
        ok: true,
        json: async () => ({ bots: availableBots, channelName: CHANNEL_NAME }),
      } as Response)
    }
    // POST add-member
    return Promise.resolve({
      ok: addStatus === 201,
      status: addStatus,
      json: async () =>
        addStatus === 201
          ? { member: { bot_role_id: 'bot-1', display_name: 'Sam', avatar_seed: 'sam', role_key: 'backend', is_primary: false, status: 'online' } }
          : { error: 'Already a member' },
    } as Response)
  })
}

describe('AddBotToChannelButton', () => {
  const onMemberAdded = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the + Add button', () => {
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName={CHANNEL_NAME}
        onMemberAdded={onMemberAdded}
      />
    )
    expect(screen.getByTestId('add-bot-button')).toHaveTextContent('+ Add')
  })

  it('opens dropdown and shows available bots on click', async () => {
    stubFetch([BOT_SAM, BOT_CASEY])
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName={CHANNEL_NAME}
        onMemberAdded={onMemberAdded}
      />
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))

    await waitFor(() => {
      expect(screen.getByTestId('add-bot-dropdown')).toBeInTheDocument()
    })
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('Casey')).toBeInTheDocument()
    // Header shows channel name without "# " prefix
    expect(screen.getByText('Add to #engineering')).toBeInTheDocument()
  })

  it('shows loading state while fetching bots', async () => {
    // Never resolves
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName={CHANNEL_NAME}
        onMemberAdded={onMemberAdded}
      />
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))
    expect(screen.getByText('Loading teammates…')).toBeInTheDocument()
  })

  it('shows empty state when all bots are already in channel', async () => {
    stubFetch([]) // no available bots
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName={CHANNEL_NAME}
        onMemberAdded={onMemberAdded}
      />
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))

    await waitFor(() => {
      expect(screen.getByText('All teammates are already here.')).toBeInTheDocument()
    })
  })

  it('calls onMemberAdded and removes bot from list when added successfully', async () => {
    stubFetch([BOT_SAM, BOT_CASEY])
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName={CHANNEL_NAME}
        onMemberAdded={onMemberAdded}
      />
    )

    // Open dropdown
    await userEvent.click(screen.getByTestId('add-bot-button'))
    await waitFor(() => expect(screen.getByTestId(`add-bot-option-${BOT_SAM.id}`)).toBeInTheDocument())

    // Click Sam
    await userEvent.click(screen.getByTestId(`add-bot-option-${BOT_SAM.id}`))

    await waitFor(() => {
      expect(onMemberAdded).toHaveBeenCalledWith(
        expect.objectContaining({ bot_role_id: 'bot-1', display_name: 'Sam' })
      )
    })

    // Sam should be removed from the dropdown list
    expect(screen.queryByTestId(`add-bot-option-${BOT_SAM.id}`)).not.toBeInTheDocument()
    // Casey still there
    expect(screen.getByTestId(`add-bot-option-${BOT_CASEY.id}`)).toBeInTheDocument()

    // Correct API call
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/channels/${CHANNEL_ID}/members`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ bot_role_id: BOT_SAM.id }),
      })
    )
  })

  it('does not call onMemberAdded when add fails', async () => {
    stubFetch([BOT_SAM], 409) // conflict
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName={CHANNEL_NAME}
        onMemberAdded={onMemberAdded}
      />
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))
    await waitFor(() => expect(screen.getByTestId(`add-bot-option-${BOT_SAM.id}`)).toBeInTheDocument())
    await userEvent.click(screen.getByTestId(`add-bot-option-${BOT_SAM.id}`))

    await waitFor(() => {
      // adding spinner gone
      expect(screen.queryByText('Adding…')).not.toBeInTheDocument()
    })

    expect(onMemberAdded).not.toHaveBeenCalled()
  })

  it('closes dropdown when button clicked again', async () => {
    stubFetch([BOT_SAM])
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName={CHANNEL_NAME}
        onMemberAdded={onMemberAdded}
      />
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))
    await waitFor(() => expect(screen.getByTestId('add-bot-dropdown')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('add-bot-button'))
    expect(screen.queryByTestId('add-bot-dropdown')).not.toBeInTheDocument()
  })

  it('closes dropdown on outside click', async () => {
    stubFetch([BOT_SAM])
    render(
      <div>
        <AddBotToChannelButton
          channelId={CHANNEL_ID}
          channelName={CHANNEL_NAME}
          onMemberAdded={onMemberAdded}
        />
        <button data-testid="outside">Outside</button>
      </div>
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))
    await waitFor(() => expect(screen.getByTestId('add-bot-dropdown')).toBeInTheDocument())

    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(screen.queryByTestId('add-bot-dropdown')).not.toBeInTheDocument()
  })

  it('strips "# " prefix from channelName in header', async () => {
    stubFetch([BOT_SAM])
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName="# my-channel"
        onMemberAdded={onMemberAdded}
      />
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))
    await waitFor(() => expect(screen.getByTestId('add-bot-dropdown')).toBeInTheDocument())
    expect(screen.getByText('Add to #my-channel')).toBeInTheDocument()
  })

  it('handles channelName without "# " prefix gracefully', async () => {
    stubFetch([BOT_SAM])
    render(
      <AddBotToChannelButton
        channelId={CHANNEL_ID}
        channelName="engineering"
        onMemberAdded={onMemberAdded}
      />
    )

    await userEvent.click(screen.getByTestId('add-bot-button'))
    await waitFor(() => expect(screen.getByTestId('add-bot-dropdown')).toBeInTheDocument())
    expect(screen.getByText('Add to #engineering')).toBeInTheDocument()
  })
})
