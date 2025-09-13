import React, { useEffect } from 'react'
import { useApp } from '@state/AppContext'

export const ScenarioOptions: React.FC = () => {
  const { simOptions, setSimOptions, snapshot } = useApp()

  // Initialize defaults from snapshot assumptions if present
  useEffect(() => {
    if (!snapshot) return
    const infl = snapshot.assumptions?.inflation_pct
    const reb = snapshot.assumptions?.rebalancing?.frequency
    setSimOptions({ inflation: typeof infl === 'number' ? infl : undefined, rebalFreq: reb })
  }, [snapshot])

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Scenario Options</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 12, marginTop: 8 }}>
        <label>Years
          <input type="number" value={simOptions.years}
                 onChange={(e) => setSimOptions({ years: Math.max(1, Number(e.target.value || 1)) })} />
        </label>
        <label>Paths
          <input type="number" value={simOptions.paths}
                 onChange={(e) => setSimOptions({ paths: Math.max(1, Number(e.target.value || 1)) })} />
        </label>
        <label>Rebalancing
          <select value={simOptions.rebalFreq}
                  onChange={(e) => setSimOptions({ rebalFreq: e.target.value as any })}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        <label>Inflation %
          <input type="number" step="0.01" value={(simOptions.inflation * 100)}
                 onChange={(e) => setSimOptions({ inflation: Number(e.target.value) / 100 })} />
        </label>
      </div>
    </div>
  )
}

