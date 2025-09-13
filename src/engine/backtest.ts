import type { Snapshot } from '@types/schema'
import { simulateDeterministic } from './sim'

export interface BacktestResult {
  summary: string
  terminal: number
}

export function runDeterministicBacktest(snapshot: Snapshot): BacktestResult {
  const res = simulateDeterministic(snapshot, {})
  return {
    summary: 'Deterministic path with fixed real returns (approx)',
    terminal: Math.round(res.terminal)
  }
}
