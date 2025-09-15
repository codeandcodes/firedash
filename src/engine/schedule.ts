import type { Snapshot } from '@types/schema'

export interface CashFlow {
  monthIndex: number // 0-based from start
  amount: number // positive = inflow to portfolio, negative = outflow
  kind?: 'contrib' | 'expense' | 'property'
}

export interface Timeline {
  months: number
  retirementAt?: number // month index
  cashflows: CashFlow[]
  ssStartMonth?: number
}

function monthsBetween(startISO: string, years: number): number {
  return Math.max(1, Math.round(years * 12))
}

function monthIndexFrom(start: Date, dateISO?: string): number | undefined {
  if (!dateISO) return undefined
  const d = new Date(dateISO)
  if (isNaN(d.getTime())) return undefined
  return (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
}

export function buildTimeline(snapshot: Snapshot, years: number): Timeline {
  const start = new Date(snapshot.timestamp)
  const totalMonths = monthsBetween(snapshot.timestamp, years)
  const flows: CashFlow[] = []

  // Contributions
  for (const c of snapshot.contributions || []) {
    if (!c.amount) continue
    const s = monthIndexFrom(start, c.start) ?? 0
    const e = monthIndexFrom(start, c.end) ?? totalMonths - 1
    if (c.frequency === 'once') {
      if (s >= 0 && s < totalMonths) flows.push({ monthIndex: s, amount: c.amount, kind: 'contrib' })
    } else if (c.frequency === 'monthly') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m++) flows.push({ monthIndex: m, amount: c.amount, kind: 'contrib' })
    } else if (c.frequency === 'annual') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m += 12) flows.push({ monthIndex: m, amount: c.amount, kind: 'contrib' })
    }
  }

  // Expenses
  for (const ex of snapshot.expenses || []) {
    if (!ex.amount) continue
    const s = monthIndexFrom(start, ex.start) ?? 0
    const e = monthIndexFrom(start, ex.end) ?? totalMonths - 1
    const amt = -Math.abs(ex.amount)
    if (ex.frequency === 'once') {
      if (s >= 0 && s < totalMonths) flows.push({ monthIndex: s, amount: amt, kind: 'expense' })
    } else if (ex.frequency === 'monthly') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m++) flows.push({ monthIndex: m, amount: amt, kind: 'expense' })
    } else if (ex.frequency === 'annual') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m += 12) flows.push({ monthIndex: m, amount: amt, kind: 'expense' })
    }
  }

  // Retirement spend handled in simulation loop; Social Security start month derived below.

  // Retirement date → month index if provided
  let retirementAt: number | undefined
  if (snapshot.retirement?.target_date) {
    retirementAt = monthIndexFrom(start, snapshot.retirement.target_date)
  }
  if (retirementAt == null && snapshot.retirement?.target_age != null && snapshot.person?.current_age != null) {
    const deltaYears = Math.max(0, (snapshot.retirement.target_age as number) - (snapshot.person.current_age as number))
    retirementAt = Math.round(deltaYears * 12)
  }
  // Property flows per month: add recurring carrying costs and rental net income; mortgage ends when paid off.
  for (const re of snapshot.real_estate || []) {
    const taxes = re.taxes || 0
    const ins = re.insurance || 0
    const maint = (re.maintenance_pct || 0) * (re.value || 0)
    const rMonthly = re.rental ? ((re.rental.rent || 0) * (1 - (re.rental.vacancy_pct || 0)) - (re.rental.expenses || 0)) : 0
    // Mortgage payoff months
    let mortgageMonths = totalMonths
    const P = Math.max(0, re.mortgage_balance || 0)
    const pay = Math.max(0, re.payment || 0)
    const r = Math.max(0, (re.rate || 0) / 12)
    if (P > 0 && pay > 0) {
      if (r > 0 && pay > P * r) {
        // n = ln(p/(p - rP)) / ln(1+r)
        mortgageMonths = Math.min(totalMonths, Math.ceil(Math.log(pay / (pay - r * P)) / Math.log(1 + r)))
      } else if (r === 0) {
        mortgageMonths = Math.min(totalMonths, Math.ceil(P / pay))
      } else {
        // Negative amortization or insufficient payment; treat as interest-only for horizon
        mortgageMonths = totalMonths
      }
    } else {
      mortgageMonths = 0
    }
    for (let m = 0; m < totalMonths; m++) {
      const carry = -(taxes/12 + ins/12 + maint/12)
      const mort = m < mortgageMonths ? -(pay) : 0
      const net = rMonthly + carry + mort
      if (net !== 0) flows.push({ monthIndex: m, amount: net, kind: 'property' })
    }
  }

  // Determine Social Security start month based on earliest claim_age
  let ssStartMonth: number | undefined
  if ((snapshot.social_security || []).length && snapshot.person?.current_age != null) {
    let minMonth: number | undefined
    for (const ss of snapshot.social_security || []) {
      if (ss.claim_age != null) {
        const deltaYears = Math.max(0, (ss.claim_age as number) - (snapshot.person!.current_age as number))
        const m = Math.round(deltaYears * 12)
        if (minMonth == null || m < minMonth) minMonth = m
      }
    }
    ssStartMonth = minMonth
  }

  return { months: totalMonths, retirementAt, ssStartMonth, cashflows: flows.sort((a, b) => a.monthIndex - b.monthIndex) }
}
/*
Monthly cashflow schedule builder.
- Aggregates contributions/expenses into month-indexed cashflows over N years.
- Adds property flows each month: rent net, recurring carrying costs, and mortgage payments until payoff (tagged kind: 'property').
- Derives retirementAt month from target_date or (target_age - current_age) and ssStartMonth from earliest claim_age.
*/
