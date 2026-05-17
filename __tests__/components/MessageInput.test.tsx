/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { MessageInput } from '@/app/w/[slug]/components/MessageInput'

function renderInput(overrides: Partial<Parameters<typeof MessageInput>[0]> = {}) {
  const props = {
    channelName: 'Engineering',
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    sending: false,
    ...overrides,
  }
  return { onSend: props.onSend, onChange: props.onChange, ...render(<MessageInput {...props} />) }
}

describe('MessageInput', () => {
  it('renders placeholder with channel name', () => {
    renderInput()
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Message Engineering…')
  })

  it('calls onChange when user types', async () => {
    const onChange = vi.fn()
    renderInput({ onChange })
    await userEvent.type(screen.getByRole('textbox'), 'hello')
    expect(onChange).toHaveBeenCalled()
  })

  it('Send button is disabled when value is empty', () => {
    renderInput({ value: '' })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('Send button is disabled when value is only whitespace', () => {
    renderInput({ value: '   ' })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('Send button is enabled when value has content', () => {
    renderInput({ value: 'hello' })
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('calls onSend when Send button is clicked', async () => {
    const { onSend } = renderInput({ value: 'hello' })
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('calls onSend when Enter is pressed', () => {
    const { onSend } = renderInput({ value: 'hello' })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('does NOT call onSend on Shift+Enter', () => {
    const { onSend } = renderInput({ value: 'hello' })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables textarea and button while sending', () => {
    renderInput({ value: 'hello', sending: true })
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('shows the keyboard hint text', () => {
    renderInput()
    expect(screen.getByText(/Enter to send/)).toBeInTheDocument()
  })
})

describe('MessageInput — multi-bot placeholder (buildPlaceholder)', () => {
  const ONE_MEMBER = [{ display_name: 'Sam', role_key: 'backend' }]
  const TWO_MEMBERS = [
    { display_name: 'Sam', role_key: 'backend' },
    { display_name: 'Casey', role_key: 'qa' },
  ]

  it('uses #channel placeholder for single member', () => {
    renderInput({ channelName: 'engineering', channelMembers: ONE_MEMBER })
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Message #engineering')
  })

  it('uses multi-bot placeholder for multiple members', () => {
    renderInput({ channelName: 'engineering', channelMembers: TWO_MEMBERS })
    const ta = screen.getByRole('textbox')
    expect(ta.getAttribute('placeholder')).toContain('Sam will respond')
    expect(ta.getAttribute('placeholder')).toContain('@Casey')
  })

  it('falls back to generic placeholder when no members provided', () => {
    renderInput({ channelName: 'engineering' })
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Message engineering…')
  })
})

describe('MessageInput — @mention highlight (renderWithMentions)', () => {
  const MEMBERS = [
    { display_name: 'Sam', role_key: 'backend' },
    { display_name: 'Casey', role_key: 'qa' },
  ]

  it('renders mention preview when value contains @ and matching member name', () => {
    renderInput({ channelName: 'eng', channelMembers: MEMBERS, value: 'Hey @Sam can you help?' })
    // Preview div should appear (aria-hidden) with a highlighted span
    const preview = document.querySelector('[aria-hidden]')
    expect(preview).toBeInTheDocument()
    expect(preview?.textContent).toContain('@Sam')
  })

  it('does not render mention preview when value has no @', () => {
    renderInput({ channelName: 'eng', channelMembers: MEMBERS, value: 'plain message' })
    expect(document.querySelector('[aria-hidden]')).not.toBeInTheDocument()
  })

  it('does not render mention preview when no channelMembers', () => {
    renderInput({ channelName: 'eng', value: '@Sam check this' })
    expect(document.querySelector('[aria-hidden]')).not.toBeInTheDocument()
  })
})

describe('MessageInput — @mention dropdown (allBotRoles)', () => {
  const ALL_BOTS = [
    { display_name: 'Sam' },
    { display_name: 'Casey' },
    { display_name: 'Riley' },
  ]

  /**
   * Stateful wrapper so that `onChange` updates the controlled `value` — this
   * lets `userEvent.type` work correctly (the textarea value actually advances
   * letter-by-letter, which is how `mentionQuery` state builds up).
   */
  function ControlledInput({
    initialValue = '',
    onSend = vi.fn(),
    allBotRoles = ALL_BOTS,
    channelMembers,
  }: {
    initialValue?: string
    onSend?: () => void
    allBotRoles?: { display_name: string }[]
    channelMembers?: { display_name: string; role_key: string }[]
  }) {
    const [value, setValue] = useState(initialValue)
    return (
      <MessageInput
        channelName="Engineering"
        value={value}
        onChange={setValue}
        onSend={onSend}
        sending={false}
        allBotRoles={allBotRoles}
        channelMembers={channelMembers}
      />
    )
  }

  it('shows dropdown when @ is typed and allBotRoles is provided', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@')
    expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument()
  })

  it('shows all bots when only @ is typed (empty query)', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@')
    expect(screen.getByTestId('mention-option-sam')).toBeInTheDocument()
    expect(screen.getByTestId('mention-option-casey')).toBeInTheDocument()
    expect(screen.getByTestId('mention-option-riley')).toBeInTheDocument()
  })

  it('filters dropdown options by typed query', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@Sa')
    expect(screen.getByTestId('mention-option-sam')).toBeInTheDocument()
    expect(screen.queryByTestId('mention-option-casey')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mention-option-riley')).not.toBeInTheDocument()
  })

  it('inserts the mention on option mouseDown', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@Sa')
    fireEvent.mouseDown(screen.getByTestId('mention-option-sam'))
    // Dropdown closes and textarea value contains @Sam
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('@Sam')
  })

  it('closes dropdown on Escape', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@')
    expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('does not show dropdown when allBotRoles is not provided', async () => {
    render(
      <MessageInput
        channelName="Engineering" value="" onChange={vi.fn()}
        onSend={vi.fn()} sending={false}
      />
    )
    await userEvent.type(screen.getByRole('textbox'), '@')
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('does not show dropdown when text does not end with @word', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), 'hello world')
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('ArrowDown moves selection to next option', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@')
    // Sam is index 0 (selected), ArrowDown → Casey
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
    expect(screen.getByTestId('mention-option-casey')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('mention-option-sam')).toHaveAttribute('aria-selected', 'false')
  })

  it('ArrowUp wraps from first to last option', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@')
    // At index 0 (Sam), ArrowUp → wraps to Riley (last)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' })
    expect(screen.getByTestId('mention-option-riley')).toHaveAttribute('aria-selected', 'true')
  })

  it('Tab key inserts the highlighted mention', async () => {
    render(<ControlledInput />)
    await userEvent.type(screen.getByRole('textbox'), '@')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' })
    // Sam (index 0) inserted, dropdown closes
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('@Sam')
  })

  it('Enter key inserts the highlighted mention when dropdown is open', async () => {
    const onSend = vi.fn()
    render(<ControlledInput onSend={onSend} />)
    await userEvent.type(screen.getByRole('textbox'), '@')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    // Sam inserted, dropdown closes; onSend is NOT called (Enter consumed by dropdown)
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('@Sam')
  })
})
