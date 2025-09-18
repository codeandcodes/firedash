/**
 * YearlyBalanceSheet
 * - Computes per-year Start, Returns, Income, Expenditures, End using selected percentile year-end balances.
 * - Avoids double-counting property flows by tagging and excluding from Extra.
 * - Adds retirement badges/row highlighting and CSV export (includes Alive_Frac if provided).
 */
import React from 'react'
import type { YearlyBreakdownData } from '../utils/calculations'

export const YearlyBalanceSheet: React.FC<{
  breakdown: YearlyBreakdownData[]
  aliveFrac?: number[]
  comparisonBreakdown?: YearlyBreakdownData[]
}> = ({ breakdown, aliveFrac, comparisonBreakdown }) => {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  function downloadCsv() {
    const header = ['Year','Start','Returns','Income','Expenditures','End','Contrib','SS','RentNet','Spend','Mortgage','RE_Costs','Extra','Ret_US','Ret_Intl','Ret_Bonds','Ret_RE','Alive_Frac']
    if (comparisonBreakdown) {
      header.push('Start_Scenario','Returns_Scenario','Income_Scenario','Expenditures_Scenario','End_Scenario')
    }
    const rows = [header] as (string|number)[][]
    for (let i = 0; i < breakdown.length; i++) {
      const base = breakdown[i]
      const r = base.returns.byClass
      const row: (string|number)[] = [
        base.year,
        Math.round(base.startBalance),
        Math.round(base.returns.total),
        Math.round(base.income.total),
        Math.round(base.expenditures.total),
        Math.round(base.endBalance),
        Math.round(base.income.contributions),
        Math.round(base.income.socialSecurity),
        Math.round(base.income.rental),
        Math.round(base.expenditures.spending),
        Math.round(base.expenditures.mortgage),
        Math.round(base.expenditures.realEstateCosts),
        Math.round(base.expenditures.extra),
        Math.round(r.US_STOCK || 0),
        Math.round(r.INTL_STOCK || 0),
        Math.round(r.BONDS || 0),
        Math.round(r.REAL_ESTATE || 0),
        aliveFrac && aliveFrac[i] != null ? Number(aliveFrac[i].toFixed(3)) : ''
      ]
      if (comparisonBreakdown) {
        const comp = comparisonBreakdown[i]
        row.push(
          Math.round(comp.startBalance),
          Math.round(comp.returns.total),
          Math.round(comp.income.total),
          Math.round(comp.expenditures.total),
          Math.round(comp.endBalance)
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
            {comparisonBreakdown && (
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
          {breakdown.map((row, i) => {
            const compRow = comparisonBreakdown ? comparisonBreakdown[i] : null
            return (
              <tr key={i} style={row.isRetired ? { background: row.isRetirementStart ? '#FFF7ED' : '#F0FDF4' } : undefined}>
                <td style={{ verticalAlign: 'top' }}>
                  <div>{row.year}</div>
                  {row.isRetirementStart && (
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
                  {!row.isRetirementStart && row.isRetired && (
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
                <td style={{ verticalAlign: 'top' }}>{fmt(row.startBalance)}</td>
                <td style={{ verticalAlign: 'top' }}>
                  <div style={{ color: '#14532D' }}>{fmt(row.returns.total)}</div>
                  <div style={{ color: '#166534', fontSize: 12 }}>
                    <div>US {fmt(row.returns.byClass.US_STOCK || 0)}</div>
                    <div>Intl {fmt(row.returns.byClass.INTL_STOCK || 0)}</div>
                    <div>Bonds {fmt(row.returns.byClass.BONDS || 0)}</div>
                    <div>RE {fmt(row.returns.byClass.REAL_ESTATE || 0)}</div>
                  </div>
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  <div style={{ color: '#166534' }}>{fmt(row.income.total)}</div>
                  <div style={{ color: '#166534', fontSize: 12 }}>
                    <div>Contrib {fmt(row.income.contributions)}</div>
                    <div>SS {fmt(row.income.socialSecurity)}</div>
                    <div>Rent {fmt(row.income.rental)}</div>
                  </div>
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  <div style={{ color: '#B91C1C' }}>{fmt(row.expenditures.total)}</div>
                  <div style={{ color: '#991B1B', fontSize: 12 }}>
                    <div>Spend {fmt(row.expenditures.spending)}</div>
                    <div>Mortgage {fmt(row.expenditures.mortgage)}</div>
                    <div>RE Costs {fmt(row.expenditures.realEstateCosts)}</div>
                    <div>Extra {fmt(row.expenditures.extra)}</div>
                  </div>
                </td>
                <td style={{ verticalAlign: 'top' }}>{fmt(row.endBalance)}</td>
                {compRow && (
                  <>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>{fmt(compRow.startBalance)}</td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>
                      <div style={{ color: '#14532D' }}>{fmt(compRow.returns.total)}</div>
                      <div style={{ color: '#166534', fontSize: 12 }}>
                        <div>US {fmt(compRow.returns.byClass.US_STOCK || 0)}</div>
                        <div>Intl {fmt(compRow.returns.byClass.INTL_STOCK || 0)}</div>
                        <div>Bonds {fmt(compRow.returns.byClass.BONDS || 0)}</div>
                        <div>RE {fmt(compRow.returns.byClass.REAL_ESTATE || 0)}</div>
                      </div>
                    </td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>
                      <div style={{ color: '#166534' }}>{fmt(compRow.income.total)}</div>
                      <div style={{ color: '#166534', fontSize: 12 }}>
                        <div>Contrib {fmt(compRow.income.contributions)}</div>
                        <div>SS {fmt(compRow.income.socialSecurity)}</div>
                        <div>Rent {fmt(compRow.income.rental)}</div>
                      </div>
                    </td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>
                      <div style={{ color: '#B91C1C' }}>{fmt(compRow.expenditures.total)}</div>
                      <div style={{ color: '#991B1B', fontSize: 12 }}>
                        <div>Spend {fmt(compRow.expenditures.spending)}</div>
                        <div>Mortgage {fmt(compRow.expenditures.mortgage)}</div>
                        <div>RE Costs {fmt(compRow.expenditures.realEstateCosts)}</div>
                        <div>Extra {fmt(compRow.expenditures.extra)}</div>
                      </div>
                    </td>
                    <td style={{ background: '#EFF6FF', verticalAlign: 'top' }}>{fmt(compRow.endBalance)}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
