import React, { useEffect } from 'react'
import { useApp } from '@state/AppContext'
import { Card, CardContent, FormControl, Grid, InputLabel, MenuItem, Select, Slider, Stack, TextField, Typography } from '@mui/material'

export const ScenarioOptions: React.FC = () => {
  const { simOptions, setSimOptions, snapshot, setSnapshot } = useApp()

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
            <Typography gutterBottom>Years: {simOptions.years}</Typography>
            <Slider min={5} max={60} step={1} value={simOptions.years}
                    onChange={(_, v) => setSimOptions({ years: v as number })} />
          </Grid>
          <Grid item xs={12} md={3}>
            <Typography gutterBottom>Paths: {simOptions.paths.toLocaleString()}</Typography>
            <Slider min={100} max={20000} step={100} value={simOptions.paths}
                    onChange={(_, v) => setSimOptions({ paths: v as number })} />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
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
            <Typography gutterBottom>Inflation: {(simOptions.inflation * 100).toFixed(2)}%</Typography>
            <Slider min={0} max={10} step={0.05} value={simOptions.inflation * 100}
                    onChange={(_, v) => setSimOptions({ inflation: (v as number) / 100 })} />
          </Grid>
        </Grid>

        {snapshot && (
          <Grid container spacing={2} mt={1}>
            <Grid item xs={12} md={3}>
              <TextField type="number" fullWidth label="Current Age"
                         value={snapshot.person?.current_age || ''}
                         onChange={(e) => setSnapshot({ ...snapshot, person: { ...(snapshot.person || {}), current_age: Number(e.target.value) || undefined } })} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField type="number" fullWidth label="Retirement Age"
                         value={snapshot.retirement?.target_age || ''}
                         onChange={(e) => setSnapshot({ ...snapshot, retirement: { ...snapshot.retirement, target_age: Number(e.target.value) || undefined } })} />
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  )
}
