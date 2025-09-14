import React, { useMemo } from 'react'
import type { Snapshot } from '@types/schema'
import type { AssetClass } from '@types/engine'
import { buildTimeline } from '@engine/schedule'
import { simulateDeterministicReturnContribs } from '@engine/sim'

function sum(a: number[]) { return a.reduce((s, x) => s + x, 0) }

export const YearlyBalanceSheet: React.FC<{
  snapshot: Snapshot
  totals: number[]
  years: number
  inflation: number
  startYear?: number
}> = ({ snapshot, totals, years, inflation, startYear }) => {
  const months = years * 12
  const data = useMemo(() => {
    const tl = buildTimeline(snapshot, years)
    const inflM = Math.log(1 + inflation) / 12
    const ssMonthly = (snapshot.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)
    const spendMonthly = Math.max(0, snapshot.retirement.expected_spend_monthly || 0)
    // per-year property flows accounting for mortgage payoff (as in YearlyBreakdown)
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
        perYear[y].reCarry += taxes/12 + ins/12 + maint/12
        if (m < mortgageMonths) perYear[y].mortgage += pay
      }
    }
    // contributions/extra expenses per year
    const contrib: number[] = new Array(years).fill(0)
    const extraExp: number[] = new Array(years).fill(0)
    for (const cf of tl.cashflows) {
      const y = Math.floor(cf.monthIndex / 12)
      if (cf.amount > 0) contrib[y] += cf.amount; else extraExp[y] += -cf.amount
    }
    // SS and spend per year
    const ss: number[] = new Array(years).fill(0)
    const spend: number[] = new Array(years).fill(0)
    for (let y = 0; y < years; y++) {
      const ms = y*12, me = Math.min(months - 1, (y+1)*12 - 1)
      for (let m = ms; m <= me; m++) {
        const retired = tl.retirementAt == null ? true : m >= (tl.retirementAt as number)
        if (tl.ssStartMonth != null && m >= (tl.ssStartMonth as number)) ss[y] += ssMonthly * Math.exp(inflM * m)
        if (retired) spend[y] += spendMonthly * Math.exp(inflM * m)
      }
    }
    // returns-only contributions
    const contribByClass = simulateDeterministicReturnContribs(snapshot, { years })
    const returnsByYear: { all: number; byClass: Record<string, number> }[] = []
    const classes: AssetClass[] = ['US_STOCK','INTL_STOCK','BONDS','REAL_ESTATE']
    for (let y = 0; y < years; y++) {
      const ms = y*12, me = Math.min(months - 1, (y+1)*12 - 1)
      const byClass: Record<string, number> = {}
      let s = 0
      for (const k of classes) { const v = sum(contribByClass[k].slice(ms, me + 1)); byClass[k] = v; s += v }
      returnsByYear.push({ all: s, byClass })
    }
    // end and derived start balances
    const endBal: number[] = new Array(years).fill(0)
    const startBal: number[] = new Array(years).fill(0)
    for (let y = 0; y < years; y++) {
      const me = Math.min(months - 1, (y+1)*12 - 1)
      endBal[y] = totals[me]
      const incomes = contrib[y] + ss[y] + perYear[y].rentNet
      const expenses = spend[y] + perYear[y].mortgage + perYear[y].reCarry + extraExp[y]
      startBal[y] = endBal[y] - returnsByYear[y].all - (incomes - expenses)
    }
    return { perYear, contrib, extraExp, ss, spend, returnsByYear, endBal, startBal }
  }, [snapshot, totals, years, inflation])

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  return (
    <div>
      <h2>Yearly Balance Sheet</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Start</th>
            <th>Returns</th>
            <th>Income</th>
            <th>Expenditures</th>
            <th>End</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: years }).map((_, y) => {
            const yearLabel = startYear != null ? String(startYear + y) : String(y)
            const r = data.returnsByYear[y]
            const inc = data.contrib[y] + data.ss[y] + data.perYear[y].rentNet
            const exp = data.spend[y] + data.perYear[y].mortgage + data.perYear[y].reCarry + data.extraExp[y]
            return (
              <tr key={y}>
                <td>{yearLabel}</td>
                <td>{fmt(data.startBal[y])}</td>
                <td>
                  <div style={{ color: '#a6da95' }}>{fmt(r.all)}</div>
                  <div style={{ color: '#a6da95', fontSize: 12 }}>{`US ${fmt(r.byClass.US_STOCK||0)} • Intl ${fmt(r.byClass.INTL_STOCK||0)} • Bonds ${fmt(r.byClass.BONDS||0)} • RE ${fmt(r.byClass.REAL_ESTATE||0)}`}</div>
                </td>
                <td>
                  <div style={{ color: '#a6da95' }}>{fmt(inc)}</div>
                  <div style={{ color: '#a6da95', fontSize: 12 }}>{`Contrib ${fmt(data.contrib[y])} • SS ${fmt(data.ss[y])} • Rent ${fmt(data.perYear[y].rentNet)}`}</div>
                </td>
                <td>
                  <div style={{ color: '#f28fad' }}>{fmt(exp)}</div>
                  <div style={{ color: '#f28fad', fontSize: 12 }}>{`Spend ${fmt(data.spend[y])} • Mortgage ${fmt(data.perYear[y].mortgage)} • RE Costs ${fmt(data.perYear[y].reCarry)} • Extra ${fmt(data.extraExp[y])}`}</div>
                </td>
                <td>{fmt(data.endBal[y])}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

