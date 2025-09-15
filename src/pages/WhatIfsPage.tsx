/**
 * What‑Ifs page (unified Sensitivity + Scenarios)
 * - Baseline vs Variant comparison (inflation, spend, retirement age).
 * - Spend search for Optimistic/Realistic/Conservative targets with worker parallelism and caching.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@state/AppContext'
import type { Snapshot } from '@types/schema'
import type { MonteSummary, SimOptions } from '@types/engine'
import { resultsKey, saveCache, loadCache, scenariosKey } from '@state/cache'
import { MultiLineChart } from '@components/charts/MultiLineChart'
import { StackedPrincipal } from '@components/charts/StackedPrincipal'
import { simulateDeterministicSeries } from '@engine/sim'
import { Box, Button, Card, CardContent, Chip, Grid, Stack, Switch, TextField, Typography } from '@mui/material'

type VariantSeries = { summary: MonteSummary; p50: number[] }
type ScenarioResult = Record<string, { monthly: number; success: number }>

export function WhatIfsPage() {
  const { snapshot, simOptions } = useApp()
  const [inflation, setInflation] = useState<number>(simOptions.inflation)
  const [spend, setSpend] = useState<number>(snapshot?.retirement.expected_spend_monthly || 0)
  const baseAge = snapshot?.retirement.target_age ?? (snapshot?.person?.current_age != null ? snapshot.person.current_age + 25 : 60)
  const [retAge, setRetAge] = useState<number>(baseAge as number)
  const [applyVariantToScenarios, setApplyVariantToScenarios] = useState(true)

  const [baseline, setBaseline] = useState<VariantSeries | null>(null)
  const [variant, setVariant] = useState<VariantSeries | null>(null)
  const [loading, setLoading] = useState(false)
  const simWorkerRef = useRef<Worker | null>(null)

  // scenario state
  const [t50, setT50] = useState(50)
  const [t75, setT75] = useState(75)
  const [t90, setT90] = useState(90)
  const [pathsPerEval, setPathsPerEval] = useState(400)
  const [scRunning, setScRunning] = useState(false)
  const [scProgress, setScProgress] = useState('')
  const [scResults, setScResults] = useState<ScenarioResult | null>(null)
  const [scCharts, setScCharts] = useState<Record<string, { total: number[]; principal: number[] }> | null>(null)

  const months = useMemo(() => (simOptions.years * 12), [simOptions.years])
  const startYear = useMemo(() => snapshot ? new Date(snapshot.timestamp).getFullYear() : undefined, [snapshot])
  const retAt = useMemo(() => {
    if (!snapshot) return undefined
    const start = new Date(snapshot.timestamp)
    if (snapshot.retirement?.target_date) {
      const rd = new Date(snapshot.retirement.target_date)
      return Math.max(0, (rd.getFullYear() - start.getFullYear()) * 12 + (rd.getMonth() - start.getMonth()))
    }
    if (snapshot.retirement?.target_age != null && snapshot.person?.current_age != null) {
      return Math.round(Math.max(0, snapshot.retirement.target_age - snapshot.person.current_age) * 12)
    }
    return undefined
  }, [snapshot])

  // worker bootstrap
  useEffect(() => {
    if (!simWorkerRef.current) {
      simWorkerRef.current = new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' })
      simWorkerRef.current.onmessage = (e: MessageEvent<any>) => {
        const d = e.data
        if (!d || d.ok === false) { setLoading(false); return }
        setVariant({ summary: d.summary as MonteSummary, p50: d.series.mc.p50 as number[] })
        setLoading(false)
      }
    }
    return () => { /* keep worker */ }
  }, [])

  // baseline load from cache or compute
  useEffect(() => {
    if (!snapshot) { setBaseline(null); return }
    const key = resultsKey(snapshot, {
      paths: simOptions.paths,
      years: simOptions.years,
      inflation: simOptions.inflation,
      rebalFreq: simOptions.rebalFreq,
      mcMode: simOptions.mcMode,
      bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
      bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
    })
    const cached = loadCache<{ series: any; summary: MonteSummary }>(key)
    if (cached?.series?.mc?.p50) {
      setBaseline({ summary: cached.summary, p50: cached.series.mc.p50 })
    } else if (simWorkerRef.current) {
      setLoading(true)
      simWorkerRef.current.postMessage({ snapshot, options: { years: simOptions.years, inflation: simOptions.inflation, rebalFreq: simOptions.rebalFreq, paths: Math.min(simOptions.paths, 800), mcMode: simOptions.mcMode, bootstrapBlockMonths: simOptions.bootstrapBlockMonths, bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma, maxPathsForSeries: Math.min(simOptions.paths, 800) } })
      const original = simWorkerRef.current.onmessage
      simWorkerRef.current.onmessage = (e: MessageEvent<any>) => {
        const d = e.data
        if (!d || d.ok === false) { setLoading(false); simWorkerRef.current!.onmessage = original!; return }
        setBaseline({ summary: d.summary as MonteSummary, p50: d.series.mc.p50 as number[] })
        setLoading(false)
        simWorkerRef.current!.onmessage = original!
      }
    }
  }, [snapshot, simOptions])

  function buildVariantSnapshot(): Snapshot | null {
    if (!snapshot) return null
    const s: Snapshot = JSON.parse(JSON.stringify(snapshot))
    s.retirement.expected_spend_monthly = spend
    if (typeof retAge === 'number') s.retirement.target_age = retAge
    return s
  }

  function runVariant() {
    if (!snapshot || !simWorkerRef.current) return
    const s = buildVariantSnapshot()!
    const opts: SimOptions = {
      years: simOptions.years,
      inflation,
      rebalFreq: simOptions.rebalFreq,
      paths: Math.min(simOptions.paths, 1000),
      mcMode: simOptions.mcMode,
      bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
      bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma,
      maxPathsForSeries: Math.min(simOptions.paths, 1000)
    }
    const key = resultsKey(s, opts)
    const cached = loadCache<{ series: any; summary: MonteSummary }>(key)
    if (cached?.series?.mc?.p50) { setVariant({ summary: cached.summary, p50: cached.series.mc.p50 }); return }
    setLoading(true)
    simWorkerRef.current.postMessage({ snapshot: s, options: opts })
    const onmsg = (e: MessageEvent<any>) => {
      const data = e.data
      if (!data || data.ok === false) { setLoading(false); return }
      try { saveCache(key, { series: data.series, summary: data.summary }) } catch {}
    }
    const w = simWorkerRef.current as any
    const prev = w.onmessage
    w.onmessage = (ev: MessageEvent<any>) => { onmsg(ev); prev && prev(ev) }
  }

  function resetVariant() {
    if (!snapshot) return
    setInflation(simOptions.inflation)
    setSpend(snapshot.retirement.expected_spend_monthly || 0)
    setRetAge(snapshot.retirement.target_age ?? baseAge!)
    setVariant(null)
  }

  // Run scenarios with optionally variant inputs
  function runScenarios() {
    if (!snapshot) return
    setScRunning(true)
    setScResults(null)
    setScProgress('Starting…')
    const targets = [
      { label: `Optimistic (${t50}%)`, success: t50/100 },
      { label: `Realistic (${t75}%)`, success: t75/100 },
      { label: `Conservative (${t90}%)`, success: t90/100 }
    ]
    // Use baseline or variant
    const baseSnap = applyVariantToScenarios ? buildVariantSnapshot()! : snapshot
    const baseOpts: SimOptions = {
      years: simOptions.years,
      inflation: applyVariantToScenarios ? inflation : simOptions.inflation,
      rebalFreq: simOptions.rebalFreq,
      mcMode: simOptions.mcMode,
      bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
      bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
    }

    // Cache check
    const scKey = scenariosKey(baseSnap, baseOpts, targets, pathsPerEval)
    const cached = loadCache<ScenarioResult>(scKey)
    if (cached) {
      setScResults(cached)
      // make charts deterministically for each result
      const c: Record<string, { total: number[]; principal: number[] }> = {}
      for (const [label, r] of Object.entries(cached)) {
        const snap = { ...baseSnap, retirement: { ...baseSnap.retirement, expected_spend_monthly: r.monthly } }
        const det = simulateDeterministicSeries(snap as any, { years: simOptions.years, inflation: baseOpts.inflation, rebalFreq: baseOpts.rebalFreq })
        c[label] = { total: det.total, principal: det.principalRemaining }
      }
      setScCharts(c)
      setScRunning(false)
      setScProgress('')
      return
    }

    const baseSpend = baseSnap.retirement?.expected_spend_monthly || 0
    const totalBal = baseSnap.accounts?.reduce((s, a) => s + (a.holdings||[]).reduce((h, lot) => h + lot.units * lot.price, 0) + (a.cash_balance||0), 0) || 0
    const years = simOptions.years
    const baseGuess = baseSpend > 0 ? baseSpend : Math.max(totalBal * 0.04 / 12, totalBal / (years * 12))
    const lo = Math.max(0, baseGuess / 4)
    const hi = Math.max(1000, baseGuess * 4)

    const tmp: ScenarioResult = {}
    let done = 0
    for (const tgt of targets) {
      const w = new Worker(new URL('../workers/spendWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<any>) => {
        const msg = e.data
        if (msg.type === 'iter') {
          setScProgress(`${msg.label}: iter ${msg.iter} p=${(msg.p*100).toFixed(0)}% $${Math.round(msg.mid).toLocaleString()}/mo`)
        } else if (msg.type === 'done') {
          const r = msg.result as { label: string; monthly: number; success: number }
          tmp[r.label] = { monthly: r.monthly, success: r.success }
          done++
          if (done === targets.length) {
            setScResults(tmp)
            saveCache(scKey, tmp)
            setScRunning(false)
            setScProgress('')
            const c: Record<string, { total: number[]; principal: number[] }> = {}
            for (const [label, rr] of Object.entries(tmp)) {
              const snap = { ...baseSnap, retirement: { ...baseSnap.retirement, expected_spend_monthly: rr.monthly } }
              const det = simulateDeterministicSeries(snap as any, { years: simOptions.years, inflation: baseOpts.inflation, rebalFreq: baseOpts.rebalFreq })
              c[label] = { total: det.total, principal: det.principalRemaining }
            }
            setScCharts(c)
          }
          w.terminate()
        } else if (msg.type === 'error') {
          console.error('Spend worker error', msg.error)
          done++
          if (done === targets.length) {
            setScRunning(false)
            setScProgress('Error')
          }
          w.terminate()
        }
      }
      w.postMessage({
        snapshot: baseSnap,
        options: baseOpts,
        target: tgt,
        pathsPerEval,
        maxIter: 12,
        lowerBoundMonthly: lo,
        upperBoundMonthly: hi
      })
    }
  }

  const delta = useMemo(() => {
    if (!baseline || !variant) return null
    return {
      success: (variant.summary.successProbability - baseline.summary.successProbability) * 100,
      median: (variant.summary.medianTerminal - baseline.summary.medianTerminal)
    }
  }, [baseline, variant])

  return (
    <section>
      <h1>What‑Ifs</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Variant Inputs</Typography>
              <Grid container spacing={2} alignItems="center" sx={{ mb: 1 }}>
                <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Inflation (annual)" value={inflation} helperText="e.g., 0.02 = 2%" onChange={(e) => setInflation(Number(e.target.value))} /></Grid>
                <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Retirement Spend (mo)" value={spend} onChange={(e) => setSpend(Number(e.target.value))} /></Grid>
                <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Retirement Age" value={retAge} onChange={(e) => setRetAge(Number(e.target.value))} /></Grid>
                <Grid item xs={12} md={3}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={runVariant} disabled={loading}>Run Variant</Button>
                    <Button onClick={resetVariant} disabled={loading}>Reset</Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <div className="cards">
            <div className="card">
              <div className="card-title">Baseline</div>
              <div className="card-metric">{baseline ? `${(simOptions.paths).toLocaleString()} paths • success ${(baseline.summary.successProbability*100).toFixed(0)}% • median $${Math.round(baseline.summary.medianTerminal).toLocaleString()}` : (loading ? 'Computing…' : '-')}</div>
            </div>
            <div className="card">
              <div className="card-title">Variant</div>
              <div className="card-metric">{variant ? `${(simOptions.paths).toLocaleString()} paths • success ${(variant.summary.successProbability*100).toFixed(0)}% • median $${Math.round(variant.summary.medianTerminal).toLocaleString()}` : (loading ? 'Computing…' : '-')}</div>
            </div>
            <div className="card">
              <div className="card-title">Delta</div>
              <div className="card-metric">{delta ? `${delta.success >= 0 ? '+' : ''}${delta.success.toFixed(1)} pp • ${delta.median >= 0 ? '+' : ''}$${Math.round(delta.median).toLocaleString()}` : '-'}</div>
            </div>
          </div>

          {(baseline && (variant || loading)) && (
            <>
              <h2>Median Balance — Baseline vs Variant</h2>
              <MultiLineChart seriesByKey={{ Baseline: baseline.p50, Variant: (variant?.p50 || new Array(months).fill(0)) }} years={simOptions.years} startYear={startYear} title="Median Portfolio Balance" yLabel="Balance ($)" />
            </>
          )}

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Scenarios</Typography>
                <Chip label="Solve for monthly spend at success targets" size="small" />
              </Stack>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Optimistic %" value={t50} onChange={(e)=>setT50(Number(e.target.value)||0)} /></Grid>
                <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Realistic %" value={t75} onChange={(e)=>setT75(Number(e.target.value)||0)} /></Grid>
                <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Conservative %" value={t90} onChange={(e)=>setT90(Number(e.target.value)||0)} /></Grid>
                <Grid item xs={12} md={3}><TextField fullWidth type="number" label="Paths per eval" value={pathsPerEval} onChange={(e)=>setPathsPerEval(Math.max(50, Number(e.target.value)||0))} /></Grid>
                <Grid item xs={12} md={3}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Switch checked={applyVariantToScenarios} onChange={(e) => setApplyVariantToScenarios(e.target.checked)} />
                    <Typography>Apply variant to scenarios</Typography>
                  </Stack>
                </Grid>
              </Grid>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
                <Button variant="contained" onClick={runScenarios} disabled={scRunning}>Compute</Button>
                {scRunning && <Typography color="text.secondary">{scProgress}</Typography>}
              </Stack>
            </CardContent>
          </Card>

          {scResults && (
            <div className="cards" style={{ marginTop: 12 }}>
              {Object.entries(scResults).map(([label, r]) => (
                <div className="card" key={label}>
                  <div className="card-title">{label}</div>
                  <div className="card-metric">${r.monthly.toLocaleString()}/mo</div>
                  <div style={{ color: '#9aa4b2', fontSize: 12 }}>Success ~ {(r.success*100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          )}

          {scCharts && (
            <>
              {Object.entries(scCharts).map(([label, s]) => (
                <Card key={label} sx={{ mt: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>{label} – Balance and Principal</Typography>
                    <StackedPrincipal total={s.total} principal={s.principal} title={label} startYear={startYear} retAt={retAt as any} xLabel="Year" yLabel="Balance ($)" />
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
