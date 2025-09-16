/**
 * YearlyBalanceSheet
 * - Computes per-year Start, Returns, Income, Expenditures, End using selected percentile year-end balances.
 * - Avoids double-counting property flows by tagging and excluding from Extra.
 * - Adds retirement badges/row highlighting and CSV export (includes Alive_Frac if provided).
 */
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
  comparison?: { snapshot: Snapshot; yearEnds: number[] }
}> = ({ snapshot, yearEnds, years, inflation, startYear, aliveFrac, comparison }) => {
  const months = years * 12
  const computeData = useMemo(() => {
    const calc = (snap: Snapshot, ends: number[]) => {
      const safe = (n: number | undefined | null) => (typeof n === 'number' && isFinite(n) ? n : 0)
      const tl = buildTimeline(snap, years)
      const inflM = Math.log(1 + inflation) / 12
      const ssMonthly = (snap.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)
      const spendMonthly = Math.max(0, snap.retirement.expected_spend_monthly || 0)
      const perYear = Array.from({ length: years }, () => ({ rentNet: 0, mortgage: 0, reCarry: 0 }))
      for (const re of snap.real_estate || []) {
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
        const ms = y*12, me = Math.min(months - 1, (y+1)*12 - 1)
        for (let m = ms; m <= me; m++) {
          const retired = tl.retirementAt == null ? true : m >= (tl.retirementAt as number)
          if (tl.ssStartMonth != null && m >= (tl.ssStartMonth as number)) ss[y] += ssMonthly * Math.exp(inflM * m)
          if (retired) spend[y] += spendMonthly * Math.exp(inflM * m)
        }
      }
      const contribByClass = simulateDeterministicReturnContribs(snap, { years })
      const returnsByYear: { all: number; byClass: Record<string, number> }[] = []
      const classes: AssetClass[] = ['US_STOCK','INTL_STOCK','BONDS','REAL_ESTATE']
      for (let y = 0; y < years; y++) {
        const ms = y*12, me = Math.min(months - 1, (y+1)*12 - 1)
        const byClass: Record<string, number> = {}
        let s = 0
        for (const k of classes) { const v = sum(contribByClass[k].slice(ms, me + 1)); byClass[k] = v; s += v }
        returnsByYear.push({ all: s, byClass })
      }
      const endBal: number[] = new Array(years).fill(0)
      const startBal: number[] = new Array(years).fill(0)
      const initialTotal = Number.isFinite(computeAllocation(snap).total) ? computeAllocation(snap).total : 0
      for (let y = 0; y < years; y++) {
        const prevEnd = y === 0 ? initialTotal : endBal[y - 1]
        endBal[y] = safe(ends[y])
        startBal[y] = prevEnd
      }
      const retTotals = Array.from({ length: years }, (_, y) => safe(returnsByYear[y].all))
      const retYearIdx = tl.retirementAt != null ? Math.floor((tl.retirementAt as number) / 12) : undefined
      return { perYear, contrib, extraExp, ss, spend, returnsByYear, endBal, startBal, retTotals, retYearIdx }
    }
    return {
      base: calc(snapshot, yearEnds),
      compare: comparison ? calc(comparison.snapshot, comparison.yearEnds) : null
    }
  }, [snapshot, yearEnds, comparison, years, inflation, months])

  const base = computeData.base
  const compareData = computeData.compare
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  const ensure = (n: number | undefined | null) => (typeof n === 'number' && isFinite(n) ? n : 0)

  function downloadCsv() {
    const header = ['Year','Start','Returns','Income','Expenditures','End','Contrib','SS','RentNet','Spend','Mortgage','RE_Costs','Extra','Ret_US','Ret_Intl','Ret_Bonds','Ret_RE','Alive_Frac']
    if (compareData) {
      header.push('Start_Scenario','Returns_Scenario','Income_Scenario','Expenditures_Scenario','End_Scenario')
    }
    const rows = [header] as (string|number)[][]
    let runningBaseStartCsv = ensure(base.startBal[0])
    let runningScenarioStartCsv = compareData ? ensure(compareData.startBal[0]) : 0
    for (let y = 0; y < years; y++) {
      const yr = startYear != null ? (startYear + y) : y
      const r = base.returnsByYear[y]
      const startB = runningBaseStartCsv
      const returnsB = ensure(base.retTotals[y])
      const incB = ensure(base.contrib[y]) + ensure(base.ss[y]) + ensure(base.perYear[y]?.rentNet)
      const expB = ensure(base.spend[y]) + ensure(base.perYear[y]?.mortgage) + ensure(base.perYear[y]?.reCarry) + ensure(base.extraExp[y])
      const endB = startB + returnsB + incB - expB
      runningBaseStartCsv = endB
      const row: (string|number)[] = [
        yr,
        Math.round(startB),
        Math.round(returnsB),
        Math.round(incB),
        Math.round(expB),
        Math.round(endB),
        Math.round(ensure(base.contrib[y])),
        Math.round(ensure(base.ss[y])),
        Math.round(ensure(base.perYear[y]?.rentNet)),
        Math.round(ensure(base.spend[y])),
        Math.round(ensure(base.perYear[y]?.mortgage)),
        Math.round(ensure(base.perYear[y]?.reCarry)),
        Math.round(ensure(base.extraExp[y])),
        Math.round(r.byClass.US_STOCK || 0),
        Math.round(r.byClass.INTL_STOCK || 0),
        Math.round(r.byClass.BONDS || 0),
        Math.round(r.byClass.REAL_ESTATE || 0),
        aliveFrac && aliveFrac[y] != null ? Number(aliveFrac[y].toFixed(3)) : ''
      ]
      if (compareData) {
        const rc = compareData.returnsByYear[y]
        const startC = runningScenarioStartCsv
        const returnsC = ensure(compareData.retTotals[y])
        const incC = ensure(compareData.contrib[y]) + ensure(compareData.ss[y]) + ensure(compareData.perYear[y]?.rentNet)
        const expC = ensure(compareData.spend[y]) + ensure(compareData.perYear[y]?.mortgage) + ensure(compareData.perYear[y]?.reCarry) + ensure(compareData.extraExp[y])
        const endC = startC + returnsC + incC - expC
        runningScenarioStartCsv = endC
        row.push(
          Math.round(startC),
          Math.round(returnsC),
          Math.round(incC),
          Math.round(expC),
          Math.round(endC)
        )
      }
      rows.push(row)
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
            {compareData && (
              <>
                <th>Start (Scenario)</th>
                <th>Returns (Scenario)</th>
                <th>Income (Scenario)</th>
                <th>Expenditures (Scenario)</th>
                <th>End (Scenario)</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {(() => {
            let runningBaseStart = ensure(base.startBal[0])
            let runningScenarioStart = compareData ? ensure(compareData.startBal[0]) : 0
            return Array.from({ length: years }).map((_, y) => {
              const yearLabel = startYear != null ? String(startYear + y) : String(y)
              const r = base.returnsByYear[y]
              const startBase = runningBaseStart
              const retTotal = ensure(base.retTotals[y])
              const incTotal = ensure(base.contrib[y]) + ensure(base.ss[y]) + ensure(base.perYear[y].rentNet)
              const expTotal = ensure(base.spend[y]) + ensure(base.perYear[y].mortgage) + ensure(base.perYear[y].reCarry) + ensure(base.extraExp[y])
              const endCalc = startBase + retTotal + incTotal - expTotal
              runningBaseStart = endCalc
              const isRetStart = base.retYearIdx != null && y === base.retYearIdx
              const isRetired = base.retYearIdx != null && y >= (base.retYearIdx as number)
              let compRow: { start: number; returns: number; income: number; exp: number; end: number; breakdown: typeof base.returnsByYear[number] } | null = null
              if (compareData) {
                const startScenario = runningScenarioStart
                const returnsVal = ensure(compareData.retTotals[y])
                const incomeVal = ensure(compareData.contrib[y]) + ensure(compareData.ss[y]) + ensure(compareData.perYear[y]?.rentNet)
                const expVal = ensure(compareData.spend[y]) + ensure(compareData.perYear[y]?.mortgage) + ensure(compareData.perYear[y]?.reCarry) + ensure(compareData.extraExp[y])
                const endScenario = startScenario + returnsVal + incomeVal - expVal
                runningScenarioStart = endScenario
                compRow = {
                  start: startScenario,
                  returns: returnsVal,
                  income: incomeVal,
                  exp: expVal,
                  end: endScenario,
                  breakdown: compareData.returnsByYear[y]
                }
              }
            return (
              <tr key={y} style={isRetired ? { background: isRetStart ? '#FFF7ED' : '#F0FDF4' } : undefined}>
                <td style={{ verticalAlign: 'top' }}>
                  <div>{yearLabel}</div>
                  {isRetStart && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        padding: '2px 6px',
                        fontSize: 11,
                        color: '#B45309',
                        border: '1px solid #F59E0B',
                        borderRadius: 10,
                        whiteSpace: 'nowrap',
                        background: '#FFFBEB'
                      }}>
                        Retirement starts
                      </span>
                    </div>
                  )}
                  {!isRetStart && isRetired && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        padding: '2px 6px',
                        fontSize: 11,
                        color: '#166534',
                        border: '1px solid #22C55E',
                        borderRadius: 10,
                        whiteSpace: 'nowrap',
                        background: '#DCFCE7'
                      }}>
                        Retired
                      </span>
                    </div>
                  )}
                </td>
                <td style={{ verticalAlign: 'top' }}>{fmt(startBase)}</td>
                <td style={{ verticalAlign: 'top' }}>
                  <div style={{ color: '#14532D' }}>{fmt(retTotal)}</div>
                  <div style={{ color: '#166534', fontSize: 12 }}>
                    <div>US {fmt(r.byClass.US_STOCK||0)}</div>
                    <div>Intl {fmt(r.byClass.INTL_STOCK||0)}</div>
                    <div>Bonds {fmt(r.byClass.BONDS||0)}</div>
                    <div>RE {fmt(r.byClass.REAL_ESTATE||0)}</div>
                  </div>
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  <div style={{ color: '#166534' }}>{fmt(incTotal)}</div>
                  <div style={{ color: '#166534', fontSize: 12 }}>
                    <div>Contrib {fmt(base.contrib[y] || 0)}</div>
                    <div>SS {fmt(base.ss[y] || 0)}</div>
                    <div>Rent {fmt(base.perYear[y]?.rentNet || 0)}</div>
                  </div>
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  <div style={{ color: '#B91C1C' }}>{fmt(expTotal)}</div>
                  <div style={{ color: '#991B1B', fontSize: 12 }}>
                    <div>Spend {fmt(base.spend[y] || 0)}</div>
                    <div>Mortgage {fmt(base.perYear[y]?.mortgage || 0)}</div>
                    <div>RE Costs {fmt(base.perYear[y]?.reCarry || 0)}</div>
                    <div>Extra {fmt(base.extraExp[y] || 0)}</div>
                  </div>
                </td>
                <td style={{ verticalAlign: 'top' }}>{fmt(endCalc)}</td>
                {compRow && (
                  <>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>{fmt(compRow.start)}</td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>
                      <div style={{ color: '#14532D' }}>{fmt(compRow.returns)}</div>
                      <div style={{ color: '#166534', fontSize: 12 }}>
                        <div>US {fmt(compRow.breakdown.byClass.US_STOCK || 0)}</div>
                        <div>Intl {fmt(compRow.breakdown.byClass.INTL_STOCK || 0)}</div>
                        <div>Bonds {fmt(compRow.breakdown.byClass.BONDS || 0)}</div>
                        <div>RE {fmt(compRow.breakdown.byClass.REAL_ESTATE || 0)}</div>
                      </div>
                    </td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>
                      <div style={{ color: '#166534' }}>{fmt(compRow.income)}</div>
                      <div style={{ color: '#166534', fontSize: 12 }}>
                        <div>Contrib {fmt(compareData!.contrib[y] || 0)}</div>
                        <div>SS {fmt(compareData!.ss[y] || 0)}</div>
                        <div>Rent {fmt(compareData!.perYear[y]?.rentNet || 0)}</div>
                      </div>
                    </td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>
                      <div style={{ color: '#B91C1C' }}>{fmt(compRow.exp)}</div>
                      <div style={{ color: '#991B1B', fontSize: 12 }}>
                        <div>Spend {fmt(compareData!.spend[y] || 0)}</div>
                        <div>Mortgage {fmt(compareData!.perYear[y]?.mortgage || 0)}</div>
                        <div>RE Costs {fmt(compareData!.perYear[y]?.reCarry || 0)}</div>
                        <div>Extra {fmt(compareData!.extraExp[y] || 0)}</div>
                      </div>
                    </td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>{fmt(compRow.end)}</td>
                  </>
                )}
              </tr>
            )
            })
          })()}
        </tbody>
      </table>
    </div>
  )
}
