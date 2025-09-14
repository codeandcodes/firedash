import type { HistoricalDataset } from '@types/historical'
import type { AssetClass } from '@types/engine'
// Import at build time so it's available in the browser bundle
// If you need to swap data, regenerate this file or add an upload path later.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import datasetJson from '../../data/historical_returns.json'

let overrideDataset: HistoricalDataset | null = null
export function setHistoricalOverride(d: HistoricalDataset | null) {
  overrideDataset = d
}

export interface BootstrapOptions {
  blockMonths: number
  jitterSigma: number // extra white noise std added to sampled returns
}

export function tryLoadHistorical(): HistoricalDataset | null {
  const data = (overrideDataset as HistoricalDataset | null) ?? (datasetJson as HistoricalDataset)
  if (data && Array.isArray(data.rows)) return data
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
  function pick(start: number, len: number, arr: number[]): number[] {
    const out: number[] = []
    for (let i = 0; i < len; i++) out.push(arr[(start + i) % arr.length])
    return out
  }
  // Detect if dataset is annual expanded to monthly (flat within each 12-month block)
  function isAnnualExpanded(): boolean {
    const checkLen = Math.min(N, 12 * 10)
    // Compare monthly returns within each 12-size window for US_STOCK
    const arr = byAsset['US_STOCK']
    if (!arr || arr.length < 24) return false
    for (let i = 0; i + 12 <= checkLen; i += 12) {
      const slice = arr.slice(i, i + 12)
      const first = slice[0]
      if (!slice.every((v) => v === first)) return false
    }
    return true
  }

  const annualMode = isAnnualExpanded()
  if (annualMode) {
    // Sample in year-aligned blocks; add more noise to restore monthly variance
    block = 12
  }
  // Assemble bootstrapped path
  let remaining = months
  while (remaining > 0) {
    let start = Math.floor(Math.random() * N)
    if (annualMode) start = Math.floor(start / 12) * 12 // align to year boundary
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
        // If annual-expanded, add higher monthly noise to restore realistic dispersion
        if (annualMode && (sigma ?? 0) < 0.01) sigma = 0.012
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
/*
Historical block bootstrap sampler.
- Loads bundled data/historical_returns.json (monthly rows) at build time.
- createBootstrapSampler(): samples contiguous blocks across all assets to retain cross-asset co-movement.
- Detects annual-expanded data (flat within year) and adjusts: year-aligned blocks and higher monthly noise.
*/
