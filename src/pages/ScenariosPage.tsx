import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '@state/AppContext'
import { Card, CardContent, Typography, Stack, Button, Chip, TextField, Grid } from '@mui/material'
import { scenariosKey, loadCache, saveCache } from '@state/cache'

type ResultMap = Record<string, { monthly: number; success: number }>

export function ScenariosPage() {
  const { snapshot, simOptions } = useApp()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string>('')
  const [results, setResults] = useState<ResultMap | null>(null)
  const [t50, setT50] = useState(50)
  const [t75, setT75] = useState(75)
  const [t90, setT90] = useState(90)
  const [pathsPerEval, setPathsPerEval] = useState(400)

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
              bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
              bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
            }, targetDefs, pathsPerEval)
            saveCache(key, tmpResults)
            setRunning(false)
            setProgress('')
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
        </>
      )}
    </section>
  )
}
