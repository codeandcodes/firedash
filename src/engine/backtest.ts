import type { Snapshot } from '@types/schema'

export interface BacktestResult {
  summary: string
  successRate?: number
}

// Placeholder deterministic backtest. In v1, this will iterate over historical
// windows and compute wealth trajectories with rebalancing and withdrawals.
export function runDeterministicBacktest(snapshot: Snapshot): BacktestResult {
  const accounts = snapshot.accounts.length
  const holdings = snapshot.accounts.reduce((s, a) => s + (a.holdings?.length || 0), 0)
  return {
    summary: `Analyzed ${accounts} accounts / ${holdings} holdings across historical windows`,
    successRate: undefined
  }
}

