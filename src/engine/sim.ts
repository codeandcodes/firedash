import type { Snapshot } from '@types/schema'
import type { AssetClass, MonteSummary, PathStats, SimOptions } from '@types/engine'
import { DEFAULT_RETURNS, computeAllocation } from './alloc'
import { buildTimeline } from './schedule'
import { DEFAULT_RETURNS as RETURNS } from './alloc'
import { tryLoadHistorical, createBootstrapSampler } from './historical'

function monthlyParams(mu: number, sigma: number) {
  const muLog = Math.log(1 + mu)
  return { muM: muLog / 12, sigmaM: sigma / Math.sqrt(12) }
}

function randn(): number {
  // Box-Muller
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function sampleReturn(muM: number, sigmaM: number): number {
  const z = randn()
  const r = Math.exp(muM + sigmaM * z) - 1
  return r
}

function deterministicReturn(muM: number): number {
  return Math.exp(muM) - 1
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
  deterministic?: boolean
  retAt?: number
  rentalNetMonthly?: number
  mcMode?: 'regime' | 'gbm'
}

function zeroBalances(): Balances {
  const b: any = {}
  ASSET_CLASSES.forEach((k) => (b[k] = 0))
  return b as Balances
}

function runPath(initial: number, targets: Record<AssetClass, number>, opt: LoopOptions): PathStats {
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
  if (!opt.deterministic) {
    if (opt.mcMode === 'bootstrap') {
      const hist = tryLoadHistorical()
      if (hist) sampler = createBootstrapSampler(hist, opt.months, ASSET_CLASSES, { blockMonths: 24, jitterSigma: 0.005 })
      else sampler = createRegimeSampler()
    } else if (opt.mcMode === 'regime') {
      sampler = createRegimeSampler()
    }
  }

  const inflM = Math.log(1 + opt.inflation) / 12
  const spendReal = opt.spendMonthly
  const ssReal = opt.ssMonthly

  let minDrawdown = 0

  for (let m = 0; m < opt.months; m++) {
    // apply returns
    ASSET_CLASSES.forEach((k) => {
      const p = paramsM[k]
      const r = opt.deterministic ? deterministicReturn(p.muM) : sampler ? sampler.next()[k] : sampleReturn(p.muM, p.sigmaM)
      balances[k] *= 1 + r
    })

    // scheduled cash flows
    let cf = opt.cashflows.get(m) || 0
    if (typeof opt.rentalNetMonthly === 'number') cf += opt.rentalNetMonthly
    balances.CASH += cf

    // real spend and SS (inflation-adjusted)
    const retired = opt.retAt == null ? true : m >= opt.retAt
    const spendNominal = retired ? spendReal * Math.exp(inflM * m) : 0
    const ssNominal = retired ? ssReal * Math.exp(inflM * m) : 0
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
    rentalNetMonthly: timeline.rentalNetMonthly
  }

  const details: PathStats[] = []
  for (let i = 0; i < paths; i++) {
    details.push(runPath(total, weights, { ...loopOpt, mcMode: options.mcMode || 'regime' }))
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

export function simulateDeterministic(snapshot: Snapshot, options: SimOptions = {}): { terminal: number } {
  const years = options.years ?? 40
  const inflation = options.inflation ?? (snapshot.assumptions?.inflation_pct ?? 0.02)
  const rebalFreq = options.rebalFreq ?? (snapshot.assumptions?.rebalancing?.frequency || 'annual')
  const { weights, total } = computeAllocation(snapshot)
  const timeline = buildTimeline(snapshot, years)

  const rebalEvery = rebalFreq === 'monthly' ? 1 : rebalFreq === 'quarterly' ? 3 : 12
  const muRE = realEstateMu(snapshot)
  RETURNS.REAL_ESTATE.mu = muRE
  const cashflows = new Map<number, number>()
  for (const cf of timeline.cashflows) cashflows.set(cf.monthIndex, (cashflows.get(cf.monthIndex) || 0) + cf.amount)

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
    deterministic: true,
    rentalNetMonthly: timeline.rentalNetMonthly
  }

  const res = runPath(total, weights, loopOpt)
  return { terminal: res.terminal }
}

export function simulateSeries(snapshot: Snapshot, options: SimOptions & { maxPathsForSeries?: number } = {}) {
  const years = options.years ?? 40
  const inflation = options.inflation ?? (snapshot.assumptions?.inflation_pct ?? 0.02)
  const rebalFreq = options.rebalFreq ?? (snapshot.assumptions?.rebalancing?.frequency || 'annual')
  const paths = Math.max(1, options.paths ?? 500)
  const maxPaths = options.maxPathsForSeries ?? Math.min(paths, 1000)
  const { weights, total } = computeAllocation(snapshot)
  const timeline = buildTimeline(snapshot, years)

  const rebalEvery = rebalFreq === 'monthly' ? 1 : rebalFreq === 'quarterly' ? 3 : 12
  const muRE = realEstateMu(snapshot)
  RETURNS.REAL_ESTATE.mu = muRE
  const cashflows = new Map<number, number>()
  for (const cf of timeline.cashflows) cashflows.set(cf.monthIndex, (cashflows.get(cf.monthIndex) || 0) + cf.amount)
  const spendMonthly = Math.max(0, snapshot.retirement.expected_spend_monthly || 0)
  const ssMonthly = (snapshot.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)
  const loopOptBase = { months: timeline.months, inflation, rebalEvery, spendMonthly, ssMonthly, cashflows, retAt: timeline.retirementAt }

  // Deterministic series with by-class breakdown
  const detSeries = runPathWithSeries(total, weights, { ...loopOptBase, deterministic: true, rentalNetMonthly: timeline.rentalNetMonthly })

  // Monte Carlo series for total balances; compute percentiles per month
  const series: number[][] = []
  for (let i = 0; i < maxPaths; i++) {
    const s = runPathWithSeries(total, weights, { ...loopOptBase, rentalNetMonthly: timeline.rentalNetMonthly, mcMode: options.mcMode || 'regime' }).total
    series.push(s)
  }
  const months = timeline.months
  const p = (arr: number[], q: number) => {
    const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(q * (arr.length - 1))))
    return arr[idx]
  }
  const mc = { p10: new Array<number>(months), p25: new Array<number>(months), p50: new Array<number>(months), p75: new Array<number>(months), p90: new Array<number>(months) }
  for (let m = 0; m < months; m++) {
    const col = series.map((s) => s[m]).sort((a, b) => a - b)
    mc.p10[m] = p(col, 0.1)
    mc.p25[m] = p(col, 0.25)
    mc.p50[m] = p(col, 0.5)
    mc.p75[m] = p(col, 0.75)
    mc.p90[m] = p(col, 0.9)
  }

  return { months, det: detSeries, mc }
}

