import type { Snapshot } from '@types/schema'

export interface CashFlow {
  monthIndex: number // 0-based from start
  amount: number // positive = inflow to portfolio, negative = outflow
}

export interface Timeline {
  months: number
  retirementAt?: number // month index
  cashflows: CashFlow[]
  rentalNetMonthly?: number
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
      if (s >= 0 && s < totalMonths) flows.push({ monthIndex: s, amount: c.amount })
    } else if (c.frequency === 'monthly') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m++) flows.push({ monthIndex: m, amount: c.amount })
    } else if (c.frequency === 'annual') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m += 12) flows.push({ monthIndex: m, amount: c.amount })
    }
  }

  // Expenses
  for (const ex of snapshot.expenses || []) {
    if (!ex.amount) continue
    const s = monthIndexFrom(start, ex.start) ?? 0
    const e = monthIndexFrom(start, ex.end) ?? totalMonths - 1
    const amt = -Math.abs(ex.amount)
    if (ex.frequency === 'once') {
      if (s >= 0 && s < totalMonths) flows.push({ monthIndex: s, amount: amt })
    } else if (ex.frequency === 'monthly') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m++) flows.push({ monthIndex: m, amount: amt })
    } else if (ex.frequency === 'annual') {
      for (let m = Math.max(0, s); m <= e && m < totalMonths; m += 12) flows.push({ monthIndex: m, amount: amt })
    }
  }

  // Retirement spend (outflow) and social security (inflow) handled in sim loop via parameters.

  // Retirement date → month index if provided
  let retirementAt: number | undefined
  if (snapshot.retirement?.target_date) {
    retirementAt = monthIndexFrom(start, snapshot.retirement.target_date)
  }
  if (retirementAt == null && snapshot.retirement?.target_age != null && snapshot.person?.current_age != null) {
    const deltaYears = Math.max(0, (snapshot.retirement.target_age as number) - (snapshot.person.current_age as number))
    retirementAt = Math.round(deltaYears * 12)
  }
  // Rental net flows (rough): rent*(1-vacancy) - expenses - taxes/12 - insurance/12 - maintenance*value/12 - payment
  let rentalNetMonthly = 0
  for (const re of snapshot.real_estate || []) {
    if (re.rental) {
      const rent = re.rental.rent || 0
      const vacancy = re.rental.vacancy_pct || 0
      const rexp = re.rental.expenses || 0
      const taxes = re.taxes || 0
      const ins = re.insurance || 0
      const maint = (re.maintenance_pct || 0) * (re.value || 0)
      const payment = re.payment || 0
      rentalNetMonthly += (rent * (1 - vacancy)) - rexp - taxes/12 - ins/12 - maint/12 - payment
    }
  }

  return { months: totalMonths, retirementAt, cashflows: flows.sort((a, b) => a.monthIndex - b.monthIndex), rentalNetMonthly }
}
/*
Monthly cashflow schedule builder.
- Aggregates contributions/expenses into month-indexed cashflows over N years.
- Computes rental net monthly from real estate entries.
- Derives retirementAt month from target_date or (target_age - current_age).
*/
