import type { Snapshot } from '@types/schema'
import type { AssetClass, MonteSummary, PathStats, SimOptions } from '@types/engine'
import { DEFAULT_RETURNS, computeAllocation } from './alloc'
import { buildTimeline } from './schedule'
import { DEFAULT_RETURNS as RETURNS } from './alloc'
import { tryLoadHistorical, createBootstrapSampler } from './historical'
import { createRandomContext, type RandomContext, offsetSeed } from './random'
import type { SimOptions as SO } from '@types/engine'

function monthlyParams(mu: number, sigma: number) {
  const muLog = Math.log(1 + mu)
  return { muM: muLog / 12, sigmaM: sigma / Math.sqrt(12) }
}

function sampleReturn(muM: number, sigmaM: number, rng: RandomContext): number {
  const z = rng.randn()
  const r = Math.exp(muM + sigmaM * z) - 1
  return r
}

type Balances = Record<AssetClass, number>
const ASSET_CLASSES: AssetClass[] = ['US_STOCK', 'INTL_STOCK', 'BONDS', 'REIT', 'CASH', 'REAL_ESTATE', 'CRYPTO', 'GOLD']

function rebalance(balances: Balances, targets: Record<AssetClass, number>) {
  const total = ASSET_CLASSES.reduce((s, k) => s + balances[k], 0)
  if (total <= 0) return
  ASSET_CLASSES.forEach((k) => (balances[k] = (targets[k] || 0) * total))
}

interface LoopOptions {
  months: number
  inflation: number
  rebalEvery: number // months
  spendMonthly: number
  ssMonthly: number
  cashflows: Map<number, number>
  retAt?: number
  ssAt?: number
  bootstrapBlockMonths?: number
  bootstrapNoiseSigma?: number
}

function zeroBalances(): Balances {
  const b: any = {}
  ASSET_CLASSES.forEach((k) => (b[k] = 0))
  return b as Balances
}

function runPath(initial: number, targets: Record<AssetClass, number>, opt: LoopOptions, ctx: RandomContext): PathStats {
  let balances: Balances = zeroBalances()
  // seed by targets
  ASSET_CLASSES.forEach((k) => (balances[k] = initial * (targets[k] || 0)))

  const paramsM = Object.fromEntries(
    ASSET_CLASSES.map((k) => {
      const p = DEFAULT_RETURNS[k]
      const { muM, sigmaM } = monthlyParams(p.mu, p.sigma)
      return [k, { muM, sigmaM }]
    })
  ) as Record<AssetClass, { muM: number; sigmaM: number }>

  let sampler: { next(): Record<AssetClass, number> } | null = null
  const hist = tryLoadHistorical()
  if (hist) {
    const block = opt.bootstrapBlockMonths ?? 24
    const noise = opt.bootstrapNoiseSigma ?? 0.005
    sampler = createBootstrapSampler(hist, opt.months, ASSET_CLASSES, { blockMonths: block, jitterSigma: noise }, ctx)
  }

  const inflM = Math.log(1 + opt.inflation) / 12
  const spendReal = opt.spendMonthly
  const ssReal = opt.ssMonthly

  let minDrawdown = 0

  for (let m = 0; m < opt.months; m++) {
    const sampled = sampler ? sampler.next() : null
    // apply returns
    ASSET_CLASSES.forEach((k) => {
      const p = paramsM[k]
      const r = sampled ? sampled[k] : sampleReturn(p.muM, p.sigmaM, ctx)
      balances[k] *= 1 + r
    })

    // scheduled cash flows
    // scheduled cash flows (contribs, expenses, property flows)
    const cf = opt.cashflows.get(m) || 0
    balances.CASH += cf

    // real spend and SS (inflation-adjusted)
    const retireAt = opt.retAt ?? 0
    const retired = opt.retAt == null ? true : m >= retireAt
    const spendNominal = retired ? spendReal * Math.exp(inflM * Math.max(0, m - retireAt)) : 0
    const ssNominal = (opt.ssAt != null && m >= (opt.ssAt as number)) ? ssReal * Math.exp(inflM * m) : 0
    balances.CASH += ssNominal - spendNominal

    // rebalance
    if (opt.rebalEvery > 0 && (m + 1) % opt.rebalEvery === 0) {
      rebalance(balances, targets)
    }

    const total = ASSET_CLASSES.reduce((s, k) => s + balances[k], 0)
    minDrawdown = Math.min(minDrawdown, total)
    if (total <= 0) {
      return { success: false, terminal: 0, minDrawdown }
    }
  }

  const terminal = ASSET_CLASSES.reduce((s, k) => s + balances[k], 0)
  return { success: true, terminal, minDrawdown }
}

