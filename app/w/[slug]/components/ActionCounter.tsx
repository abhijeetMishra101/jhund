'use client'

interface Props {
  used: number
  cap: number
}

export function ActionCounter({ used, cap }: Props) {
  const pctUsed = Math.round((used / cap) * 100)
  const isWarning = pctUsed >= 80

  return (
    <div className="px-4 py-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: '#868686' }}>Actions used</span>
        <span
          className="text-xs font-medium"
          style={{ color: isWarning ? '#e8a838' : '#868686' }}
          data-testid="action-counter-label"
        >
          {used} / {cap}
        </span>
      </div>
      <div className="h-1 rounded-full" style={{ backgroundColor: '#27292d' }}>
        <div
          className="h-1 rounded-full transition-all"
          data-testid="action-counter-bar"
          style={{
            width: `${pctUsed}%`,
            backgroundColor: isWarning ? '#e8a838' : '#1164a3',
          }}
        />
      </div>
    </div>
  )
}
