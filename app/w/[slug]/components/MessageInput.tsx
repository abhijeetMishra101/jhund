'use client'

interface Props {
  channelName: string
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
}

export function MessageInput({ channelName, value, onChange, onSend, sending }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-end gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:border-indigo-500 transition-colors">
        <textarea
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${channelName}…`}
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
      <p className="text-xs text-gray-400 mt-1">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}
