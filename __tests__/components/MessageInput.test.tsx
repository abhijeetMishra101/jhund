/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
