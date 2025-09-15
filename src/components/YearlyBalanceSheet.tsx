import React, { useMemo } from 'react'
import type { Snapshot } from '@types/schema'
import type { AssetClass } from '@types/engine'
import { buildTimeline } from '@engine/schedule'
import { simulateDeterministicReturnContribs } from '@engine/sim'
import { computeAllocation } from '@engine/alloc'

function sum(a: number[]) { return a.reduce((s, x) => s + x, 0) }

export const YearlyBalanceSheet: React.FC<{
  snapshot: Snapshot
  yearEnds: number[]
  years: number
  inflation: number
  startYear?: number
  aliveFrac?: number[]
}> = ({ snapshot, yearEnds, years, inflation, startYear, aliveFrac }) => {
  const months = years * 12
  const data = useMemo(() => {
    const safe = (n: number | undefined | null) => (typeof n === 'number' && isFinite(n) ? n : 0)
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
    // contributions/extra expenses per year (exclude property flows to avoid double counting with perYear)
    const contrib: number[] = new Array(years).fill(0)
    const extraExp: number[] = new Array(years).fill(0)
    for (const cf of tl.cashflows) {
      if (cf.kind === 'property') continue
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
    // end and start balances derived from selected totals series (percentile)
    const endBal: number[] = new Array(years).fill(0)
    const startBal: number[] = new Array(years).fill(0)
    const initialTotal = Number.isFinite(computeAllocation(snapshot).total) ? computeAllocation(snapshot).total : 0
    for (let y = 0; y < years; y++) {
      const prevEnd = y === 0 ? initialTotal : endBal[y - 1]
      endBal[y] = safe(yearEnds[y])
      startBal[y] = prevEnd
    }
    const retTotals = Array.from({ length: years }, (_, y) => {
      const inc = (contrib[y] || 0) + (ss[y] || 0) + (perYear[y]?.rentNet || 0)
      const exp = (spend[y] || 0) + (perYear[y]?.mortgage || 0) + (perYear[y]?.reCarry || 0) + (extraExp[y] || 0)
      return safe(endBal[y]) - safe(startBal[y]) - (inc - exp)
    })
    return { perYear, contrib, extraExp, ss, spend, returnsByYear, endBal, startBal, retTotals }
  }, [snapshot, yearEnds, years, inflation])

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  function downloadCsv() {
    const rows = [
      ['Year','Start','Returns','Income','Expenditures','End','Contrib','SS','RentNet','Spend','Mortgage','RE_Costs','Extra','Ret_US','Ret_Intl','Ret_Bonds','Ret_RE','Alive_Frac']
    ] as (string|number)[][]
    for (let y = 0; y < years; y++) {
      const yr = startYear != null ? (startYear + y) : y
      const r = data.returnsByYear[y]
      const inc = (data.contrib[y] || 0) + (data.ss[y] || 0) + (data.perYear[y]?.rentNet || 0)
      const exp = (data.spend[y] || 0) + (data.perYear[y]?.mortgage || 0) + (data.perYear[y]?.reCarry || 0) + (data.extraExp[y] || 0)
      rows.push([
        yr,
        Math.round(data.startBal[y]),
        Math.round(data.retTotals[y]),
        Math.round(inc),
        Math.round(exp),
        Math.round(data.endBal[y]),
        Math.round(data.contrib[y] || 0),
        Math.round(data.ss[y] || 0),
        Math.round(data.perYear[y]?.rentNet || 0),
        Math.round(data.spend[y] || 0),
        Math.round(data.perYear[y]?.mortgage || 0),
        Math.round(data.perYear[y]?.reCarry || 0),
        Math.round(data.extraExp[y] || 0),
        Math.round(r.byClass.US_STOCK || 0),
        Math.round(r.byClass.INTL_STOCK || 0),
        Math.round(r.byClass.BONDS || 0),
        Math.round(r.byClass.REAL_ESTATE || 0),
        aliveFrac && aliveFrac[y] != null ? Number(aliveFrac[y].toFixed(3)) : ''
      ])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'yearly_balance_sheet.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Yearly Balance Sheet</h2>
        <button onClick={downloadCsv}>Download CSV</button>
      </div>
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
            const retTotal = data.retTotals[y]
            return (
              <tr key={y}>
                <td>{yearLabel}</td>
                <td>{fmt(data.startBal[y])}</td>
                <td>
                  <div style={{ color: '#a6da95' }}>{fmt(retTotal)}</div>
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
