import type { HistoricalDataset } from '@types/historical'
import type { AssetClass } from '@types/engine'

export interface BootstrapOptions {
  blockMonths: number
  jitterSigma: number // extra white noise std added to sampled returns
}

export function tryLoadHistorical(): HistoricalDataset | null {
  try {
    // Vite will bundle JSON if imported statically, but we want runtime optional load
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data: HistoricalDataset = require('../../data/historical_returns.json')
    if (data && Array.isArray(data.rows)) return data
  } catch (_e) {
    // ignore missing file
  }
  return null
}

export function createBootstrapSampler(dataset: HistoricalDataset, months: number, assets: AssetClass[], opts: BootstrapOptions) {
  const rows = dataset.rows.slice().sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year)
  if (!rows.length) throw new Error('Historical dataset has no rows')
  // Build per-asset sequences
  const byAsset: Record<AssetClass, number[]> = {} as any
  for (const a of assets) byAsset[a] = []
  for (const r of rows) {
    for (const a of assets) {
      const v = (r.returns as any)[a]
      byAsset[a].push(typeof v === 'number' ? v : 0)
    }
  }
  const series: Record<AssetClass, number[]> = {} as any
  for (const a of assets) series[a] = []
  const N = rows.length
  let block = Math.max(1, Math.min(opts.blockMonths || 12, Math.floor(N / 4)))
  const globalAny = (globalThis as any)
  // Allow runtime override via ScenarioOptions sliders (best-effort)
  if (typeof globalAny.__mcBlock === 'number') block = Math.max(1, Math.min(Number(globalAny.__mcBlock), 120))
  function pick(start: number, len: number, arr: number[]): number[] {
    const out: number[] = []
    for (let i = 0; i < len; i++) out.push(arr[(start + i) % arr.length])
    return out
  }
  // Assemble bootstrapped path
  let remaining = months
  while (remaining > 0) {
    const start = Math.floor(Math.random() * N)
    const take = Math.min(block, remaining)
    for (const a of assets) {
      series[a].push(...pick(start, take, byAsset[a]))
    }
    remaining -= take
  }
  let idx = 0
  return {
    next(): Record<AssetClass, number> {
      const ret: Record<AssetClass, number> = {} as any
      for (const a of assets) {
        const base = series[a][idx]
        let sigma = opts.jitterSigma
        if (typeof globalAny.__mcNoise === 'number') sigma = Number(globalAny.__mcNoise)
        const jitter = sigma > 0 ? sigma * randn() : 0
        ret[a] = base + jitter
      }
      idx = (idx + 1) % months
      return ret
    }
  }
}

function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}
