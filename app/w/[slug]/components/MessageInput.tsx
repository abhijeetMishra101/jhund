'use client'

interface ChannelMemberSummary {
  display_name: string
  role_key: string
}

interface Props {
  channelName: string
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  /** If provided, updates the placeholder for multi-bot channels */
  channelMembers?: ChannelMemberSummary[]
}

function buildPlaceholder(channelName: string, members?: ChannelMemberSummary[]): string {
  if (!members || members.length === 0) return `Message ${channelName}…`
  if (members.length === 1) return `Message #${channelName}`
  const primary = members[0]
  const others = members.slice(1)
  return `Message #${channelName} — ${primary.display_name} will respond. Type @${others[0].display_name} to reach ${others[0].role_key.charAt(0).toUpperCase() + others[0].role_key.slice(1)}.`
}

/** Highlight @mentions that match a member's display_name — returns plain text with spans */
function renderWithMentions(text: string, members?: ChannelMemberSummary[]): React.ReactNode {
  if (!members || members.length === 0 || !text.includes('@')) return text

  const names = members.map((m) => m.display_name)
  // Build regex: @(Name1|Name2|...)
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')

  const parts = text.split(pattern)
  return parts.map((part, i) => {
    if (part.startsWith('@') && names.some((n) => part === `@${n}`)) {
      return (
        <span key={i} className="bg-indigo-100 text-indigo-700 rounded px-0.5 font-medium">
          {part}
        </span>
      )
    }
    return part
  })
}

export function MessageInput({ channelName, value, onChange, onSend, sending, channelMembers }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const placeholder = buildPlaceholder(channelName, channelMembers)

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-end gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:border-indigo-500 transition-colors">
        <textarea
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 resize-none text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none leading-5"
          style={{ maxHeight: '120px' }}
          disabled={sending}
          aria-label={`Message ${channelName}`}
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || sending}
          className="shrink-0 px-3 py-1 text-sm font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
      {/* Mention preview — shows highlighted @mentions below textarea */}
      {value && channelMembers && value.includes('@') && (
        <div className="text-sm leading-5 mt-1 px-1 text-gray-700 pointer-events-none" aria-hidden>
          {renderWithMentions(value, channelMembers)}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}
