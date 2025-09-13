import { useApp } from '@state/AppContext'
import { runDeterministicBacktest } from '@engine/backtest'
import { runMonteCarlo } from '@engine/monteCarlo'
import { useMemo } from 'react'

export function ResultsPage() {
  const { snapshot } = useApp()

  const det = useMemo(() => (snapshot ? runDeterministicBacktest(snapshot) : null), [snapshot])
  const mc = useMemo(() => (snapshot ? runMonteCarlo(snapshot, { paths: 1000 }) : null), [snapshot])

  return (
    <section>
      <h1>Results</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <div className="cards">
          <div className="card">
            <div className="card-title">Backtest (placeholder)</div>
            <div className="card-metric">{det?.summary || '-'}</div>
          </div>
          <div className="card">
            <div className="card-title">Monte Carlo (placeholder)</div>
            <div className="card-metric">{mc?.summary || '-'}</div>
          </div>
        </div>
      )}
    </section>
  )
}

