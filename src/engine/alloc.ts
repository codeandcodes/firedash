import type { Snapshot, HoldingLot } from '@types/schema'
import type { AssetClass, ReturnParams } from '@types/engine'

export const DEFAULT_RETURNS: Record<AssetClass, ReturnParams> = {
  US_STOCK: { mu: 0.07, sigma: 0.18 },
  INTL_STOCK: { mu: 0.065, sigma: 0.2 },
  BONDS: { mu: 0.03, sigma: 0.07 },
  REIT: { mu: 0.065, sigma: 0.2 },
  CASH: { mu: 0.015, sigma: 0.01 },
  REAL_ESTATE: { mu: 0.03, sigma: 0.12 },
  CRYPTO: { mu: 0.08, sigma: 0.8 }
}

export function classifyHolding(h: HoldingLot): AssetClass {
  const t = (h.ticker || h.asset_class || '').toUpperCase()
  if (/(BTC|ETH|SOL|ADA|DOGE|MATIC|CRYPTO)/.test(t) || t.includes('-USD')) return 'CRYPTO'
  if (/VXUS|IXUS|XUS|VEU|IEFA/.test(t)) return 'INTL_STOCK'
  if (/BND|AGG|IEF|TLT|BOND|VBTLX/.test(t)) return 'BONDS'
  if (/VNQ|SCHH|REIT/.test(t)) return 'REIT'
  if (/CASH|MONEY|MMF/.test(t)) return 'CASH'
  return 'US_STOCK'
}

export interface Allocation {
  weights: Record<AssetClass, number>
  total: number
}

export function computeAllocation(snapshot: Snapshot): Allocation {
  const sums: Record<AssetClass, number> = { US_STOCK: 0, INTL_STOCK: 0, BONDS: 0, REIT: 0, CASH: 0, REAL_ESTATE: 0, CRYPTO: 0 }
  for (const a of snapshot.accounts) {
    if (a.cash_balance) sums.CASH += a.cash_balance
    for (const h of a.holdings || []) {
      const v = h.units * h.price
      sums[classifyHolding(h)] += v
    }
  }
  for (const re of snapshot.real_estate || []) {
    if (re.value) sums.REAL_ESTATE += re.value
  }
  const total = Object.values(sums).reduce((s, x) => s + x, 0)
  const weights: Record<AssetClass, number> = { US_STOCK: 0, INTL_STOCK: 0, BONDS: 0, REIT: 0, CASH: 0, REAL_ESTATE: 0, CRYPTO: 0 }
  if (total > 0) {
    (Object.keys(sums) as AssetClass[]).forEach((k) => (weights[k] = sums[k] / total))
  }
  return { weights, total }
}