export function simulate(snapshot: Snapshot, options: SimOptions = {}): { summary: MonteSummary; details: PathStats[] } {
  const years = options.years ?? 40
  const inflation = options.inflation ?? (snapshot.assumptions?.inflation_pct ?? 0.02)
  const rebalFreq = options.rebalFreq ?? (snapshot.assumptions?.rebalancing?.frequency || 'annual')
  const paths = options.paths ?? 1000
  const { weights, total } = computeAllocation(snapshot)
  const timeline = buildTimeline(snapshot, years)

  const rebalEvery = rebalFreq === 'monthly' ? 1 : rebalFreq === 'quarterly' ? 3 : 12
  // Set real estate expected return based on snapshot (weighted by value)
  const muRE = realEstateMu(snapshot)
  RETURNS.REAL_ESTATE.mu = muRE
  const cashflows = new Map<number, number>()
  for (const cf of timeline.cashflows) cashflows.set(cf.monthIndex, (cashflows.get(cf.monthIndex) || 0) + cf.amount)

  // retirement spend and SS
  const spendMonthly = Math.max(0, snapshot.retirement.expected_spend_monthly || 0)
  const ssMonthly = (snapshot.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)

  const loopOpt = {
    months: timeline.months,
    inflation,
    rebalEvery,
    spendMonthly,
    ssMonthly,
    cashflows,
    retAt: timeline.retirementAt,
    ssAt: timeline.ssStartMonth
  }

  const details: PathStats[] = []
  for (let i = 0; i < paths; i++) {
    const ctx = createRandomContext(offsetSeed(options.seed, i))
    details.push(runPath(total, weights, { ...loopOpt, bootstrapBlockMonths: options.bootstrapBlockMonths, bootstrapNoiseSigma: options.bootstrapNoiseSigma }, ctx))
  }

  const terminals = details.map((d) => d.terminal).sort((a, b) => a - b)
  const successes = details.filter((d) => d.success).length
  const q = (p: number) => terminals[Math.max(0, Math.min(terminals.length - 1, Math.floor(p * (terminals.length - 1))))]
  const summary: MonteSummary = {
    successProbability: terminals.length ? successes / terminals.length : 0,
    medianTerminal: q(0.5),
    p10Terminal: q(0.1),
    p90Terminal: q(0.9)
  }

  return { summary, details }
}

export function simulateSeries(snapshot: Snapshot, options: SimOptions & { maxPathsForSeries?: number } = {}) {
  const years = options.years ?? 40
  const inflation = options.inflation ?? (snapshot.assumptions?.inflation_pct ?? 0.02)
  const rebalFreq = options.rebalFreq ?? (snapshot.assumptions?.rebalancing?.frequency || 'annual')
  const paths = Math.max(1, options.paths ?? 500)
  const maxPaths = options.maxPathsForSeries ?? Math.min(paths, 1000)

  const months = Math.max(1, years * 12)

  const series: number[][] = []
  for (let i = 0; i < maxPaths; i++) {
    const totals = simulatePathTotals(snapshot, {
      years,
      inflation,
      rebalFreq,
      bootstrapBlockMonths: options.bootstrapBlockMonths,
      bootstrapNoiseSigma: options.bootstrapNoiseSigma,
      seed: offsetSeed(options.seed, i)
    }).totals
    series.push(totals)
  }

  const mc = { p10: new Array<number>(months), p25: new Array<number>(months), p50: new Array<number>(months), p75: new Array<number>(months), p90: new Array<number>(months) }
  for (let m = 0; m < months; m++) {
    const col = series.map((s) => s[m] ?? s[s.length - 1]).sort((a, b) => a - b)
    const p = (arr: number[], q: number) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(q * (arr.length - 1))))]
    mc.p10[m] = p(col, 0.1)
    mc.p25[m] = p(col, 0.25)
    mc.p50[m] = p(col, 0.5)
    mc.p75[m] = p(col, 0.75)
    mc.p90[m] = p(col, 0.9)
  }

  return { months, mc }
}

// Optimized single-path runner that returns only total balances and basic stats.
// Uses numeric indices and typed arrays for speed.
const ASSET_IDX: Record<AssetClass, number> = {
  US_STOCK: 0, INTL_STOCK: 1, BONDS: 2, REIT: 3, CASH: 4, REAL_ESTATE: 5, CRYPTO: 6, GOLD: 7
}
const IDX_ASSET: AssetClass[] = ['US_STOCK','INTL_STOCK','BONDS','REIT','CASH','REAL_ESTATE','CRYPTO','GOLD']

