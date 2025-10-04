/**
 * What-Ifs Page
 * - Manage comparison scenarios against the current baseline snapshot.
 * - Users can tweak key levers (inflation, spend, retirement age, extra income, Social Security) and rerun simulations.
 * - Charts reuse baseline components with optional overlays for the active scenario.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '@state/AppContext'
import type { Snapshot } from '@types/schema'
import type { MonteSummary, SimOptions } from '@types/engine'
import { resultsKey, loadCache, saveCache } from '@state/cache'
import { FanChart } from '@components/charts/FanChart'
import { YearlyFlowsChart } from '@components/YearlyFlowsChart'
import { YearlyBalanceSheet } from '@components/YearlyBalanceSheet'
import { Box, Button, Card, CardContent, Grid, IconButton, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { generateYearlyBreakdown, YearlyBreakdownData } from '../utils/calculations'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

type QuantKey = 'p10' | 'p25' | 'p50' | 'p75' | 'p90'

interface SeriesBundle {
  summary: MonteSummary
  series: { months: number; mc: Record<QuantKey, number[]> }
  yearEnds: Record<QuantKey, number[]>
  breakdown: Record<QuantKey, YearlyBreakdownData[]>
}

interface ScenarioState {
  id: string
  name: string
  inflation: number
  spend: number
  retirementAge?: number
  extraIncomeMonthly?: number
  ssClaimAge?: number
  ssMonthly?: number
  status: 'idle' | 'running' | 'ready' | 'error'
  summary?: MonteSummary
  series?: { months: number; mc: Record<QuantKey, number[]> }
  yearEnds?: Record<QuantKey, number[]>
  variantSnapshot?: Snapshot
  breakdown?: Record<QuantKey, YearlyBreakdownData[]>
  error?: string
}

function computeYearEnds(series: { mc: Record<QuantKey, number[]> }, years: number): Record<QuantKey, number[]> {
  const monthsTotal = Math.max(1, years * 12)
  const endIdx = (y: number) => Math.min(monthsTotal - 1, (y + 1) * 12 - 1)
  const keys: QuantKey[] = ['p10', 'p25', 'p50', 'p75', 'p90']
  const result: Record<QuantKey, number[]> = {
    p10: [], p25: [], p50: [], p75: [], p90: []
  }
  for (const key of keys) {
    result[key] = Array.from({ length: years }, (_, y) => series.mc[key]?.[endIdx(y)] ?? 0)
  }
  return result
}

function buildScenarioSnapshot(base: Snapshot, scenario: ScenarioState): Snapshot {
  const s: Snapshot = JSON.parse(JSON.stringify(base))
  s.retirement = { ...s.retirement, expected_spend_monthly: scenario.spend }
  if (scenario.retirementAge != null) {
    s.retirement.target_age = scenario.retirementAge
  }

  // Additional income modeled as monthly contribution to a synthetic account
  if (scenario.extraIncomeMonthly && scenario.extraIncomeMonthly !== 0) {
    const contrib = {
      account_id: '__scenario_extra_income__',
      amount: scenario.extraIncomeMonthly,
      frequency: 'monthly' as const,
      start: s.timestamp
    }
    s.contributions = [...(s.contributions || []), contrib]
  }

  if (scenario.ssClaimAge != null || scenario.ssMonthly != null) {
    const ssArr = [...(s.social_security || [])]
    const first = ssArr[0] ? { ...ssArr[0] } : { claim_age: scenario.ssClaimAge ?? 62, monthly_amount: scenario.ssMonthly ?? 0 }
    if (scenario.ssClaimAge != null) first.claim_age = scenario.ssClaimAge
    if (scenario.ssMonthly != null) first.monthly_amount = scenario.ssMonthly
    ssArr[0] = first
    s.social_security = ssArr
  }

  return s
}

export function WhatIfsPage() {
  const { snapshot, simOptions } = useApp()
  const BASE_SEED = 12345
  const [baseline, setBaseline] = useState<SeriesBundle | null>(null)
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [quantile, setQuantile] = useState<QuantKey>('p50')
  const [scenarios, setScenarios] = useState<ScenarioState[]>([])
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null)
  const [overlayEnabled, setOverlayEnabled] = useState(true)

  const years = simOptions.years
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

  useEffect(() => {
    setScenarios([])
    setActiveScenarioId(null)
  }, [snapshot])

  useEffect(() => {
    if (!snapshot) { setBaseline(null); return }
    const opts: SimOptions = {
      years: simOptions.years,
      inflation: simOptions.inflation,
      rebalFreq: simOptions.rebalFreq,
      paths: simOptions.paths,
      bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
      bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
    }
    // const key = resultsKey(snapshot, opts)
    // const cached = loadCache<{ series: SeriesBundle['series']; summary: MonteSummary }>(key)
    // if (cached?.series?.mc?.p50) {
    //   const yearEnds = computeYearEnds(cached.series, simOptions.years)
    //   const breakdown = {} as Record<QuantKey, YearlyBreakdownData[]>
    //   for (const k of Object.keys(yearEnds) as QuantKey[]) {
    //     breakdown[k] = generateYearlyBreakdown(snapshot, simOptions.years, simOptions.inflation, yearEnds[k])
    //   }
    //   setBaseline({ summary: cached.summary, series: cached.series, yearEnds, breakdown })
    //   return
    // }
    setBaselineLoading(true)
    const worker = new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<any>) => {
      const data = e.data
      worker.terminate()
      setBaselineLoading(false)
      if (!data || data.ok === false) {
        console.error('Failed to compute baseline scenario', data?.error)
        return
      }
      // try { saveCache(key, { series: data.series, summary: data.summary }) } catch {}
      const yearEnds = computeYearEnds(data.series, simOptions.years)
      const breakdown = {} as Record<QuantKey, YearlyBreakdownData[]>
      for (const k of Object.keys(yearEnds) as QuantKey[]) {
        breakdown[k] = generateYearlyBreakdown(snapshot, simOptions.years, simOptions.inflation, yearEnds[k])
      }
      setBaseline({ summary: data.summary as MonteSummary, series: data.series, yearEnds, breakdown })
    }
    worker.postMessage({ snapshot, options: { ...opts, maxPathsForSeries: Math.min(simOptions.paths || 1000, 1000), seed: BASE_SEED } })
  }, [snapshot, simOptions])

  const activeScenario = overlayEnabled ? scenarios.find((s) => s.id === activeScenarioId && s.status === 'ready') : undefined

  const delta = useMemo(() => {
    if (!baseline || !activeScenario?.summary) return null
    return {
      success: (activeScenario.summary.successProbability - baseline.summary.successProbability) * 100,
      median: activeScenario.summary.medianTerminal - baseline.summary.medianTerminal
    }
  }, [baseline, activeScenario])

  function addScenario() {
    if (!snapshot) return
    setScenarios((prev) => {
      const ss = snapshot.social_security && snapshot.social_security.length ? snapshot.social_security[0] : undefined
      const next: ScenarioState = {
        id: `scenario-${Date.now()}-${prev.length}`,
        name: `Scenario ${prev.length + 1}`,
        inflation: simOptions.inflation,
        spend: snapshot.retirement.expected_spend_monthly || 0,
        retirementAge: snapshot.retirement.target_age,
        extraIncomeMonthly: 0,
        ssClaimAge: ss?.claim_age,
        ssMonthly: ss?.monthly_amount,
        status: 'idle'
      }
      setActiveScenarioId(next.id)
      return [...prev, next]
    })
  }

  function updateScenario(id: string, patch: Partial<ScenarioState>, resetResult = true) {
    setScenarios((prev) => prev.map((s) => {
      if (s.id !== id) return s
      const next = { ...s, ...patch }
      if (resetResult) {
        next.status = 'idle'
        next.summary = undefined
        next.series = undefined
        next.yearEnds = undefined
        next.variantSnapshot = undefined
        next.error = undefined
      }
      return next
    }))
  }

  function removeScenario(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id))
    setActiveScenarioId((cur) => (cur === id ? null : cur))
  }

  function runScenario(id: string) {
    if (!snapshot) return
    const scenario = scenarios.find((s) => s.id === id)
    if (!scenario) return
    const variantSnapshot = buildScenarioSnapshot(snapshot, scenario)
    const opts: SimOptions = {
      years: simOptions.years,
      inflation: scenario.inflation,
      rebalFreq: simOptions.rebalFreq,
      paths: simOptions.paths,
      bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
      bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
    }
    // const key = resultsKey(variantSnapshot, opts)
    // const cached = loadCache<{ series: SeriesBundle['series']; summary: MonteSummary }>(key)
    // if (cached?.series?.mc?.p50) {
    //   const yearEnds = computeYearEnds(cached.series, simOptions.years)
    //   const breakdown = {} as Record<QuantKey, YearlyBreakdownData[]>
    //   for (const k of Object.keys(yearEnds) as QuantKey[]) {
    //     breakdown[k] = generateYearlyBreakdown(variantSnapshot, simOptions.years, scenario.inflation, yearEnds[k])
    //   }
    //   setScenarios((prev) => prev.map((s) => s.id === id ? {
    //     ...s,
    //     status: 'ready',
    //     summary: cached.summary,
    //     series: cached.series,
    //     yearEnds,
    //     breakdown,
    //     variantSnapshot
    //   } : s))
    //   setActiveScenarioId(id)
    //   return
    // }

    setScenarios((prev) => prev.map((s) => s.id === id ? { ...s, status: 'running', error: undefined, breakdown: undefined } : s))
    setActiveScenarioId(id)

    const worker = new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<any>) => {
      const data = e.data
      worker.terminate()
      if (!data || data.ok === false) {
        setScenarios((prev) => prev.map((s) => s.id === id ? { ...s, status: 'error', error: data?.error || 'Simulation failed' } : s))
        return
      }
      // try { saveCache(key, { series: data.series, summary: data.summary }) } catch {}
      const yearEnds = computeYearEnds(data.series, simOptions.years)
      const breakdown = {} as Record<QuantKey, YearlyBreakdownData[]>
      for (const k of Object.keys(yearEnds) as QuantKey[]) {
        breakdown[k] = generateYearlyBreakdown(variantSnapshot, simOptions.years, scenario.inflation, yearEnds[k], baseline?.breakdown[k])
      }
      setScenarios((prev) => prev.map((s) => s.id === id ? {
        ...s,
        status: 'ready',
        summary: data.summary as MonteSummary,
        series: data.series,
        yearEnds,
        breakdown,
        variantSnapshot
      } : s))
    }
    const maxForSeries = Math.min(simOptions.paths ?? 1000, 1000)
    worker.postMessage({
      snapshot: variantSnapshot,
      options: {
        ...opts,
        maxPathsForSeries: maxForSeries,
        // ensure Monte Carlo uses the same path count as baseline unless paths is undefined
        paths: opts.paths,
        seed: BASE_SEED
      }
    })
  }

  return (
    <section>
      <h1>What-Ifs</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <ToggleButtonGroup size="small" value={quantile} exclusive onChange={(_e, v) => v && setQuantile(v)}>
              <ToggleButton value="p10">P10</ToggleButton>
              <ToggleButton value="p25">P25</ToggleButton>
              <ToggleButton value="p50">Median</ToggleButton>
              <ToggleButton value="p75">P75</ToggleButton>
              <ToggleButton value="p90">P90</ToggleButton>
            </ToggleButtonGroup>
            <Stack direction="row" spacing={1} alignItems="center">
              <Switch checked={overlayEnabled} onChange={(e) => setOverlayEnabled(e.target.checked)} />
              <Typography variant="body2">Show comparison overlay</Typography>
            </Stack>
            {activeScenario?.summary && delta && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', color: 'text.secondary', fontSize: 13 }}>
                <span>Δ Success: {delta.success >= 0 ? '+' : ''}{delta.success.toFixed(1)} pp</span>
                <span>Δ Median: {delta.median >= 0 ? '+' : ''}${Math.round(delta.median).toLocaleString()}</span>
              </Box>
            )}
            {baselineLoading && <Typography color="text.secondary" variant="body2">Loading baseline…</Typography>}
          </Box>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Comparison Scenarios</Typography>
                <Tooltip title="For broader adjustments, save a new snapshot in the builder and upload it here.">
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Tooltip>
              </Stack>
              <Button variant="contained" onClick={addScenario} disabled={!snapshot}>Add Scenario</Button>
            </CardContent>
          </Card>

          {scenarios.length === 0 && (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Add a scenario to experiment with alternate assumptions for a quick comparison against your baseline.
            </Typography>
          )}

          <Stack spacing={2} sx={{ mb: 4 }}>
            {scenarios.map((sc) => (
              <Card key={sc.id} variant={sc.id === activeScenarioId ? 'outlined' : undefined}>
                <CardContent>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={3}>
                      <TextField label="Scenario name" fullWidth value={sc.name} onChange={(e) => updateScenario(sc.id, { name: e.target.value }, false)} />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField type="number" label="Inflation (annual)" fullWidth value={sc.inflation} onChange={(e) => updateScenario(sc.id, { inflation: Number(e.target.value) || 0 })} />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField type="number" label="Retirement spend (mo)" fullWidth value={sc.spend} onChange={(e) => updateScenario(sc.id, { spend: Number(e.target.value) || 0 })} />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField type="number" label="Retirement age" fullWidth value={sc.retirementAge ?? ''} onChange={(e) => updateScenario(sc.id, { retirementAge: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                        <Button variant="outlined" size="small" onClick={() => runScenario(sc.id)} disabled={sc.status === 'running'}>
                          {sc.status === 'ready' ? 'Re-run' : 'Run scenario'}
                        </Button>
                        <Button size="small" onClick={() => setActiveScenarioId(sc.id)} disabled={activeScenarioId === sc.id}>
                          {activeScenarioId === sc.id ? 'Active' : 'Set active'}
                        </Button>
                        <IconButton onClick={() => removeScenario(sc.id)} size="small" aria-label="Remove scenario">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField type="number" label="Extra income (mo)" fullWidth value={sc.extraIncomeMonthly ?? 0} onChange={(e) => updateScenario(sc.id, { extraIncomeMonthly: Number(e.target.value) || 0 })} />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField type="number" label="SS claim age" fullWidth value={sc.ssClaimAge ?? ''} onChange={(e) => updateScenario(sc.id, { ssClaimAge: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField type="number" label="SS monthly" fullWidth value={sc.ssMonthly ?? ''} onChange={(e) => updateScenario(sc.id, { ssMonthly: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      {sc.status === 'running' && <Typography color="text.secondary">Running…</Typography>}
                      {sc.status === 'error' && <Typography color="error">{sc.error || 'Simulation failed'}</Typography>}
                      {sc.status === 'ready' && sc.summary && (
                        <Typography color="text.secondary">
                          Success {(sc.summary.successProbability * 100).toFixed(0)}% • Median ${Math.round(sc.summary.medianTerminal).toLocaleString()}
                        </Typography>
                      )}
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {baseline && (
            <>
              <h2>Portfolio Balance — Fan Chart</h2>
              <FanChart
                p10={baseline.series.mc.p10}
                p25={baseline.series.mc.p25}
                p50={baseline.series.mc.p50}
                p75={baseline.series.mc.p75}
                p90={baseline.series.mc.p90}
                years={simOptions.years}
                startYear={startYear}
                retAt={retAt}
                title="Baseline Percentiles"
                highlight={quantile}
                overlay={activeScenario?.series ? {
                  label: activeScenario.name,
                  p10: activeScenario.series.mc.p10,
                  p25: activeScenario.series.mc.p25,
                  p50: activeScenario.series.mc.p50,
                  p75: activeScenario.series.mc.p75,
                  p90: activeScenario.series.mc.p90
                } : undefined}
              />

              <h2>Yearly Flows — Returns, Income, Expenditures</h2>
              <YearlyFlowsChart
                breakdown={baseline.breakdown[quantile]}
                comparisonBreakdown={activeScenario?.breakdown?.[quantile]}
              />

              <YearlyBalanceSheet
                breakdown={baseline.breakdown[quantile]}
                comparisonBreakdown={activeScenario?.breakdown?.[quantile]}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}

/*
What-Ifs page – scenario manager with baseline comparison overlays.
- Users create scenario cards, tweak limited parameters, and run simulations on demand.
- Charts reuse baseline visuals with optional overlay data from the active scenario.
*/
