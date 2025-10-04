import React, { useMemo, useState } from 'react'
import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'
import { scenariosKey, loadCache, saveCache } from '@state/cache'
import { Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material'

type ScenarioResult = Record<string, { monthly: number; success: number }>

interface SpendScenariosPanelProps {
  snapshot: Snapshot
  simOptions: SimOptions
  startYear?: number
  retAt?: number
}

export const SpendScenariosPanel: React.FC<SpendScenariosPanelProps> = ({ snapshot, simOptions, startYear, retAt }) => {
  const [t50, setT50] = useState(50)
  const [t75, setT75] = useState(75)
  const [t90, setT90] = useState(90)
  const [pathsPerEval, setPathsPerEval] = useState(400)
  const [scRunning, setScRunning] = useState(false)
  const [scProgress, setScProgress] = useState('')
  const [scResults, setScResults] = useState<ScenarioResult | null>(null)
  const years = simOptions.years
  const baseOpts: SimOptions = useMemo(() => ({
    years: simOptions.years,
    inflation: simOptions.inflation,
    rebalFreq: simOptions.rebalFreq,
    bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
    bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
  }), [simOptions])

  function runScenarios() {
    if (!snapshot) return
    setScRunning(true)
    setScResults(null)
    setScProgress('Starting…')

    const targets = [
      { label: `Optimistic (${t50}%)`, success: t50 / 100 },
      { label: `Realistic (${t75}%)`, success: t75 / 100 },
      { label: `Conservative (${t90}%)`, success: t90 / 100 }
    ]

    const scKey = scenariosKey(snapshot, baseOpts, targets, pathsPerEval)
    const cached = loadCache<ScenarioResult>(scKey)
    if (cached) {
      setScResults(cached)
      setScRunning(false)
      setScProgress('')
      return
    }

    const baseSpend = snapshot.retirement?.expected_spend_monthly || 0
    const totalBal = snapshot.accounts?.reduce((s, a) => s + (a.holdings || []).reduce((h, lot) => h + lot.units * lot.price, 0) + (a.cash_balance || 0), 0) || 0
    const yearsCount = simOptions.years
    const baseGuess = baseSpend > 0 ? baseSpend : Math.max(totalBal * 0.04 / 12, totalBal / (yearsCount * 12))
    const lo = Math.max(0, baseGuess / 4)
    const hi = Math.max(1000, baseGuess * 4)

    const tmp: ScenarioResult = {}
    let done = 0
    for (const tgt of targets) {
      const w = new Worker(new URL('../workers/spendWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<any>) => {
        const msg = e.data
        if (msg.type === 'iter') {
          setScProgress(`${msg.label}: iter ${msg.iter} p=${(msg.p * 100).toFixed(0)}% $${Math.round(msg.mid).toLocaleString()}/mo`)
        } else if (msg.type === 'done') {
          const r = msg.result as { label: string; monthly: number; success: number }
          tmp[r.label] = { monthly: r.monthly, success: r.success }
          done += 1
          if (done === targets.length) {
            setScResults(tmp)
            try { saveCache(scKey, tmp) } catch {}
            setScRunning(false)
            setScProgress('')
          }
          w.terminate()
        } else if (msg.type === 'error') {
          console.error('Spend worker error', msg.error)
          done += 1
          if (done === targets.length) {
            setScRunning(false)
            setScProgress('Error')
          }
          w.terminate()
        }
      }
      w.postMessage({
        snapshot,
        options: baseOpts,
        target: tgt,
        pathsPerEval,
        maxIter: 12,
        lowerBoundMonthly: lo,
        upperBoundMonthly: hi
      })
    }
  }

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">Spend Scenarios</Typography>
          <Chip label="Monthly spend at success targets" size="small" />
        </Stack>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Optimistic %" value={t50} onChange={(e) => setT50(Number(e.target.value) || 0)} /></Grid>
          <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Realistic %" value={t75} onChange={(e) => setT75(Number(e.target.value) || 0)} /></Grid>
          <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Conservative %" value={t90} onChange={(e) => setT90(Number(e.target.value) || 0)} /></Grid>
          <Grid item xs={12} md={3}><TextField fullWidth type="number" label="Paths per eval" value={pathsPerEval} onChange={(e) => setPathsPerEval(Math.max(50, Number(e.target.value) || 0))} /></Grid>
          <Grid item xs={12} md={3}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button variant="contained" onClick={runScenarios} disabled={scRunning}>Compute</Button>
              {scRunning && <Typography color="text.secondary">{scProgress}</Typography>}
            </Stack>
          </Grid>
        </Grid>

        {scResults && (
          <div className="cards" style={{ marginTop: 12 }}>
            {Object.entries(scResults).map(([label, r]) => (
              <div className="card" key={label}>
                <div className="card-title">{label}</div>
                <div className="card-metric">${r.monthly.toLocaleString()}/mo</div>
                <div style={{ color: '#9aa4b2', fontSize: 12 }}>Success ~ {(r.success * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        )}

      </CardContent>
    </Card>
  )
}

/*
SpendScenariosPanel – worker-driven spend solver used on Results advanced panel.
- Computes monthly spend targets for desired success probabilities and caches results.
*/
