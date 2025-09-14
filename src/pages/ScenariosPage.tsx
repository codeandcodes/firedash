import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@state/AppContext'
import { Card, CardContent, Typography, Stack, Button, Chip, TextField, Grid } from '@mui/material'
import { simulateDeterministicSeries } from '@engine/sim'
import { StackedPrincipal } from '@components/charts/StackedPrincipal'
import { scenariosKey, loadCache, saveCache } from '@state/cache'

type ResultMap = Record<string, { monthly: number; success: number }>

export function ScenariosPage() {
  const { snapshot, simOptions } = useApp()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string>('')
  const [results, setResults] = useState<ResultMap | null>(null)
  const [charts, setCharts] = useState<Record<string, { total: number[]; principal: number[] }> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const [t50, setT50] = useState(50)
  const [t75, setT75] = useState(75)
  const [t90, setT90] = useState(90)
  const [pathsPerEval, setPathsPerEval] = useState(400)

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null }, [])

  function run() {
    if (!snapshot) return
    setRunning(true)
    setResults(null)
    setProgress('Starting…')
    // pool: one worker per target
    const targetDefs = [
      { label: `Optimistic (${t50}%)`, success: t50/100 },
      { label: `Realistic (${t75}%)`, success: t75/100 },
      { label: `Conservative (${t90}%)`, success: t90/100 }
    ]
    const baseSpend = snapshot.retirement?.expected_spend_monthly || 0
    const total = snapshot.accounts?.reduce((s,a:any)=> s + (a.balance||0), 0) || 0
    const years = simOptions.years
    const baseGuess = baseSpend > 0 ? baseSpend : Math.max(total * 0.04 / 12, total / (years * 12))
    const lo = Math.max(0, baseGuess / 4)
    const hi = Math.max(1000, baseGuess * 4)

    const tmpResults: ResultMap = {}
    let completed = 0
    for (const tgt of targetDefs) {
      const w = new Worker(new URL('../workers/spendWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<any>) => {
        const msg = e.data
        if (msg.type === 'iter') {
          setProgress(`${msg.label}: iter ${msg.iter} p=${(msg.p*100).toFixed(0)}% $${Math.round(msg.mid).toLocaleString()}/mo`)
        } else if (msg.type === 'done') {
          const r = msg.result as { label: string; monthly: number; success: number }
          tmpResults[r.label] = { monthly: r.monthly, success: r.success }
          completed++
          if (completed === targetDefs.length) {
            setResults(tmpResults)
            // save cache
            const key = scenariosKey(snapshot, {
              years: simOptions.years,
              inflation: simOptions.inflation,
              rebalFreq: simOptions.rebalFreq,
              mcMode: simOptions.mcMode,
              bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
              bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
            }, targetDefs, pathsPerEval)
            saveCache(key, tmpResults)
            setRunning(false)
            setProgress('')
            // Build charts deterministically for each result
            const c: Record<string, { total: number[]; principal: number[] }> = {}
            for (const [label, r] of Object.entries(tmpResults)) {
              const snap = { ...snapshot, retirement: { ...snapshot.retirement, expected_spend_monthly: r.monthly } }
              const det = simulateDeterministicSeries(snap as any, { years: simOptions.years, inflation: simOptions.inflation, rebalFreq: simOptions.rebalFreq })
              c[label] = { total: det.total, principal: det.principalRemaining }
            }
            setCharts(c)
          }
          w.terminate()
        } else if (msg.type === 'error') {
          console.error('Spend worker error', msg.error)
          completed++
          if (completed === targetDefs.length) {
            setRunning(false)
            setProgress('Error')
          }
          w.terminate()
        }
      }
      w.postMessage({
        snapshot,
        options: {
          years: simOptions.years,
          inflation: simOptions.inflation,
          rebalFreq: simOptions.rebalFreq,
          mcMode: simOptions.mcMode,
          bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
          bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
        },
        target: tgt,
        pathsPerEval,
        maxIter: 12,
        lowerBoundMonthly: lo,
        upperBoundMonthly: hi
      })
    }
  }

  // Load from cache if available when inputs change
  useEffect(() => {
    if (!snapshot) { setResults(null); return }
    const key = scenariosKey(snapshot, {
      years: simOptions.years,
      inflation: simOptions.inflation,
      rebalFreq: simOptions.rebalFreq,
      mcMode: simOptions.mcMode,
      bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
      bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
    }, [
      { label: `Optimistic (${t50}%)`, success: t50/100 },
      { label: `Realistic (${t75}%)`, success: t75/100 },
      { label: `Conservative (${t90}%)`, success: t90/100 }
    ], pathsPerEval)
    const cached = loadCache<ResultMap>(key)
    if (cached) setResults(cached)
  }, [snapshot, simOptions, t50, t75, t90, pathsPerEval])

  return (
    <section>
      <h1>Scenarios</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Suggested Monthly Drawdown</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>Computes monthly withdrawals for optimistic, realistic, and conservative success targets.</Typography>
              <Grid container spacing={2} sx={{ mb: 1 }}>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth type="number" label="Optimistic %" value={t50} onChange={(e)=>setT50(Number(e.target.value)||0)} />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth type="number" label="Realistic %" value={t75} onChange={(e)=>setT75(Number(e.target.value)||0)} />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth type="number" label="Conservative %" value={t90} onChange={(e)=>setT90(Number(e.target.value)||0)} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField fullWidth type="number" label="Paths per eval" value={pathsPerEval} onChange={(e)=>setPathsPerEval(Math.max(50, Number(e.target.value)||0))} />
                </Grid>
              </Grid>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button variant="contained" onClick={run} disabled={running}>Compute</Button>
                {running && <Typography color="text.secondary">{progress}</Typography>}
              </Stack>
            </CardContent>
          </Card>
      {results && (
        <div className="cards">
          {Object.entries(results).map(([label, r]) => (
            <div className="card" key={label}>
              <div className="card-title">{label}</div>
              <div className="card-metric">${r.monthly.toLocaleString()}/mo</div>
              <div style={{ color: '#9aa4b2', fontSize: 12 }}>Success ~ {(r.success*100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      )}
      {charts && (
        <>
          {Object.entries(charts).map(([label, s]) => (
            <Card key={label} sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>{label} – Balance and Principal</Typography>
                <StackedPrincipal total={s.total} principal={s.principal} title={label}
                                  startYear={snapshot ? new Date(snapshot.timestamp).getFullYear() : undefined}
                                  retAt={(() => {
                                    if (!snapshot) return undefined as any
                                    const start = new Date(snapshot.timestamp)
                                    if (snapshot.retirement?.target_date) {
                                      const rd = new Date(snapshot.retirement.target_date)
                                      return Math.max(0, (rd.getFullYear() - start.getFullYear()) * 12 + (rd.getMonth() - start.getMonth()))
                                    }
                                    if (snapshot.retirement?.target_age != null && snapshot.person?.current_age != null) {
                                      return Math.round(Math.max(0, snapshot.retirement.target_age - snapshot.person.current_age) * 12)
                                    }
                                    return undefined as any
                                  })()}
                                  xLabel="Year" yLabel="Balance ($)" />
              </CardContent>
            </Card>
          ))}
        </>
      )}
        </>
      )}
    </section>
  )
}
