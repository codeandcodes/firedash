import type { Snapshot } from '@types/schema'

export interface MonteCarloOptions {
  paths?: number
  years?: number
}

export interface MonteCarloResult {
  summary: string
  successProbability?: number
}

// Placeholder Monte Carlo. In v1, implement block-bootstrap or MVN sampling.
export function runMonteCarlo(snapshot: Snapshot, opts: MonteCarloOptions = {}): MonteCarloResult {
  const paths = opts.paths || 1000
  const years = opts.years || 40
  return {
    summary: `${paths.toLocaleString()} paths over ${years} years (placeholder)`
  }
}

