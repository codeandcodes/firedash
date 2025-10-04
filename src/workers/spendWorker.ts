/* eslint-disable no-restricted-globals */
import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'
import { simulatePathTotals } from '@engine/sim'

type SpendReq = {
  snapshot: Snapshot
  options: SimOptions
  target: { label: string; success: number }
  pathsPerEval?: number
  maxIter?: number
  upperBoundMonthly?: number
  lowerBoundMonthly?: number
}

function withSpend(s: Snapshot, spend: number): Snapshot {
  return { ...s, retirement: { ...s.retirement, expected_spend_monthly: spend } }
}

self.onmessage = (e: MessageEvent<SpendReq>) => {
  (async () => {
    const { snapshot, options, target, pathsPerEval = 400, maxIter = 10, upperBoundMonthly, lowerBoundMonthly } = e.data
    try {
      const total = snapshot.accounts?.reduce((sum, a: any) => sum + (a.balance || 0), 0) || 0
      const years = options.years || 40
      const userSpend = snapshot.retirement?.expected_spend_monthly || 0
      const baseGuess = userSpend > 0 ? userSpend : Math.max(total * 0.04 / 12, total / (years * 12))
      let lo = typeof lowerBoundMonthly === 'number' ? lowerBoundMonthly : Math.max(0, baseGuess / 4)
      let hi = typeof upperBoundMonthly === 'number' ? upperBoundMonthly : Math.max(1000, baseGuess * 4)
      if (lo >= hi) hi = lo * 2 + 1000

      let best = lo
      let succ = 0
      for (let it = 0; it < maxIter; it++) {
        const mid = (lo + hi) / 2
        let successCount = 0
        for (let i = 0; i < pathsPerEval; i++) {
          const res = simulatePathTotals(withSpend(snapshot, mid), options)
          if (res.success) successCount++
        }
        const p = successCount / pathsPerEval
        ;(self as any).postMessage({ type: 'iter', label: target.label, iter: it+1, p, mid })
        if (p >= target.success) {
          best = mid; succ = p; lo = mid
        } else {
          hi = mid
        }
        if (Math.abs(hi - lo) < 1e-2) break
      }
      ;(self as any).postMessage({ type: 'done', result: { label: target.label, monthly: Math.round(best), success: succ } })
    } catch (err: any) {
      ;(self as any).postMessage({ type: 'error', error: String(err?.message || err) })
    }
  })()
}
