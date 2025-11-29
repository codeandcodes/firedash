/**
 * Results page
 * - Runs Monte Carlo (historical bootstrap) via workers; progressive P^2 percentile updates.
 * - Aggregates per-year end balances (P10/P25/P50/P75/P90) and Alive_Frac (paths remaining).
 * - Renders FanChart, Yearly Balance Sheet (with CSV export) and Yearly Flows chart; advanced Paths Remaining view.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@state/AppContext'
import { ScenarioOptions } from '@components/ScenarioOptions'
import { FanChart } from '@components/charts/FanChart'
// Removed deterministic-only charts to reduce clutter
import { YearlyBalanceSheet } from '@components/YearlyBalanceSheet'
import { YearlyFlowsChart } from '@components/YearlyFlowsChart'
import { YearlyMultiLineChart } from '@components/charts/YearlyMultiLineChart'
import { SpendScenariosPanel } from '@components/SpendScenariosPanel'
import type { MonteSummary } from '@types/engine'
import { P2Quantile } from '@engine/quantile'
import { LinearProgress, Box, ToggleButton, ToggleButtonGroup, Button, Collapse } from '@mui/material'
import { resultsKey, saveCache, loadCache } from '@state/cache'
import { generateYearlyBreakdown, YearlyBreakdownData } from '../utils/calculations'
import { ContextIcon } from '@components/ContextIcon'
import { useChat } from '@state/ChatContext'

type QuantKey = 'p10' | 'p25' | 'p50' | 'p75' | 'p90'

export function ResultsPage() {
  const { snapshot, simOptions } = useApp()
  const [baseSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))
  const [mcSummary, setMcSummary] = useState<MonteSummary | null>(null)
  const [series, setSeries] = useState<null | { months: number; mc: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] } }>(null)
  const [loading, setLoading] = useState(false)
  const simWorkerRef = useRef<Worker | null>(null)
  const poolRefs = useRef<Worker[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [quantile, setQuantile] = useState<QuantKey>('p50')
  const [yearEnds, setYearEnds] = useState<null | Record<QuantKey, number[]>>(null)
  const [breakdown, setBreakdown] = useState<null | Record<QuantKey, YearlyBreakdownData[]>>(null)
  const [aliveFrac, setAliveFrac] = useState<number[] | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (!simWorkerRef.current) {
      simWorkerRef.current = new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' })
      simWorkerRef.current.onmessage = (e: MessageEvent<any>) => {
        const data = e.data
        if (!data || data.ok === false) {
          setLoading(false)
          console.error('Simulation worker error:', data?.error)
          return
        }
        setSeries(data.series)
        setMcSummary(data.summary)
        // cache initial summary
        if (snapshot) {
          const key = resultsKey(snapshot, {
            paths: simOptions.paths,
            years: simOptions.years,
            inflation: simOptions.inflation,
            rebalFreq: simOptions.rebalFreq,
            bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
            bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
          })
          saveCache(key, { series: data.series, summary: data.summary })
        }
        setLoading(false)
      }
    }
    return () => {
      // keep worker alive across renders; terminated on unmount via separate effect below
    }
  }, [])

  useEffect(() => {
    if (!snapshot || !simWorkerRef.current) { setSeries(null); setMcSummary(null); return }
    setLoading(true)
    setProgress(null)
    // Try cache
    // const cacheKey = resultsKey(snapshot, {
    //   paths: simOptions.paths,
    //   years: simOptions.years,
    //   inflation: simOptions.inflation,
    //   rebalFreq: simOptions.rebalFreq,
    //   bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
    //   bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
    // })
    // const cached = loadCache<{ series: any; summary: MonteSummary; yearEnds?: Record<QuantKey, number[]>; aliveFrac?: number[]; breakdown?: Record<QuantKey, YearlyBreakdownData[]> }>(cacheKey)
    // if (cached) {
    //   setSeries(cached.series)
    //   setMcSummary(cached.summary)
    //   if (cached.yearEnds) setYearEnds(cached.yearEnds)
    //   if (cached.aliveFrac) setAliveFrac(cached.aliveFrac)
    //   if (cached.breakdown) {
    //     setBreakdown(cached.breakdown)
    //   } else if (cached.yearEnds) {
    //     const bd = {} as Record<QuantKey, YearlyBreakdownData[]>
    //     for (const k of Object.keys(cached.yearEnds) as QuantKey[]) {
    //       bd[k] = generateYearlyBreakdown(snapshot, simOptions.years, simOptions.inflation, cached.yearEnds[k])
    //     }
    //     setBreakdown(bd)
    //   }
    //   setLoading(false)
    //   setProgress(null)
    //   return
    // }
    // Seed cache + initial MC percentiles (bootstrap only)
    simWorkerRef.current.postMessage({ snapshot, options: { years: simOptions.years, inflation: simOptions.inflation, rebalFreq: simOptions.rebalFreq, paths: Math.min(simOptions.paths, 1000), bootstrapBlockMonths: simOptions.bootstrapBlockMonths, bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma, maxPathsForSeries: Math.min(simOptions.paths, 1000), seed: baseSeed } })
    // Then start MC pool progressively updating percentiles
    // We will fill mcPercentiles with P2 estimators per month
    const months = Math.max(1, simOptions.years * 12)
    const qs = [0.1, 0.25, 0.5, 0.75, 0.9]
    const p2 = qs.map(() => Array.from({ length: months }, () => new P2Quantile(0.5)))
    p2[0] = Array.from({ length: months }, () => new P2Quantile(0.1)) as any
    p2[1] = Array.from({ length: months }, () => new P2Quantile(0.25)) as any
    p2[2] = Array.from({ length: months }, () => new P2Quantile(0.5)) as any
    p2[3] = Array.from({ length: months }, () => new P2Quantile(0.75)) as any
    p2[4] = Array.from({ length: months }, () => new P2Quantile(0.9)) as any
    let successes = 0
    const termP2 = new P2Quantile(0.5)
    const termP10 = new P2Quantile(0.1)
    const termP90 = new P2Quantile(0.9)
    let received = 0
    let toLaunch = simOptions.paths
    const maxAllowed = Math.max(1, Math.min(simOptions.maxWorkers || (navigator.hardwareConcurrency || 4), 8))
    const cores = Math.max(1, Math.min(maxAllowed, toLaunch))
    // Per-year quantiles and alive counts
    const yearsN = simOptions.years
    const endIdx = (y: number) => Math.min(months - 1, (y + 1) * 12 - 1)
    const yp2 = {
      p10: Array.from({ length: yearsN }, () => new P2Quantile(0.1)),
      p25: Array.from({ length: yearsN }, () => new P2Quantile(0.25)),
      p50: Array.from({ length: yearsN }, () => new P2Quantile(0.5)),
      p75: Array.from({ length: yearsN }, () => new P2Quantile(0.75)),
      p90: Array.from({ length: yearsN }, () => new P2Quantile(0.9))
    }
    const aliveCounts = new Array<number>(yearsN).fill(0)
    // terminate old pool
    poolRefs.current.forEach(w => w.terminate())
    poolRefs.current = []
    const perWorker = Math.floor(toLaunch / cores)
    const extra = toLaunch % cores
    setProgress({ done: 0, total: toLaunch })
    for (let i = 0; i < cores; i++) {
      const count = perWorker + (i < extra ? 1 : 0)
      if (count <= 0) continue
      const w = new Worker(new URL('../workers/mcWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<any>) => {
        const msg = e.data
        if (msg.type === 'batch') {
          // when batch reaches 10, this message emitted with [b][m] where b is batch size and m is the months in the simulation
          const totalsBatch: number[][] = msg.totals
          const statsBatch: { success: boolean; terminal: number }[] = msg.stats
          for (let b = 0; b < totalsBatch.length; b++) {
            const arr = totalsBatch[b]  // array of months to the terminal balance for this month
            for (let m = 0; m < Math.min(months, arr.length); m++) {
              ;(p2[0][m] as any).add(arr[m])
              ;(p2[1][m] as any).add(arr[m])
              ;(p2[2][m] as any).add(arr[m])
              ;(p2[3][m] as any).add(arr[m])
              ;(p2[4][m] as any).add(arr[m])
            }
            // per-year
            for (let y = 0; y < yearsN; y++) {
              const v = arr[endIdx(y)]
              yp2.p10[y].add(v)
              yp2.p25[y].add(v)
              yp2.p50[y].add(v)
              yp2.p75[y].add(v)
              yp2.p90[y].add(v)
              if (v > 0) aliveCounts[y] += 1
            }
          }
          for (const st of statsBatch) {
            if (st.success) successes += 1
            termP2.add(st.terminal)
            termP10.add(st.terminal)
            termP90.add(st.terminal)
          }
          received += totalsBatch.length
          setProgress((p) => p ? { ...p, done: Math.min(p.done + totalsBatch.length, p.total) } : null)
          // progressive update: emit new percentiles
          setSeries((prev) => {
            if (!prev) return prev
            const mc = { p10: new Array(months), p25: new Array(months), p50: new Array(months), p75: new Array(months), p90: new Array(months) }
            for (let m = 0; m < months; m++) {
              mc.p10[m] = (p2[0][m] as any).get()
              mc.p25[m] = (p2[1][m] as any).get()
              mc.p50[m] = (p2[2][m] as any).get()
              mc.p75[m] = (p2[3][m] as any).get()
              mc.p90[m] = (p2[4][m] as any).get()
            }
            const res = { ...prev, mc }
            // update cache progressively
            try { saveCache(cacheKey, { series: res, summary: { successProbability: received ? successes / received : 0, medianTerminal: termP2.get(), p10Terminal: (termP10 as any).get?.() ?? NaN, p90Terminal: (termP90 as any).get?.() ?? NaN } as any }) } catch {}
            return res
          })
          // push per-year series and alive fraction
          const curYearEnds = {
            p10: Array.from({ length: yearsN }, (_, y) => yp2.p10[y].get()),
            p25: Array.from({ length: yearsN }, (_, y) => yp2.p25[y].get()),
            p50: Array.from({ length: yearsN }, (_, y) => yp2.p50[y].get()),
            p75: Array.from({ length: yearsN }, (_, y) => yp2.p75[y].get()),
            p90: Array.from({ length: yearsN }, (_, y) => yp2.p90[y].get()),
          }
          setYearEnds(curYearEnds)
          const curAliveFrac = Array.from({ length: yearsN }, (_, y) => (received ? Math.max(0, Math.min(1, aliveCounts[y] / received)) : 0))
          setAliveFrac(curAliveFrac)
          const bd = {} as Record<QuantKey, YearlyBreakdownData[]>
          for (const k of Object.keys(curYearEnds) as QuantKey[]) {
            bd[k] = generateYearlyBreakdown(snapshot, simOptions.years, simOptions.inflation, curYearEnds[k])
          }
          setBreakdown(bd)
          setMcSummary({ successProbability: received ? successes / received : 0, medianTerminal: termP2.get(), p10Terminal: (termP10 as any).get?.() ?? NaN, p90Terminal: (termP90 as any).get?.() ?? NaN } as any)
          // update cache with yearEnds and aliveFrac as well
          // try {
          //   const snap = snapshot
          //   const res = loadCache<any>(cacheKey) || {}
          //   saveCache(cacheKey, { ...res, series: res.series || series, summary: { successProbability: received ? successes / received : 0, medianTerminal: termP2.get(), p10Terminal: (termP10 as any).get?.() ?? NaN, p90Terminal: (termP90 as any).get?.() ?? NaN }, yearEnds: curYearEnds, aliveFrac: curAliveFrac, breakdown: bd })
          // } catch {}
        } else if (msg.type === 'done') {
          // reduce when all workers finished
          if (poolRefs.current.every((wr) => (wr as any).__done)) {
            setLoading(false)
          }
          ;(w as any).__done = true
        } else if (msg.type === 'error') {
          console.error('MC worker error:', msg.error)
          ;(w as any).__done = true
        }
      }
      poolRefs.current.push(w)
      w.postMessage({ snapshot, options: { years: simOptions.years, inflation: simOptions.inflation, rebalFreq: simOptions.rebalFreq, bootstrapBlockMonths: simOptions.bootstrapBlockMonths, bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma, seed: baseSeed + i * 1000 }, count, batchSize: 10 })
    }
  }, [snapshot, simOptions])

  useEffect(() => () => {
    simWorkerRef.current?.terminate(); simWorkerRef.current = null
    poolRefs.current.forEach(w => w.terminate()); poolRefs.current = []
  }, [])

  const mcText = useMemo(() => {
    if (!snapshot) return '-'
    const paths = simOptions.paths
    // Determine the currently selected percentile final balance
    let finalBal: number | null = null
    if (series?.mc) {
      const arr = quantile === 'p10' ? series.mc.p10 : quantile === 'p25' ? series.mc.p25 : quantile === 'p75' ? series.mc.p75 : quantile === 'p90' ? series.mc.p90 : series.mc.p50
      if (arr && arr.length) finalBal = arr[arr.length - 1]
    } else if (yearEnds) {
      const arr = quantile === 'p10' ? yearEnds.p10 : quantile === 'p25' ? yearEnds.p25 : quantile === 'p75' ? yearEnds.p75 : quantile === 'p90' ? yearEnds.p90 : yearEnds.p50
      if (arr && arr.length) finalBal = arr[arr.length - 1]
    }
    const qLabel = quantile.toUpperCase()
    const base = `${paths.toLocaleString()} paths • ${mcSummary ? `success ${(mcSummary.successProbability * 100).toFixed(0)}%` : 'running…'}`
    return `${base} • ${qLabel} final $${finalBal != null ? Math.round(finalBal).toLocaleString() : '—'}`
  }, [mcSummary, snapshot, simOptions.paths, series, yearEnds, quantile])
  const startYear = useMemo(() => snapshot ? new Date(snapshot.timestamp).getFullYear() : undefined, [snapshot])
  const retAt = useMemo(() => {
    if (!snapshot) return undefined
    const start = new Date(snapshot.timestamp)
    if (snapshot.retirement?.target_date) {
      const rd = new Date(snapshot.retirement.target_date)
      const months = (rd.getFullYear() - start.getFullYear()) * 12 + (rd.getMonth() - start.getMonth())
      return Math.max(0, months)
    }
    if (snapshot.retirement?.target_age != null && snapshot.person?.current_age != null) {
      const deltaYears = Math.max(0, snapshot.retirement.target_age - snapshot.person.current_age)
      return Math.round(deltaYears * 12)
    }
    return undefined
  }, [snapshot])

  const { setContext } = useChat();

  return (
    <section>
      <h1>Results</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
        <ScenarioOptions />
        <Box sx={(t) => ({ position: 'sticky', top: { xs: 56, sm: 64 }, zIndex: (t.zIndex.appBar || 1200) - 1, display: 'flex', alignItems: 'center', gap: 2, mb: 1, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, borderRadius: 1, boxShadow: t.palette.mode === 'light' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' })}>
          <span style={{ color: '#334155', fontSize: 12, fontWeight: 600 }}>Percentile</span>
          <ToggleButtonGroup size="small" color="primary" exclusive value={quantile} onChange={(_e, v) => v && setQuantile(v)}>
            <ToggleButton value="p10" title="10th percentile (conservative)">P10</ToggleButton>
            <ToggleButton value="p25" title="25th percentile">P25</ToggleButton>
            <ToggleButton value="p50" title="Median (50th percentile)">Median</ToggleButton>
            <ToggleButton value="p75" title="75th percentile">P75</ToggleButton>
            <ToggleButton value="p90" title="90th percentile (optimistic)">P90</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span style={{ color: '#475569', fontSize: 12 }}>{loading ? (progress ? `Computing… ${Math.round((progress.done/progress.total)*100)}% (${progress.done}/${progress.total})` : 'Computing…') : mcText}</span>
            {loading && progress && (
              <Box sx={{ width: 140 }}>
                <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, Math.round((progress.done/progress.total)*100))) } />
              </Box>
            )}
          </Box>
        </Box>
        {series && !loading && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <h2>Portfolio Balance — Fan Chart</h2>
              <ContextIcon onClick={() => setContext({ chart: 'fan', data: series.mc })} />
            </Box>
            <FanChart p10={series.mc.p10} p25={series.mc.p25} p50={series.mc.p50} p75={series.mc.p75} p90={series.mc.p90} years={simOptions.years} startYear={startYear} retAt={retAt} title="Monte Carlo Percentiles" highlight={quantile} />
            {/* Percentile selector moved to top */}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <h2>Yearly Flows — Returns, Income, Expenditures</h2>
              <ContextIcon onClick={() => setContext({ chart: 'flows', data: breakdown && breakdown[quantile] })} />
            </Box>
            {breakdown && (
              <YearlyFlowsChart
                breakdown={breakdown[quantile]}
              />
            )}

            {breakdown && (
              <YearlyBalanceSheet
                breakdown={breakdown[quantile]}
                aliveFrac={aliveFrac || undefined}
              />
            )}
          </>
        )}
        {loading && <p>Computing simulations…</p>}
        {/* Advanced / debug section */}
        <div style={{ marginTop: 16 }}>
          <Button size="small" onClick={() => setShowAdvanced(v => !v)}>{showAdvanced ? 'Hide' : 'Show'} Advanced</Button>
          <Collapse in={showAdvanced} unmountOnExit>
            <Box sx={{ mt: 1 }}>
              {aliveFrac && startYear != null && (
                <YearlyMultiLineChart
                  years={Array.from({ length: simOptions.years }, (_, i) => (startYear as number) + i)}
                  seriesByKey={{ 'Alive %': aliveFrac }}
                  title="Paths Remaining (fraction of paths with balance > 0)"
                  yLabel="% Alive"
                />
              )}
              <Box sx={{ color: 'text.secondary', fontSize: 12, mt: 1 }}>
                Note: Paths Remaining reflects the sample distribution and is independent of the percentile toggle above.
              </Box>
              <SpendScenariosPanel snapshot={snapshot} simOptions={simOptions} startYear={startYear ?? undefined} retAt={retAt} />
            </Box>
          </Collapse>
        </div>
        </>
      )}
    </section>
  )
}
