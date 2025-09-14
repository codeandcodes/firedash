import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'
import { simulate } from './sim'

export interface MonteCarloOptions extends SimOptions {}

export interface MonteCarloResult {
  summary: string
  successProbability: number
  medianTerminal: number
}

export function runMonteCarlo(snapshot: Snapshot, opts: MonteCarloOptions = {}): MonteCarloResult {
  const paths = opts.paths || 1000
  const years = opts.years || 40
  const { summary } = simulate(snapshot, {
    paths,
    years,
    inflation: opts.inflation,
    rebalFreq: opts.rebalFreq,
    mcMode: opts.mcMode || 'regime',
    bootstrapBlockMonths: opts.bootstrapBlockMonths,
    bootstrapNoiseSigma: opts.bootstrapNoiseSigma
  })
  return {
    summary: `${(paths).toLocaleString()} paths • success ${(summary.successProbability * 100).toFixed(0)}% • median $${Math.round(summary.medianTerminal).toLocaleString()}`,
    successProbability: summary.successProbability,
    medianTerminal: summary.medianTerminal
  }
}
