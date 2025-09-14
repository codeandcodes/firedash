import React, { useMemo } from 'react'
import type { Snapshot } from '@types/schema'
import type { AssetClass } from '@types/engine'
import { buildTimeline } from '@engine/schedule'
import { simulateDeterministicReturnContribs } from '@engine/sim'

function sum(arr: number[]) { return arr.reduce((s, x) => s + x, 0) }

export const YearlyBreakdown: React.FC<{
  snapshot: Snapshot
  byClass: Record<AssetClass, number[]>
  years: number
  inflation: number
  startYear?: number
  title?: string
}> = ({ snapshot, byClass, years, inflation, startYear, title = 'Yearly Breakdown' }) => {
  const months = years * 12

  const { assetDeltas, flows } = useMemo(() => {
    const classes: AssetClass[] = ['US_STOCK','INTL_STOCK','BONDS','REAL_ESTATE']
    const contrib = simulateDeterministicReturnContribs(snapshot, { years })
    const assetDeltas: Record<number, Record<string, number>> = {}
    for (let y = 0; y < years; y++) {
      const ms = y*12, me = Math.min(months - 1, (y+1)*12 - 1)
      const deltas: Record<string, number> = {}
      for (const k of classes) {
        const sumK = sum(contrib[k].slice(ms, me + 1))
        deltas[k] = sumK
      }
      assetDeltas[y] = deltas
    }
    // Planned flows
    const tl = buildTimeline(snapshot, years)
    const inflM = Math.log(1 + inflation) / 12
    const ssMonthly = (snapshot.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)
    const spendMonthly = Math.max(0, snapshot.retirement.expected_spend_monthly || 0)
    const flows = [] as { y: number; contrib: number; extraExp: number; ss: number; rentNet: number; mortgage: number; reCarry: number; spend: number }[]
    // Precompute per-year property flows accounting for mortgage payoff
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
        else mortgageMonths = months // interest-only
      }
      for (let m = 0; m < months; m++) {
        const y = Math.floor(m / 12)
        perYear[y].rentNet += rNet
        perYear[y].reCarry += taxes/12 + ins/12 + maint/12
        if (m < mortgageMonths) perYear[y].mortgage += pay
      }
    }
    for (let y = 0; y < years; y++) {
      const ms = y*12, me = Math.min(months - 1, (y+1)*12 - 1)
      // contributions/expenses (user-inputted)
      let contrib = 0, extraExp = 0
      for (let m = ms; m <= me; m++) {
        const atM = tl.cashflows.filter(cf => cf.monthIndex === m)
        for (const cf of atM) {
          if (cf.amount > 0) contrib += cf.amount
          else extraExp += -cf.amount
        }
      }
      // SS and retirement spend (inflation-adjusted); SS starts at ssStartMonth
      let ss = 0, spend = 0
      for (let m = ms; m <= me; m++) {
        const retired = tl.retirementAt == null ? true : m >= (tl.retirementAt as number)
        if (tl.ssStartMonth != null && m >= (tl.ssStartMonth as number)) ss += ssMonthly * Math.exp(inflM * m)
        if (retired) spend += spendMonthly * Math.exp(inflM * m)
      }
      const { rentNet, mortgage, reCarry } = perYear[y]
      flows.push({ y, contrib, extraExp, ss, rentNet, mortgage, reCarry, spend })
    }
    return { assetDeltas, flows }
  }, [snapshot, byClass, years, inflation])

  function fmt(n: number) { return `$${Math.round(n).toLocaleString()}` }

  return (
    <div>
      <h2>{title}</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Asset Change (US/Intl/Bonds/RE)</th>
            <th>Incomes</th>
            <th>Expenditures</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: years }).map((_, y) => {
            const d = assetDeltas[y]
            const f = flows[y]
            const label = startYear != null ? String(startYear + y) : String(y)
            return (
              <tr key={y}>
                <td>{label}</td>
                <td>
                  <div style={{ color: '#a6da95', fontSize: 12 }}>
                    {`${fmt(d.US_STOCK)} / ${fmt(d.INTL_STOCK)} / ${fmt(d.BONDS)} / ${fmt(d.REAL_ESTATE)}`}
                  </div>
                </td>
                <td>
                  <div style={{ color: '#a6da95', fontSize: 12 }}>
                    {`Contrib ${fmt(f.contrib)}; SS ${fmt(f.ss)}; Rent ${fmt(f.rentNet)}`}
                  </div>
                </td>
                <td>
                  <div style={{ color: '#f28fad', fontSize: 12 }}>
                    {`Spend ${fmt(f.spend)}; Mortgage ${fmt(f.mortgage)}; RE Costs ${fmt(f.reCarry)}; Extra ${fmt(f.extraExp)}`}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
