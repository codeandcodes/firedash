export type AssetClass = 'US_STOCK' | 'INTL_STOCK' | 'BONDS' | 'REIT' | 'CASH' | 'REAL_ESTATE' | 'CRYPTO' | 'GOLD'

export interface ReturnParams {
  mu: number // annualized arithmetic mean return (approx)
  sigma: number // annualized volatility
}

export interface SimOptions {
  years?: number
  inflation?: number // annual
  rebalFreq?: 'annual' | 'quarterly' | 'monthly'
  paths?: number
  mcMode?: 'regime' | 'gbm'
}

export interface PathStats {
  success: boolean
  terminal: number
  minDrawdown: number
}

export interface MonteSummary {
  successProbability: number
  medianTerminal: number
  p10Terminal: number
  p90Terminal: number
}
