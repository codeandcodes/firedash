import { describe, expect, it } from 'vitest'
import type { HistoricalDataset } from '../../src/types/historical'
import { createBootstrapSampler, tryLoadHistorical } from '../../src/engine/historical'
import { createRandomContext } from '../../src/engine/random'
import type { AssetClass } from '../../src/types/engine'

const ASSETS: AssetClass[] = ['US_STOCK', 'BONDS']

function buildIndexedDataset(): HistoricalDataset {
  const rows = []
  for (let i = 0; i < 8; i++) {
    const idx = i + 1
    rows.push({
      year: 2000 + Math.floor(i / 12),
      month: (i % 12) + 1,
      returns: { US_STOCK: idx, BONDS: idx + 100 }
    })
  }
  return { rows }
}

function buildAnnualizedDataset(): HistoricalDataset {
  const rows = []
  // Two years of flat-within-year monthly values so the sampler switches to annual mode
  for (let m = 0; m < 12; m++) {
    rows.push({ year: 2010, month: m + 1, returns: { US_STOCK: 0.1, BONDS: 0.15 } })
  }
  for (let m = 0; m < 12; m++) {
    rows.push({ year: 2011, month: m + 1, returns: { US_STOCK: 0.5, BONDS: 0.55 } })
  }
  return { rows }
}

describe('createBootstrapSampler', () => {
  it('samples contiguous blocks while keeping assets aligned', () => {
    const dataset = buildIndexedDataset()
    const sampler = createBootstrapSampler(dataset, 5, ASSETS, { blockMonths: 2, jitterSigma: 0 }, createRandomContext(42))

    expect(sampler.annualMode).toBe(false)
    expect(sampler.block).toBe(2)

    const samples = Array.from({ length: 5 }, () => sampler.next())
    const indexByValue = new Map<number, number>()
    dataset.rows.forEach((row, idx) => indexByValue.set(row.returns.US_STOCK as number, idx))

    // Assets should stay aligned (BONDS always exactly +100 from US_STOCK)
    samples.forEach((row) => expect(row.BONDS - row.US_STOCK).toBe(100))

    const indices = samples.map((row) => indexByValue.get(row.US_STOCK)!)
    const chunkSizes = [2, 2, 1] // with block=2 and months=5
    let offset = 0
    for (const size of chunkSizes) {
      const chunk = indices.slice(offset, offset + size)
      for (let i = 1; i < chunk.length; i++) {
        const prev = chunk[i - 1]
        const curr = chunk[i]
        // within a block we should advance one month (wrap to start if needed)
        expect((curr - prev + dataset.rows.length) % dataset.rows.length).toBe(1)
      }
      offset += size
    }
  })

  it('forces year-aligned blocks and adds jitter for annual-expanded data', () => {
    const dataset = buildAnnualizedDataset()
    const sampler = createBootstrapSampler(dataset, 18, ASSETS, { blockMonths: 3, jitterSigma: 0 }, createRandomContext(7))

    expect(sampler.annualMode).toBe(true)
    expect(sampler.block).toBe(12)

    const samples = Array.from({ length: 18 }, () => sampler.next())
    const firstBlock = samples.slice(0, sampler.block)
    const secondBlock = samples.slice(sampler.block)

    // With year-aligned sampling, each block should pull entirely from one calendar year (0.1 or 0.5 base)
    const classify = (value: number) => (value < 0.3 ? 'year1' : 'year2')
    const firstLabel = classify(firstBlock[0].US_STOCK)
    expect(firstBlock.every((s) => classify(s.US_STOCK) === firstLabel)).toBe(true)
    const secondLabel = classify(secondBlock[0].US_STOCK)
    expect(secondBlock.every((s) => classify(s.US_STOCK) === secondLabel)).toBe(true)

    // Annual mode should inject jitter so returns are not perfectly flat within the block
    const stdev = (arr: number[]) => {
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length
      const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length || 1)
      return Math.sqrt(variance)
    }
    expect(stdev(firstBlock.map((s) => s.US_STOCK))).toBeGreaterThan(0)
  })
})

describe('tryLoadHistorical', () => {
  it('loads the bundled historical dataset', () => {
    const ds = tryLoadHistorical()
    expect(ds).not.toBeNull()
    expect(ds?.rows.length || 0).toBeGreaterThan(0)
  })
})
