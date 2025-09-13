import React, { createContext, useContext, useMemo, useState } from 'react'
import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'

interface AppState {
  snapshot: Snapshot | null
  setSnapshot: (s: Snapshot | null) => void
  simOptions: Required<Pick<SimOptions, 'years' | 'paths' | 'rebalFreq' | 'inflation'>> & { mcMode: NonNullable<SimOptions['mcMode']> }
  setSimOptions: (s: Partial<SimOptions>) => void
}

const Ctx = createContext<AppState | undefined>(undefined)

export const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [simOptionsState, setSimOptionsState] = useState<Required<Pick<SimOptions, 'years' | 'paths' | 'rebalFreq' | 'inflation'>> & { mcMode: NonNullable<SimOptions['mcMode']> }>(
    { years: 40, paths: 1000, rebalFreq: 'annual', inflation: 0.02, mcMode: 'bootstrap' }
  )

  const ctxVal = useMemo(() => ({
    snapshot,
    setSnapshot,
    simOptions: simOptionsState,
    setSimOptions: (s: Partial<SimOptions>) => setSimOptionsState((prev) => ({
      years: s.years ?? prev.years,
      paths: s.paths ?? prev.paths,
      rebalFreq: s.rebalFreq ?? prev.rebalFreq,
      inflation: s.inflation ?? prev.inflation,
      mcMode: (s.mcMode as any) ?? prev.mcMode
    }))
  }), [snapshot, simOptionsState])

  return <Ctx.Provider value={ctxVal}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
