import type { Snapshot } from '@types/schema'
import type { AssetClass, MonteSummary, PathStats, SimOptions } from '@types/engine'
import { DEFAULT_RETURNS, computeAllocation } from './alloc'
import { buildTimeline } from './schedule'

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
const ASSET_CLASSES: AssetClass[] = ['US_STOCK', 'INTL_STOCK', 'BONDS', 'REIT', 'CASH']

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
}

function runPath(initial: number, targets: Record<AssetClass, number>, opt: LoopOptions): PathStats {
  let balances: Balances = { US_STOCK: 0, INTL_STOCK: 0, BONDS: 0, REIT: 0, CASH: 0 }
  // seed by targets
  ASSET_CLASSES.forEach((k) => (balances[k] = initial * (targets[k] || 0)))

  const paramsM = Object.fromEntries(
    ASSET_CLASSES.map((k) => {
      const p = DEFAULT_RETURNS[k]
      const { muM, sigmaM } = monthlyParams(p.mu, p.sigma)
      return [k, { muM, sigmaM }]
    })
  ) as Record<AssetClass, { muM: number; sigmaM: number }>

  const inflM = Math.log(1 + opt.inflation) / 12
  const spendReal = opt.spendMonthly
  const ssReal = opt.ssMonthly

  let minDrawdown = 0

  for (let m = 0; m < opt.months; m++) {
    // apply returns
    ASSET_CLASSES.forEach((k) => {
      const p = paramsM[k]
      const r = opt.deterministic ? deterministicReturn(p.muM) : sampleReturn(p.muM, p.sigmaM)
      balances[k] *= 1 + r
    })

    // scheduled cash flows
    const cf = opt.cashflows.get(m) || 0
    balances.CASH += cf

    // real spend and SS (inflation-adjusted)
    const spendNominal = spendReal * Math.exp(inflM * m)
    const ssNominal = ssReal * Math.exp(inflM * m)
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
    cashflows
  }

  const details: PathStats[] = []
  for (let i = 0; i < paths; i++) {
    details.push(runPath(total, weights, { ...loopOpt }))
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
    deterministic: true
  }

  const res = runPath(total, weights, loopOpt)
  return { terminal: res.terminal }
}
