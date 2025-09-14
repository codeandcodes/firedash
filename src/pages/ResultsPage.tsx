import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@state/AppContext'
import { runDeterministicBacktest } from '@engine/backtest'
import { ScenarioOptions } from '@components/ScenarioOptions'
import { FanChart } from '@components/charts/FanChart'
import { LineChart } from '@components/charts/LineChart'
import { StackedArea } from '@components/charts/StackedArea'
import { YearlyPercentileTable } from '@components/YearlyPercentileTable'
import type { MonteSummary } from '@types/engine'
import { P2Quantile } from '@engine/quantile'

export function ResultsPage() {
  const { snapshot, simOptions } = useApp()
  const [mcSummary, setMcSummary] = useState<MonteSummary | null>(null)
  const [series, setSeries] = useState<null | { months: number; det: { total: number[]; byClass: any }; mc: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] } }>(null)
  const [loading, setLoading] = useState(false)
  const simWorkerRef = useRef<Worker | null>(null)
  const poolRefs = useRef<Worker[]>([])

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
    // First compute deterministic + scaffolding
    simWorkerRef.current.postMessage({ snapshot, options: { years: simOptions.years, inflation: simOptions.inflation, rebalFreq: simOptions.rebalFreq, paths: Math.min(simOptions.paths, 1000), mcMode: simOptions.mcMode, bootstrapBlockMonths: simOptions.bootstrapBlockMonths, bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma, maxPathsForSeries: Math.min(simOptions.paths, 1000) } })
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
    const cores = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8, toLaunch))
    // terminate old pool
    poolRefs.current.forEach(w => w.terminate())
    poolRefs.current = []
    const perWorker = Math.floor(toLaunch / cores)
    const extra = toLaunch % cores
    for (let i = 0; i < cores; i++) {
      const count = perWorker + (i < extra ? 1 : 0)
      if (count <= 0) continue
      const w = new Worker(new URL('../workers/mcWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<any>) => {
        const msg = e.data
        if (msg.type === 'batch') {
          const totalsBatch: number[][] = msg.totals
          const statsBatch: { success: boolean; terminal: number }[] = msg.stats
          for (let b = 0; b < totalsBatch.length; b++) {
            const arr = totalsBatch[b]
            for (let m = 0; m < Math.min(months, arr.length); m++) {
              ;(p2[0][m] as any).add(arr[m])
              ;(p2[1][m] as any).add(arr[m])
              ;(p2[2][m] as any).add(arr[m])
              ;(p2[3][m] as any).add(arr[m])
              ;(p2[4][m] as any).add(arr[m])
            }
          }
          for (const st of statsBatch) {
            if (st.success) successes += 1
            termP2.add(st.terminal)
            termP10.add(st.terminal)
            termP90.add(st.terminal)
          }
          received += totalsBatch.length
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
            return { ...prev, mc }
          })
          setMcSummary({ successProbability: received ? successes / received : 0, medianTerminal: termP2.get(), p10Terminal: (termP10 as any).get?.() ?? NaN, p90Terminal: (termP90 as any).get?.() ?? NaN } as any)
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
      w.postMessage({ snapshot, options: { years: simOptions.years, inflation: simOptions.inflation, rebalFreq: simOptions.rebalFreq, mcMode: simOptions.mcMode, bootstrapBlockMonths: simOptions.bootstrapBlockMonths, bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma }, count, batchSize: 10 })
    }
  }, [snapshot, simOptions])

  useEffect(() => () => {
    simWorkerRef.current?.terminate(); simWorkerRef.current = null
    poolRefs.current.forEach(w => w.terminate()); poolRefs.current = []
  }, [])

  const det = useMemo(() => (snapshot ? runDeterministicBacktest(snapshot, {
    years: simOptions.years,
    inflation: simOptions.inflation,
    rebalFreq: simOptions.rebalFreq
  }) : null), [snapshot, simOptions])
  const mcText = useMemo(() => {
    if (!snapshot || !mcSummary) return '-'
    const paths = simOptions.paths
    return `${paths.toLocaleString()} paths • success ${(mcSummary.successProbability * 100).toFixed(0)}% • median $${Math.round(mcSummary.medianTerminal).toLocaleString()}`
  }, [mcSummary, snapshot, simOptions.paths])
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

  return (
    <section>
      <h1>Results</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
        <ScenarioOptions />
        <div className="cards">
          <div className="card">
            <div className="card-title">Deterministic</div>
            <div className="card-metric">{det ? `${det.summary}. Terminal $${det.terminal.toLocaleString()}` : '-'}</div>
          </div>
          <div className="card">
            <div className="card-title">Monte Carlo</div>
            <div className="card-metric">{loading ? 'Computing…' : mcText}</div>
          </div>
        </div>
        {series && !loading && (
          <>
            <h2>Portfolio Balance — Fan Chart</h2>
            <FanChart p10={series.mc.p10} p25={series.mc.p25} p50={series.mc.p50} p75={series.mc.p75} p90={series.mc.p90} years={simOptions.years} startYear={startYear} retAt={retAt} title="Monte Carlo Percentiles" />
            <h2>Deterministic Balance</h2>
            <LineChart series={series.det.total} years={simOptions.years} startYear={startYear} retAt={retAt} label="Deterministic Balance" />
            <h2>Deterministic Asset Breakdown</h2>
            <StackedArea byClass={series.det.byClass} years={simOptions.years} startYear={startYear} retAt={retAt} />
            <h2>Yearly Percentiles</h2>
            <YearlyPercentileTable months={series.months} p10={series.mc.p10} p25={series.mc.p25} p50={series.mc.p50} p75={series.mc.p75} p90={series.mc.p90} startYear={startYear} highlightYear={startYear && retAt != null ? startYear + Math.floor(retAt/12) : undefined} />
          </>
        )}
        {loading && <p>Computing simulations…</p>}
        </>
      )}
    </section>
  )
}