function runPathWithSeries(initial: number, targets: Record<AssetClass, number>, opt: LoopOptions) {
  // Initialize balances
  let balances: Record<AssetClass, number> = zeroBalances()
  ASSET_CLASSES.forEach((k) => (balances[k] = initial * (targets[k] || 0)))
  const paramsM = Object.fromEntries(
    ASSET_CLASSES.map((k) => {
      const p = RETURNS[k]
      const { muM, sigmaM } = monthlyParams(p.mu, p.sigma)
      return [k, { muM, sigmaM }]
    })
  ) as Record<AssetClass, { muM: number; sigmaM: number }>
  let sampler: { next(): Record<AssetClass, number> } | null = null
  if (!opt.deterministic) {
    if (opt.mcMode === 'bootstrap') {
      const hist = tryLoadHistorical()
      if (hist) sampler = createBootstrapSampler(hist, opt.months, ASSET_CLASSES, { blockMonths: 24, jitterSigma: 0.005 })
      else sampler = createRegimeSampler()
    } else if (opt.mcMode === 'regime') {
      sampler = createRegimeSampler()
    }
  }

  const inflM = Math.log(1 + opt.inflation) / 12
  const spendReal = opt.spendMonthly
  const ssReal = opt.ssMonthly

  const total: number[] = new Array(opt.months)
  const byClass: Record<AssetClass, number[]> = {} as any
  ASSET_CLASSES.forEach((k) => { byClass[k] = new Array(opt.months) })

  for (let m = 0; m < opt.months; m++) {
    ASSET_CLASSES.forEach((k) => {
      const p = paramsM[k]
      const r = opt.deterministic ? deterministicReturn(p.muM) : sampler ? sampler.next()[k] : sampleReturn(p.muM, p.sigmaM)
      balances[k] *= 1 + r
    })
    let cf = opt.cashflows.get(m) || 0
    if (typeof opt.rentalNetMonthly === 'number') cf += opt.rentalNetMonthly
    balances.CASH += cf
    const spendNominal = spendReal * Math.exp(inflM * m)
    const ssNominal = ssReal * Math.exp(inflM * m)
    balances.CASH += ssNominal - spendNominal
    if (opt.rebalEvery > 0 && (m + 1) % opt.rebalEvery === 0) rebalance(balances, targets)
    const t = ASSET_CLASSES.reduce((s, k) => s + balances[k], 0)
    total[m] = t
    ASSET_CLASSES.forEach((k) => (byClass[k][m] = balances[k]))
  }
  return { total, byClass }
}

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

