'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { PresenceStatus } from '@/lib/supabase/types'

interface PresenceContextValue {
  /** Map of bot_role_id → status */
  presenceMap: Record<string, PresenceStatus>
  setPresence: (botRoleId: string, status: PresenceStatus) => void
  /** Call when a bot sends a message — sets online for 5 min then reverts */
  markBotActive: (botRoleId: string) => void
}

const PresenceContext = createContext<PresenceContextValue>({
  presenceMap: {},
  setPresence: () => {},
  markBotActive: () => {},
})

export function PresenceProvider({
  children,
  initial = {},
}: {
  children: React.ReactNode
  initial?: Record<string, PresenceStatus>
}) {
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceStatus>>(initial)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const setPresence = useCallback((botRoleId: string, status: PresenceStatus) => {
    setPresenceMap((prev) => ({ ...prev, [botRoleId]: status }))
  }, [])

  const markBotActive = useCallback((botRoleId: string) => {
    setPresenceMap((prev) => ({ ...prev, [botRoleId]: 'online' }))
    // Clear any existing timer for this bot
    if (timers.current[botRoleId]) clearTimeout(timers.current[botRoleId])
    timers.current[botRoleId] = setTimeout(() => {
      setPresenceMap((prev) => ({ ...prev, [botRoleId]: 'offline' }))
    }, 5 * 60 * 1000)
  }, [])

  return (
    <PresenceContext.Provider value={{ presenceMap, setPresence, markBotActive }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  return useContext(PresenceContext)
}
