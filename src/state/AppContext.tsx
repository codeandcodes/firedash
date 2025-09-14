import React, { createContext, useContext, useMemo, useState } from 'react'
import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'

interface AppState {
  snapshot: Snapshot | null
  setSnapshot: (s: Snapshot | null) => void
  simOptions: Required<Pick<SimOptions, 'years' | 'paths' | 'rebalFreq' | 'inflation'>> & { mcMode: NonNullable<SimOptions['mcMode']> } & {
    bootstrapBlockMonths: number
    bootstrapNoiseSigma: number
    maxWorkers: number
  }
  setSimOptions: (s: Partial<SimOptions>) => void
}

const Ctx = createContext<AppState | undefined>(undefined)

export const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const defaultWorkers = Math.max(1, Math.min((typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4), 8))
  const [simOptionsState, setSimOptionsState] = useState<Required<Pick<SimOptions, 'years' | 'paths' | 'rebalFreq' | 'inflation'>> & { mcMode: NonNullable<SimOptions['mcMode']> } & { bootstrapBlockMonths: number; bootstrapNoiseSigma: number; maxWorkers: number }>(
    { years: 40, paths: 1000, rebalFreq: 'annual', inflation: 0.02, mcMode: 'bootstrap', bootstrapBlockMonths: 24, bootstrapNoiseSigma: 0.005, maxWorkers: defaultWorkers }
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
      mcMode: (s.mcMode as any) ?? prev.mcMode,
      bootstrapBlockMonths: s.bootstrapBlockMonths ?? prev.bootstrapBlockMonths,
      bootstrapNoiseSigma: s.bootstrapNoiseSigma ?? prev.bootstrapNoiseSigma,
      maxWorkers: s.maxWorkers ?? prev.maxWorkers
    }))
  }), [snapshot, simOptionsState])

  return <Ctx.Provider value={ctxVal}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
/*
Global app context: holds current snapshot and simulation options.
- simOptions now includes mcMode to control Monte Carlo engine.
*/