// Regime-based return sampler to model sequences with persistent downturns
type Regime = 'bull' | 'bear' | 'stagnation'
interface RegimeParams { mu: Record<AssetClass, number>; sigma: Record<AssetClass, number> }

function createRegimeSampler() {
  let state: Regime = 'bull'
  // Monthly regime transition probabilities
  const T: Record<Regime, Record<Regime, number>> = {
    bull: { bull: 0.90, bear: 0.05, stagnation: 0.05 },
    bear: { bear: 0.85, bull: 0.10, stagnation: 0.05 },
    stagnation: { stagnation: 0.80, bull: 0.15, bear: 0.05 }
  }
  const params: Record<Regime, RegimeParams> = {
    bull: {
      mu: { US_STOCK: 0.009, INTL_STOCK: 0.008, BONDS: 0.002, REIT: 0.008, CASH: 0.001, REAL_ESTATE: 0.003, CRYPTO: 0.03 },
      sigma: { US_STOCK: 0.04, INTL_STOCK: 0.05, BONDS: 0.015, REIT: 0.06, CASH: 0.002, REAL_ESTATE: 0.03, CRYPTO: 0.20 }
    },
    bear: {
      mu: { US_STOCK: -0.015, INTL_STOCK: -0.017, BONDS: 0.004, REIT: -0.013, CASH: 0.001, REAL_ESTATE: -0.005, CRYPTO: -0.06 },
      sigma: { US_STOCK: 0.07, INTL_STOCK: 0.08, BONDS: 0.02, REIT: 0.08, CASH: 0.002, REAL_ESTATE: 0.05, CRYPTO: 0.30 }
    },
    stagnation: {
      mu: { US_STOCK: 0.0, INTL_STOCK: 0.0, BONDS: 0.001, REIT: 0.0, CASH: 0.001, REAL_ESTATE: 0.001, CRYPTO: 0.0 },
      sigma: { US_STOCK: 0.03, INTL_STOCK: 0.035, BONDS: 0.012, REIT: 0.04, CASH: 0.002, REAL_ESTATE: 0.02, CRYPTO: 0.20 }
    }
  }
  function stepState() {
    const r = Math.random()
    const row = T[state]
    let acc = 0
    for (const s of ['bull','bear','stagnation'] as Regime[]) {
      acc += row[s]
      if (r <= acc) { state = s; break }
    }
  }
  return {
    next(): Record<AssetClass, number> {
      // evolve state with persistence
      stepState()
      const p = params[state]
      const ret: Record<AssetClass, number> = { US_STOCK: 0, INTL_STOCK: 0, BONDS: 0, REIT: 0, CASH: 0, REAL_ESTATE: 0, CRYPTO: 0 }
      ASSET_CLASSES.forEach((k) => {
        const r = p.mu[k] + p.sigma[k] * randn()
        ret[k] = r
      })
      return ret
    }
  }
}
