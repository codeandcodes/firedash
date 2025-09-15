import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@state/AppContext'
import { Card, CardContent, FormControl, Grid, InputLabel, MenuItem, Select, Slider, Stack, TextField, Typography, Tooltip } from '@mui/material'

export const ScenarioOptions: React.FC = () => {
  const { simOptions, setSimOptions, snapshot, setSnapshot } = useApp()
  const [yearsLocal, setYearsLocal] = useState(simOptions.years)
  const [pathsLocal, setPathsLocal] = useState(simOptions.paths)
  const [inflLocal, setInflLocal] = useState(simOptions.inflation)
  const [workersLocal, setWorkersLocal] = useState(simOptions.maxWorkers)
  const debounceRef = useRef<number | null>(null)
  function commitDebounced(fn: () => void) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => { fn(); debounceRef.current = null }, 200)
  }

  // Initialize defaults from snapshot assumptions if present
  useEffect(() => {
    if (!snapshot) return
    const infl = snapshot.assumptions?.inflation_pct
    const reb = snapshot.assumptions?.rebalancing?.frequency
    setSimOptions({ inflation: typeof infl === 'number' ? infl : undefined, rebalFreq: reb })
  }, [snapshot])

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">Scenario Options</Typography>
        <Grid container spacing={2} mt={1}>
          <Grid item xs={12} md={3}>
            <Tooltip title="Simulation horizon (years)">
              <Typography gutterBottom>Years: {yearsLocal}</Typography>
            </Tooltip>
            <Slider min={5} max={60} step={1} value={yearsLocal}
                    onChange={(_, v) => setYearsLocal(v as number)}
                    onChangeCommitted={(_, v) => setSimOptions({ years: v as number })} />
          </Grid>
          <Grid item xs={12} md={3}>
            <Tooltip title="Monte Carlo paths (more = smoother percentiles, slower)">
              <Typography gutterBottom>Paths: {pathsLocal.toLocaleString()}</Typography>
            </Tooltip>
            <Slider min={100} max={20000} step={100} value={pathsLocal}
                    onChange={(_, v) => setPathsLocal(v as number)}
                    onChangeCommitted={(_, v) => setSimOptions({ paths: v as number })} />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth title="How frequently to rebalance towards target allocation">
              <InputLabel id="rebal-label">Rebalancing</InputLabel>
              <Select labelId="rebal-label" label="Rebalancing" value={simOptions.rebalFreq}
                      onChange={(e) => setSimOptions({ rebalFreq: e.target.value as any })}>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="quarterly">Quarterly</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Tooltip title="Annual inflation assumption used for real spending and SS adjustments">
              <Typography gutterBottom>Inflation: {(inflLocal * 100).toFixed(2)}%</Typography>
            </Tooltip>
            <Slider min={0} max={10} step={0.05} value={inflLocal * 100}
                    onChange={(_, v) => setInflLocal((v as number)/100)}
                    onChangeCommitted={(_, v) => setSimOptions({ inflation: (v as number) / 100 })} />
          </Grid>
          <Grid item xs={12} md={3}>
            <Tooltip title="Parallel workers for MC runs (limited by CPU cores)">
              <Typography gutterBottom>Max Workers: {workersLocal}</Typography>
            </Tooltip>
            <Slider min={1} max={8} step={1} value={workersLocal}
                    onChange={(_, v) => setWorkersLocal(v as number)}
                    onChangeCommitted={(_, v) => setSimOptions({ maxWorkers: v as number })} />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth title="Monte Carlo engine: bootstrap samples historical returns, regime simulates market regimes, GBM uses geometric Brownian motion">
              <InputLabel id="mc-label">MC Mode</InputLabel>
              <Select labelId="mc-label" label="MC Mode" value={simOptions.mcMode}
                      onChange={(e) => setSimOptions({ mcMode: e.target.value as any })}>
                <MenuItem value="bootstrap">Bootstrap (historical)</MenuItem>
                <MenuItem value="regime">Regime</MenuItem>
                <MenuItem value="gbm">GBM</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {simOptions.mcMode === 'bootstrap' && (
            <>
              <Grid item xs={12} md={3}>
                <Tooltip title="Sampling block length to preserve multi-month patterns">
                  <Typography gutterBottom>Block (months): {simOptions.bootstrapBlockMonths}</Typography>
                </Tooltip>
                <Slider min={6} max={60} step={1} value={simOptions.bootstrapBlockMonths}
                        onChange={(_, v) => setSimOptions({ bootstrapBlockMonths: v as number })} />
              </Grid>
              <Grid item xs={12} md={3}>
                <Tooltip title="Extra random noise added to sampled returns">
                  <Typography gutterBottom>Noise σ: {simOptions.bootstrapNoiseSigma.toFixed(3)}</Typography>
                </Tooltip>
                <Slider min={0} max={0.03} step={0.001} value={simOptions.bootstrapNoiseSigma}
                        onChange={(_, v) => setSimOptions({ bootstrapNoiseSigma: v as number })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography color="text.secondary">Place historical data at <code>data/historical_returns.json</code> (see example file).</Typography>
              </Grid>
            </>
          )}
        </Grid>

        {snapshot && (
          <Grid container spacing={2} mt={1}>
            <Grid item xs={12} md={3}>
              <Tooltip title="Used to compute retirement start and SS start timing">
                <TextField type="number" fullWidth label="Current Age"
                         value={snapshot.person?.current_age || ''}
                         onChange={(e) => setSnapshot({ ...snapshot, person: { ...(snapshot.person || {}), current_age: Number(e.target.value) || undefined } })} />
              </Tooltip>
            </Grid>
            <Grid item xs={12} md={3}>
              <Tooltip title="Year when retirement begins (used for spend and chart markers)">
                <TextField type="number" fullWidth label="Retirement Age"
                         value={snapshot.retirement?.target_age || ''}
                         onChange={(e) => setSnapshot({ ...snapshot, retirement: { ...snapshot.retirement, target_age: Number(e.target.value) || undefined } })} />
              </Tooltip>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  )
}
/*
Scenario Options panel.
- Controls years, paths, rebalancing, inflation, and MC mode.
- Bootstrap mode exposes Block (months) and Noise σ controls (currently wired via window for minimal plumbing).
*/
