import type { Snapshot } from '@types/schema'
import { buildTimeline } from '@engine/schedule'
import { simulateDeterministicReturnContribs } from '@engine/sim'
import { computeAllocation } from '@engine/alloc'

const safe = (n: number | undefined | null) => (typeof n === 'number' && isFinite(n) ? n : 0)
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)

export interface YearlyBreakdownData {
  year: number
  startBalance: number
  endBalance: number
  income: {
    total: number
    contributions: number
    socialSecurity: number
    rental: number
  }
  expenditures: {
    total: number
    spending: number
    mortgage: number
    realEstateCosts: number
    extra: number
  }
  returns: {
    total: number
    byClass: Record<string, number>
  }
  isRetired: boolean
}

export function generateYearlyBreakdown(
  snapshot: Snapshot,
  years: number,
  inflation: number,
  yearEnds: number[]
): YearlyBreakdownData[] {
  const months = years * 12
  const tl = buildTimeline(snapshot, years)
  const inflM = Math.log(1 + inflation) / 12
  const ssMonthly = (snapshot.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)
  const spendMonthly = Math.max(0, snapshot.retirement.expected_spend_monthly || 0)

  const perYear = Array.from({ length: years }, () => ({ rentNet: 0, mortgage: 0, reCarry: 0 }))
  for (const re of snapshot.real_estate || []) {
    const taxes = re.taxes || 0
    const ins = re.insurance || 0
    const maint = (re.maintenance_pct || 0) * (re.value || 0)
    const rNet = re.rental ? ((re.rental.rent || 0) * (1 - (re.rental.vacancy_pct || 0)) - (re.rental.expenses || 0)) : 0
    const P = Math.max(0, re.mortgage_balance || 0)
    const pay = Math.max(0, re.payment || 0)
    const r = Math.max(0, (re.rate || 0) / 12)
    let mortgageMonths = 0
    if (P > 0 && pay > 0) {
      if (r > 0 && pay > P * r) mortgageMonths = Math.ceil(Math.log(pay / (pay - r * P)) / Math.log(1 + r))
      else if (r === 0) mortgageMonths = Math.ceil(P / pay)
      else mortgageMonths = months
    }
    for (let m = 0; m < months; m++) {
      const y = Math.floor(m / 12)
      perYear[y].rentNet += rNet
      perYear[y].reCarry += taxes / 12 + ins / 12 + maint / 12
      if (m < mortgageMonths) perYear[y].mortgage += pay
    }
  }

  const contrib: number[] = new Array(years).fill(0)
  const extraExp: number[] = new Array(years).fill(0)
  for (const cf of tl.cashflows) {
    if (cf.kind === 'property') continue
    const y = Math.floor(cf.monthIndex / 12)
    if (cf.amount > 0) contrib[y] += cf.amount; else extraExp[y] += -cf.amount
  }

  const ss: number[] = new Array(years).fill(0)
  const spend: number[] = new Array(years).fill(0)
  for (let y = 0; y < years; y++) {
    const ms = y * 12, me = Math.min(months - 1, (y + 1) * 12 - 1)
    for (let m = ms; m <= me; m++) {
      const retired = tl.retirementAt == null ? true : m >= (tl.retirementAt as number)
      if (tl.ssStartMonth != null && m >= (tl.ssStartMonth as number)) ss[y] += ssMonthly * Math.exp(inflM * m)
      if (retired) spend[y] += spendMonthly * Math.exp(inflM * m)
    }
  }

  const endBal: number[] = new Array(years).fill(0)
  const startBal: number[] = new Array(years).fill(0)
  const initialTotal = Number.isFinite(computeAllocation(snapshot).total) ? computeAllocation(snapshot).total : 0
  for (let y = 0; y < years; y++) {
    const prevEnd = y === 0 ? initialTotal : endBal[y - 1]
    endBal[y] = safe(yearEnds[y])
    startBal[y] = prevEnd
  }

  // Calculate return contributions based on start of year balances
  const returnsByClassPerYear: Record<string, number>[] = []
  const tempBalances = { ...computeAllocation(snapshot).byClass }
  let currentTotal = initialTotal
  for (let y = 0; y < years; y++) {
    const yearStartTotal = y === 0 ? initialTotal : endBal[y-1]
    const yearStartWeights = computeAllocation({ ...snapshot, accounts: [] }).weights // Use default weights, but need to scale by class balances

    // Approximate start-of-year balance by class
    const startBalancesByClass = Object.keys(tempBalances).reduce((acc, key) => {
        acc[key] = (tempBalances[key] / currentTotal) * yearStartTotal;
        return acc;
    }, {});

    const returnContribs = simulateDeterministicReturnContribs(
        {...snapshot, accounts:[]}, // a bit of a hack to get the returns based on weights
        { years: 1 }
    );
    const yearlyReturnByClass = {}
    for(const key in returnContribs) {
        yearlyReturnByClass[key] = sum(returnContribs[key]) * (startBalancesByClass[key] || 0) / initialTotal
    }
    returnsByClassPerYear.push(yearlyReturnByClass)

    // Update balances for next year's approximation
    currentTotal = endBal[y];
    for(const key in tempBalances) {
        tempBalances[key] += yearlyReturnByClass[key]
    }
  }

  const result: YearlyBreakdownData[] = []
  for (let y = 0; y < years; y++) {
    const income = {
      total: safe(contrib[y]) + safe(ss[y]) + safe(perYear[y].rentNet),
      contributions: safe(contrib[y]),
      socialSecurity: safe(ss[y]),
      rental: safe(perYear[y].rentNet),
    }
    const expenditures = {
      total: safe(spend[y]) + safe(perYear[y].mortgage) + safe(perYear[y].reCarry) + safe(extraExp[y]),
      spending: safe(spend[y]),
      mortgage: safe(perYear[y].mortgage),
      realEstateCosts: safe(perYear[y].reCarry),
      extra: safe(extraExp[y]),
    }
    const totalReturns = safe(endBal[y]) - safe(startBal[y]) - (income.total - expenditures.total)

    result.push({
      year: (snapshot.timestamp ? new Date(snapshot.timestamp).getFullYear() : new Date().getFullYear()) + y,
      startBalance: safe(startBal[y]),
      endBalance: safe(endBal[y]),
      income,
      expenditures,
      returns: {
        total: totalReturns,
        byClass: returnsByClassPerYear[y] || {},
      },
      isRetired: tl.retirementAt != null && y >= Math.floor(tl.retirementAt / 12),
    })
  }

  return result
}
