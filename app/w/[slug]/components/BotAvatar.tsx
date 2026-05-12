'use client'

import type { PresenceStatus } from '@/lib/supabase/types'

export interface BotAvatarProps {
  seed: string
  displayName: string
  size?: 'sm' | 'md' | 'lg'
  status?: PresenceStatus
}

const SIZE_PX: Record<NonNullable<BotAvatarProps['size']>, number> = {
  sm: 24,
  md: 32,
  lg: 40,
}

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: '#22c55e',  // green-500
  busy:   '#eab308',  // yellow-500
  offline: '#9ca3af', // gray-400
}

const DOT_SIZE: Record<NonNullable<BotAvatarProps['size']>, number> = {
  sm: 7,
  md: 9,
  lg: 11,
}

export function BotAvatar({ seed, displayName, size = 'md', status }: BotAvatarProps) {
  const px = SIZE_PX[size]
  const dotPx = DOT_SIZE[size]
  const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9&radius=50`

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: px, height: px }}
      data-testid="bot-avatar"
    >
      <img
        src={url}
        alt={displayName}
        title={displayName}
        width={px}
        height={px}
        className="rounded-full object-cover"
        style={{ width: px, height: px }}
        data-testid="bot-avatar-img"
      />
      {status !== undefined && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-white"
          style={{
            width: dotPx,
            height: dotPx,
            backgroundColor: STATUS_COLOR[status],
          }}
          data-testid={`bot-avatar-status-${status}`}
          aria-label={status}
        />
      )}
    </span>
  )
}
