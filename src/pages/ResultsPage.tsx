import { useApp } from '@state/AppContext'
import { runDeterministicBacktest } from '@engine/backtest'
import { runMonteCarlo } from '@engine/monteCarlo'
import { useMemo } from 'react'
import { useApp } from '@state/AppContext'
import { ScenarioOptions } from '@components/ScenarioOptions'
import { simulateSeries } from '@engine/sim'
import { FanChart } from '@components/charts/FanChart'
import { LineChart } from '@components/charts/LineChart'
import { StackedArea } from '@components/charts/StackedArea'
import { YearlyPercentileTable } from '@components/YearlyPercentileTable'

export function ResultsPage() {
  const { snapshot, simOptions } = useApp()

  const det = useMemo(() => (snapshot ? runDeterministicBacktest(snapshot, {
    years: simOptions.years,
    inflation: simOptions.inflation,
    rebalFreq: simOptions.rebalFreq
  }) : null), [snapshot, simOptions])
  const mc = useMemo(() => (snapshot ? runMonteCarlo(snapshot, {
    paths: simOptions.paths,
    years: simOptions.years,
    inflation: simOptions.inflation,
    rebalFreq: simOptions.rebalFreq
  }) : null), [snapshot, simOptions])
  const series = useMemo(() => (snapshot ? simulateSeries(snapshot, {
    paths: Math.min(simOptions.paths, 1000),
    years: simOptions.years,
    inflation: simOptions.inflation,
    rebalFreq: simOptions.rebalFreq
  }) : null), [snapshot, simOptions])

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
            <div className="card-metric">{mc?.summary || '-'}</div>
          </div>
        </div>
        {series && (
          <>
            <h2>Portfolio Balance — Fan Chart</h2>
            <FanChart p10={series.mc.p10} p25={series.mc.p25} p50={series.mc.p50} p75={series.mc.p75} p90={series.mc.p90} years={simOptions.years} title="Monte Carlo Percentiles" />
            <h2>Deterministic Balance</h2>
            <LineChart series={series.det.total} years={simOptions.years} label="Deterministic Balance" />
            <h2>Deterministic Asset Breakdown</h2>
            <StackedArea byClass={series.det.byClass} years={simOptions.years} />
            <h2>Yearly Percentiles</h2>
            <YearlyPercentileTable months={series.months} p10={series.mc.p10} p25={series.mc.p25} p50={series.mc.p50} p75={series.mc.p75} p90={series.mc.p90} />
          </>
        )}
        </>
      )}
    </section>
  )
}
