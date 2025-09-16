/* eslint-disable no-restricted-globals */
import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'
import { simulatePathTotals } from '@engine/sim'
import { offsetSeed } from '@engine/random'

type Req = {
  snapshot: Snapshot
  options: SimOptions
  count: number
  batchSize?: number
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { snapshot, options, count, batchSize = 10 } = e.data
  try {
    const batchTotals: number[][] = []
    const batchStats: { success: boolean; terminal: number }[] = []
    for (let i = 0; i < count; i++) {
      const res = simulatePathTotals(snapshot, { ...options, seed: offsetSeed(options.seed, i) })
      batchTotals.push(res.totals)
      batchStats.push({ success: res.success, terminal: res.terminal })
      if (batchTotals.length >= batchSize) {
        ;(self as any).postMessage({ type: 'batch', totals: batchTotals.splice(0, batchTotals.length), stats: batchStats.splice(0, batchStats.length) })
      }
    }
    if (batchTotals.length) {
      ;(self as any).postMessage({ type: 'batch', totals: batchTotals, stats: batchStats })
    }
    ;(self as any).postMessage({ type: 'done' })
  } catch (err: any) {
    ;(self as any).postMessage({ type: 'error', error: String(err?.message || err) })
  }
}
