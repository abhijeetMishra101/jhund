'use client'

import { useState, useRef, useEffect } from 'react'

interface ChannelMemberSummary {
  display_name: string
  role_key: string
}

interface BotForMention {
  display_name: string
}

interface Props {
  channelName: string
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  /** Members of the active channel — drives placeholder text */
  channelMembers?: ChannelMemberSummary[]
  /** All workspace bots — powers the @mention dropdown */
  allBotRoles?: BotForMention[]
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

/**
 * Detect whether the text ends with an @mention in progress.
 * Returns the partial name (possibly empty string) after @, or null if not in a mention.
 * Matches the last @word at the end of the string — covers the common case of
 * typing @Name at the end of a message.
 */
function getMentionQuery(text: string): string | null {
  const match = text.match(/@(\w*)$/)
  return match ? match[1] : null
}

export function MessageInput({
  channelName,
  value,
  onChange,
  onSend,
  sending,
  channelMembers,
  allBotRoles,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  // Bots to show in dropdown — all workspace bots (or channel members as fallback)
  const mentionPool: BotForMention[] = allBotRoles ?? channelMembers ?? []
  const mentionMatches: BotForMention[] =
    mentionQuery !== null
      ? mentionPool.filter((b) =>
          b.display_name.toLowerCase().startsWith(mentionQuery.toLowerCase()),
        )
      : []

  // Reset highlighted index whenever the filtered list changes
  useEffect(() => {
    setMentionIndex(0)
  }, [mentionQuery])

  const closeMention = () => setMentionQuery(null)

  const insertMention = (displayName: string) => {
    // Replace trailing @word with the full @Name (works when typing at end of message)
    const newValue = value.replace(/@(\w*)$/, `@${displayName} `)
    onChange(newValue)
    closeMention()
    // Restore focus and move cursor to after the inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newValue.length, newValue.length)
      }
    }, 0)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    setMentionQuery(getMentionQuery(newValue))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionMatches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && mentionMatches.length > 0)) {
        e.preventDefault()
        insertMention(mentionMatches[mentionIndex].display_name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMention()
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const placeholder = buildPlaceholder(channelName, channelMembers)

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
      <div className="relative">
        {/* @mention dropdown — positioned above the textarea */}
        {mentionMatches.length > 0 && (
          <div
            className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50"
            data-testid="mention-dropdown"
          >
            {mentionMatches.map((bot, i) => (
              <button
                key={bot.display_name}
                // onMouseDown prevents the textarea from losing focus before onClick fires
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(bot.display_name)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-900 transition-colors"
                style={{ backgroundColor: i === mentionIndex ? '#eef2ff' : undefined }}
                data-testid={`mention-option-${bot.display_name.toLowerCase()}`}
                aria-selected={i === mentionIndex}
              >
                <span className="font-medium text-indigo-600">@{bot.display_name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:border-indigo-500 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleTextChange}
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
      </div>

      {/* Mention preview — shows highlighted @mentions below the input */}
      {value && channelMembers && value.includes('@') && (
        <div className="text-sm leading-5 mt-1 px-1 text-gray-700 pointer-events-none" aria-hidden>
          {renderWithMentions(value, channelMembers)}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}
