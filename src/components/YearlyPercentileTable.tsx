import React, { useMemo } from 'react'

export const YearlyPercentileTable: React.FC<{ months: number; p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[]; startYear?: number; highlightYear?: number }>
  = ({ months, p10, p25, p50, p75, p90, startYear, highlightYear }) => {
  const years = Math.max(1, Math.floor(months / 12))
  const rows = useMemo(() => {
    const r: { year: number; p10: number; p25: number; p50: number; p75: number; p90: number }[] = []
    for (let y = 1; y <= years; y++) {
      const idx = Math.min(months - 1, y * 12 - 1)
      r.push({ year: startYear ? startYear + y - 1 : y, p10: p10[idx], p25: p25[idx], p50: p50[idx], p75: p75[idx], p90: p90[idx] })
    }
    return r
  }, [months, years, p10, p25, p50, p75, p90])

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  return (
    <table className="table" style={{ marginTop: 12 }}>
      <thead>
        <tr>
          <th>Year</th>
          <th>P10</th>
          <th>P25</th>
          <th>Median</th>
          <th>P75</th>
          <th>P90</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.year} style={{ background: highlightYear && r.year === highlightYear ? '#1a2340' : undefined }}>
            <td>{r.year}</td>
            <td>{fmt(r.p10)}</td>
            <td>{fmt(r.p25)}</td>
            <td>{fmt(r.p50)}</td>
            <td>{fmt(r.p75)}</td>
            <td>{fmt(r.p90)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
