import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@state/AppContext'
import { loadCache, resultsKey, saveCache } from '@state/cache'
import type { MonteSummary, SimOptions } from '@types/engine'
import type { Snapshot } from '@types/schema'
import { MultiLineChart } from '@components/charts/MultiLineChart'
import { Box, Grid, TextField, Typography, Button } from '@mui/material'

type SeriesBundle = {
  months: number
  mc: { p50: number[] }
}

export function SensitivityPage() {
  const { snapshot, simOptions } = useApp()
  const [inflation, setInflation] = useState<number>(simOptions.inflation)
  const [spend, setSpend] = useState<number>(snapshot?.retirement.expected_spend_monthly || 0)
  const baseAge = snapshot?.retirement.target_age ?? snapshot?.person?.current_age ? (snapshot!.retirement.target_age || (snapshot!.person!.current_age! + 25)) : 60
  const [retAge, setRetAge] = useState<number>(baseAge as number)

  const [baseline, setBaseline] = useState<{ summary: MonteSummary; p50: number[] } | null>(null)
  const [variant, setVariant] = useState<{ summary: MonteSummary; p50: number[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const simWorkerRef = useRef<Worker | null>(null)

  const months = useMemo(() => (simOptions.years * 12), [simOptions.years])
  const startYear = useMemo(() => snapshot ? new Date(snapshot.timestamp).getFullYear() : undefined, [snapshot])

  // Initialize worker
  useEffect(() => {
    if (!simWorkerRef.current) {
      simWorkerRef.current = new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' })
      simWorkerRef.current.onmessage = (e: MessageEvent<any>) => {
        const data = e.data
        if (!data || data.ok === false) { setLoading(false); return }
        // We only need p50 from series
        const p50 = data.series.mc.p50 as number[]
        const result = { summary: data.summary as MonteSummary, p50 }
        setVariant(result)
        setLoading(false)
      }
    }
    return () => { /* keep worker alive while on page */ }
  }, [])

  // Load baseline from Results cache or compute if missing
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
    } else {
      // compute a lightweight baseline via worker
      if (!simWorkerRef.current) return
      setLoading(true)
      simWorkerRef.current.postMessage({ snapshot, options: { years: simOptions.years, inflation: simOptions.inflation, rebalFreq: simOptions.rebalFreq, paths: Math.min(simOptions.paths, 800), mcMode: simOptions.mcMode, bootstrapBlockMonths: simOptions.bootstrapBlockMonths, bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma, maxPathsForSeries: Math.min(simOptions.paths, 800) } })
      const handler = (e: MessageEvent<any>) => {
        const data = e.data
        if (!data || data.ok === false) { setLoading(false); (simWorkerRef.current as any).onmessage = null; return }
        const p50 = data.series.mc.p50 as number[]
        setBaseline({ summary: data.summary as MonteSummary, p50 })
        setLoading(false)
        // restore main handler
        if (simWorkerRef.current) simWorkerRef.current.onmessage = (ev: MessageEvent<any>) => {
          const d = ev.data
          if (!d || d.ok === false) { setLoading(false); return }
          const p = d.series.mc.p50 as number[]
          setVariant({ summary: d.summary as MonteSummary, p50: p })
          setLoading(false)
        }
      }
      if (simWorkerRef.current) (simWorkerRef.current as any).onmessage = handler
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
    // Try cache first
    const key = resultsKey(s, opts)
    const cached = loadCache<{ series: any; summary: MonteSummary }>(key)
    if (cached?.series?.mc?.p50) {
      setVariant({ summary: cached.summary, p50: cached.series.mc.p50 })
      return
    }
    setLoading(true)
    simWorkerRef.current.postMessage({ snapshot: s, options: opts })
    // After completion, save to cache in worker handler path via our state update
    const onmsg = (e: MessageEvent<any>) => {
      const data = e.data
      if (!data || data.ok === false) { setLoading(false); return }
      try { saveCache(key, { series: data.series, summary: data.summary }) } catch {}
    }
    // temp listener alongside main one
    const w = simWorkerRef.current as any
    const prev = w.onmessage
    w.onmessage = (ev: MessageEvent<any>) => { onmsg(ev); prev && prev(ev) }
  }

  function resetToBaseline() {
    if (!snapshot) return
    setInflation(simOptions.inflation)
    setSpend(snapshot.retirement.expected_spend_monthly || 0)
    setRetAge(snapshot.retirement.target_age ?? baseAge!)
    setVariant(null)
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
      <h1>Sensitivity</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Compare a variant against current Results. Adjust inputs and run.</Typography>
          <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Inflation (annual)" value={inflation} helperText="e.g., 0.02 = 2%" onChange={(e) => setInflation(Number(e.target.value))} /></Grid>
            <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Retirement Spend (mo)" value={spend} onChange={(e) => setSpend(Number(e.target.value))} /></Grid>
            <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Retirement Age" value={retAge} onChange={(e) => setRetAge(Number(e.target.value))} /></Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" onClick={runVariant} disabled={loading}>Run Variant</Button>
                <Button onClick={resetToBaseline} disabled={loading}>Reset</Button>
              </Box>
            </Grid>
          </Grid>

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

          {baseline && (variant || loading) && (
            <>
              <h2>Median Balance — Baseline vs Variant</h2>
              <MultiLineChart seriesByKey={{ Baseline: baseline.p50, Variant: (variant?.p50 || new Array(months).fill(0)) }} years={simOptions.years} startYear={startYear} title="Median Portfolio Balance" yLabel="Balance ($)" />
            </>
          )}
        </>
      )}
    </section>
  )
}
