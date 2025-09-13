import React, { createContext, useContext, useState } from 'react'
import type { Snapshot } from '@types/schema'

interface AppState {
  snapshot: Snapshot | null
  setSnapshot: (s: Snapshot | null) => void
}

const Ctx = createContext<AppState | undefined>(undefined)

export const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  return <Ctx.Provider value={{ snapshot, setSnapshot }}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

