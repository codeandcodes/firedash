/**
 * Real Estate page
 * - Lists properties and shows an amortization panel per property: payoff summary, sparkline, and yearly schedule.
 */
import { useApp } from '@state/AppContext'
import { amortizationSchedule } from '@engine/mortgage'
import { Card, CardContent, Collapse, IconButton } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import React from 'react'

export function RealEstatePage() {
  const { snapshot } = useApp()
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  return (
    <section>
      <h1>Real Estate</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Value</th>
                <th>Mortgage</th>
                <th>APR</th>
                <th>Payment (mo)</th>
                <th>Amortization</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot.real_estate || []).map((re) => {
                const bal = re.mortgage_balance || 0
                const rate = re.rate || 0
                const pmt = re.payment || 0
                const sched = amortizationSchedule(bal, rate, pmt, 1200)
                const paidMonths = sched.paidOffAtMonth
                const start = new Date(snapshot.timestamp)
                const payoffDate = paidMonths ? new Date(start.getFullYear(), start.getMonth() + paidMonths, 1) : undefined
                return (
                  <React.Fragment key={re.id}>
                    <tr>
                      <td>{re.id}</td>
                      <td>${(re.value || 0).toLocaleString()}</td>
                      <td>${bal.toLocaleString()}</td>
                      <td>{(rate * 100).toFixed(2)}%</td>
                      <td>${pmt.toLocaleString()}</td>
                      <td>
                        <IconButton size="small" onClick={() => setOpen((m) => ({ ...m, [re.id]: !m[re.id] }))}>
                          <ExpandMoreIcon />
                        </IconButton>
                        {paidMonths ? `paid in ~${Math.ceil(paidMonths/12)}y (${payoffDate?.getFullYear()})` : (bal > 0 && pmt > 0 ? (sched.negativeAmortization ? 'no payoff (payment too low)' : 'no payoff within horizon') : 'n/a')}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={6}>
                        <Collapse in={!!open[re.id]}>
                          <Card variant="outlined" sx={{ mb: 1 }}>
                            <CardContent>
                              {(() => {
                                const ms = sched.months
                                const W = 480, H = 120, pad = 30
                                const n = ms.length
                                const maxB = Math.max(1, ...ms.map(m => m.balance))
                                const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad*2)
                                const y = (v: number) => pad + (H - pad*2) - (v / maxB) * (H - pad*2)
                                const path = ms.map((m, i) => `${i===0?'M':'L'} ${x(i)} ${y(m.balance)}`).join(' ')
                                return (
                                  <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ marginBottom: 8 }}>
                                    <rect x={0} y={0} width={W} height={H} fill="#101626" rx={8} />
                                    <path d={path} stroke="#7aa2f7" strokeWidth={2} fill="none" />
                                    <text x={W/2} y={16} fill="#c8d3e6" textAnchor="middle" fontSize={12}>Mortgage Balance Over Time</text>
                                  </svg>
                                )
                              })()}
                              <h3>Amortization Schedule (yearly)</h3>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Year</th>
                                    <th>Interest Paid</th>
                                    <th>Principal Paid</th>
                                    <th>Ending Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    const years = 50
                                    const rows: { y: number; interest: number; principal: number; bal: number }[] = []
                                    const months = sched.months
                                    for (let y = 0; y < years; y++) {
                                      const ms = y*12, me = Math.min(months.length - 1, (y+1)*12 - 1)
                                      if (ms >= months.length) break
                                      let iSum = 0, pSum = 0
                                      for (let m = ms; m <= me; m++) { iSum += months[m].interest; pSum += months[m].principal }
                                      const balEnd = months[Math.min(me, months.length - 1)].balance
                                      rows.push({ y, interest: iSum, principal: pSum, bal: balEnd })
                                      if (balEnd <= 0) break
                                    }
                                    return rows.map(r => (
                                      <tr key={r.y}>
                                        <td>{start.getFullYear() + r.y}</td>
                                        <td>${Math.round(r.interest).toLocaleString()}</td>
                                        <td>${Math.round(r.principal).toLocaleString()}</td>
                                        <td>${Math.round(r.bal).toLocaleString()}</td>
                                      </tr>
                                    ))
                                  })()}
                                </tbody>
                              </table>
                            </CardContent>
                          </Card>
                        </Collapse>
                      </td>
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
