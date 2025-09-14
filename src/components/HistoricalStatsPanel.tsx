import React, { useMemo } from 'react'
import type { HistoricalDataset, HistoricalMonthRow } from '@types/historical'
import { Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, Box } from '@mui/material'

function mean(arr: number[]) { return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0 }
function std(arr: number[], m?: number) {
  const mu = m ?? mean(arr)
  if (arr.length <= 1) return 0
  const v = arr.reduce((s,x)=>s + (x-mu)*(x-mu), 0) / (arr.length - 1)
  return Math.sqrt(v)
}
function corrAligned(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length)
  if (n <= 1) return NaN
  const mx = mean(x), my = mean(y)
  let num = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my
    num += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  return (vx > 0 && vy > 0) ? (num / Math.sqrt(vx * vy)) : NaN
}

export const HistoricalStatsPanel: React.FC<{ dataset: HistoricalDataset }> = ({ dataset }) => {
  const rows = useMemo(() => dataset.rows.slice().sort((a,b)=> a.year===b.year? a.month-b.month : a.year-b.year), [dataset])
  const keys = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) for (const k of Object.keys(r.returns||{})) s.add(k)
    return Array.from(s)
  }, [rows])

  // Build yearly compounded returns per key; require full 12 months per year
  const years = useMemo(() => Array.from(new Set(rows.map(r=>r.year))).sort((a,b)=>a-b), [rows])
  const grouped = useMemo(() => {
    const m = new Map<number, HistoricalMonthRow[]>()
    for (const y of years) m.set(y, [])
    for (const r of rows) m.get(r.year)!.push(r)
    return m
  }, [rows, years])

  const yearlyByKey = useMemo(() => {
    const by: Record<string, { years: number[]; values: number[] }> = {}
    keys.forEach(k => by[k] = { years: [], values: [] })
    for (const y of years) {
      const group = grouped.get(y)!
      if (!group || group.length < 12) continue
      for (const k of keys) {
        let acc = 1
        for (const m of group) {
          const rr = (m.returns as any)[k]
          const r = typeof rr === 'number' ? rr : 0
          acc *= (1 + r)
        }
        by[k].years.push(y)
        by[k].values.push(acc - 1)
      }
    }
    return by
  }, [grouped, years, keys])

  const stats = useMemo(() => keys.map(k => {
    const vals = yearlyByKey[k].values
    const n = vals.length
    const m = mean(vals)
    const s = std(vals, m)
    return { key: k, n, muY: m, sigmaY: s }
  }), [yearlyByKey, keys])

  // Correlation computed across overlapping yearly observations
  const corrs = useMemo(() => {
    const table: Record<string, Record<string, number>> = {}
    for (const i of keys) {
      table[i] = {}
      for (const j of keys) {
        const yi = yearlyByKey[i]
        const yj = yearlyByKey[j]
        // align by year
        const mapJ = new Map<number, number>()
        for (let idx = 0; idx < yj.years.length; idx++) mapJ.set(yj.years[idx], yj.values[idx])
        const xi: number[] = []
        const xj: number[] = []
        for (let idx = 0; idx < yi.years.length; idx++) {
          const yr = yi.years[idx]
          const vj = mapJ.get(yr)
          if (vj != null) { xi.push(yi.values[idx]); xj.push(vj) }
        }
        table[i][j] = corrAligned(xi, xj)
      }
    }
    return table
  }, [yearlyByKey, keys])

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Sanity Stats</Typography>
        <Typography color="text.secondary" sx={{ mb: 1 }}>Yearly returns (compounded per calendar year).</Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 520 }}>
            <TableHead>
              <TableRow>
                <TableCell>Asset</TableCell>
                <TableCell align="right">Years (N)</TableCell>
                <TableCell align="right">Mean (yr)</TableCell>
                <TableCell align="right">Vol (yr)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stats.map(s => (
                <TableRow key={s.key} hover>
                  <TableCell>{s.key}</TableCell>
                  <TableCell align="right">{s.n}</TableCell>
                  <TableCell align="right">{(s.muY*100).toFixed(2)}%</TableCell>
                  <TableCell align="right">{(s.sigmaY*100).toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="subtitle1" sx={{ mt: 2 }} gutterBottom>Correlation (yearly)</Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow>
                <TableCell>Asset</TableCell>
                {keys.map(k => <TableCell key={k} align="right">{k}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map(i => (
                <TableRow key={i} hover>
                  <TableCell>{i}</TableCell>
                  {keys.map(j => (
                    <TableCell key={j} align="right">{isFinite(corrs[i][j]) ? corrs[i][j].toFixed(2) : '-'}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  )
}
