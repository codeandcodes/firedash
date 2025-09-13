import type { Snapshot } from '@types/schema'
import { simulateDeterministic } from './sim'
import type { SimOptions } from '@types/engine'

export interface BacktestResult {
  summary: string
  terminal: number
}

export function runDeterministicBacktest(snapshot: Snapshot, opts: Partial<SimOptions> = {}): BacktestResult {
  const res = simulateDeterministic(snapshot, opts)
  return {
    summary: 'Deterministic path with fixed real returns (approx)',
    terminal: Math.round(res.terminal)
  }
}