export function simulatePathTotals(snapshot: Snapshot, options: SO = {}): { totals: number[]; success: boolean; terminal: number } {
  const years = options.years ?? 40
  const inflation = options.inflation ?? (snapshot.assumptions?.inflation_pct ?? 0.02)
  const rebalFreq = options.rebalFreq ?? (snapshot.assumptions?.rebalancing?.frequency || 'annual')
  const { weights, total } = computeAllocation(snapshot)
  const timeline = buildTimeline(snapshot, years)
  const ctx = createRandomContext(options.seed)

  const rebalEvery = rebalFreq === 'monthly' ? 1 : rebalFreq === 'quarterly' ? 3 : 12
  const muRE = realEstateMu(snapshot)
  RETURNS.REAL_ESTATE.mu = muRE
  const cashflows = new Map<number, number>()
  for (const cf of timeline.cashflows) cashflows.set(cf.monthIndex, (cashflows.get(cf.monthIndex) || 0) + cf.amount)
  const spendMonthly = Math.max(0, snapshot.retirement.expected_spend_monthly || 0)
  const ssMonthly = (snapshot.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)

  const months = timeline.months
  const inflM = Math.log(1 + inflation) / 12

  // balances as typed array
  const balances = new Float64Array(8)
  for (const a of IDX_ASSET) balances[ASSET_IDX[a]] = total * (weights[a] || 0)

  const paramsM: { muM: number; sigmaM: number }[] = new Array(8)
  for (let i = 0; i < 8; i++) {
    const p = (RETURNS as any)[IDX_ASSET[i]]
    const { muM, sigmaM } = monthlyParams(p.mu, p.sigma)
    paramsM[i] = { muM, sigmaM }
  }

  let sampler: { next(): Record<AssetClass, number> } | null = null
  const hist = tryLoadHistorical()
  if (hist) {
    sampler = createBootstrapSampler(hist, months, IDX_ASSET, { blockMonths: options.bootstrapBlockMonths ?? 24, jitterSigma: options.bootstrapNoiseSigma ?? 0.005 }, ctx)
  }

  const totals = new Array<number>(months)
  let minDrawdown = 0
  for (let m = 0; m < months; m++) {
    const sampled = sampler ? sampler.next() : null
    for (let i = 0; i < 8; i++) {
      const p = paramsM[i]
      const assetKey = IDX_ASSET[i]
      let r: number
      if (sampled && typeof sampled[assetKey] === 'number') {
        r = sampled[assetKey] as number
      } else {
        r = sampleReturn(p.muM, p.sigmaM, ctx)
      }
      balances[i] *= 1 + r
    }
    const cf = cashflows.get(m) || 0
    balances[ASSET_IDX.CASH] += cf
    const retireMonth = (timeline.retirementAt ?? 0)
    const retired = timeline.retirementAt == null ? true : m >= retireMonth
    const inflationMonths = Math.max(0, m - retireMonth)
    const spendNominal = retired ? spendMonthly * Math.exp(inflM * inflationMonths) : 0
    const ssNominal = (timeline.ssStartMonth != null && m >= (timeline.ssStartMonth as number)) ? ssMonthly * Math.exp(inflM * m) : 0
    balances[ASSET_IDX.CASH] += ssNominal - spendNominal
    if (rebalEvery > 0 && (m + 1) % rebalEvery === 0) {
      // rebalance
      let tot = 0
      for (let i = 0; i < 8; i++) tot += balances[i]
      if (tot > 0) for (const a of IDX_ASSET) balances[ASSET_IDX[a]] = (weights[a] || 0) * tot
    }
    let t = 0
    for (let i = 0; i < 8; i++) t += balances[i]
    if (!isFinite(t) || t < 0) t = 0
    totals[m] = t
    minDrawdown = Math.min(minDrawdown, t)
    if (t <= 0) {
      for (let k = m + 1; k < months; k++) totals[k] = 0
      return { totals, success: false, terminal: 0 }
    }
  }
  return { totals, success: true, terminal: totals[months - 1] }
}

// Deterministic monthly returns contributions per asset class (pre-rebalance, excludes cashflows)
function realEstateMu(snapshot: Snapshot): number {
  const res = snapshot.real_estate || []
  const total = res.reduce((s, r) => s + (r.value || 0), 0)
  if (total <= 0) return 0.035
  let wmu = 0
  for (const r of res) {
    const v = r.value || 0
    const mu = typeof r.appreciation_pct === 'number' ? r.appreciation_pct : 0.035
    wmu += (v / total) * mu
  }
  return wmu
}
