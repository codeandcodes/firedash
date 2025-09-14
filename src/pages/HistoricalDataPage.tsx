import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoricalDataset, HistoricalMonthRow } from '@types/historical'
import { Card, CardContent, Typography, Box, Button, Stack, Chip, ToggleButton, ToggleButtonGroup, FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText } from '@mui/material'
import { saveHistoricalDataset, getHistoricalDataset, clearHistoricalDataset } from '@state/histdb'
import { MultiLineChart } from '@components/charts/MultiLineChart'
import { YearlyMultiLineChart } from '@components/charts/YearlyMultiLineChart'
import { setHistoricalOverride } from '@engine/historical'
import { HistoricalStatsPanel } from '@components/HistoricalStatsPanel'

function validateHistorical(ds: any): ds is HistoricalDataset {
  if (!ds || !Array.isArray(ds.rows)) return false
  for (const r of ds.rows) {
    if (typeof r.year !== 'number' || typeof r.month !== 'number' || !r.returns || typeof r.returns !== 'object') return false
  }
  return true
}

function monthSpan(rows: HistoricalMonthRow[]) {
  if (!rows.length) return { count: 0, start: undefined as any, end: undefined as any }
  const sorted = rows.slice().sort((a,b) => a.year === b.year ? a.month - b.month : a.year - b.year)
  const start = { year: sorted[0].year, month: sorted[0].month }
  const end = { year: sorted[sorted.length-1].year, month: sorted[sorted.length-1].month }
  return { count: sorted.length, start, end }
}

export function HistoricalDataPage() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [dataset, setDataset] = useState<HistoricalDataset | null>(null)
  const [viewMode, setViewMode] = useState<'yearly' | 'cumulative'>('yearly')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  useEffect(() => {
    // Load from IndexedDB on mount
    ;(async () => {
      const ds = await getHistoricalDataset()
      if (ds) {
        setDataset(ds)
        setHistoricalOverride(ds)
        // initialize keys after load
        const ks = Array.from(new Set(ds.rows.flatMap(r => Object.keys(r.returns || {}))))
        setSelectedKeys(ks)
      }
    })()
  }, [])

  async function onFileSelected(file: File) {
    setErrors([])
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (!validateHistorical(json)) {
        setErrors(['Invalid historical dataset format. Expect { rows: [{ year, month, returns: {...} }] }'])
        return
      }
      await saveHistoricalDataset(json)
      setHistoricalOverride(json)
      setDataset(json)
    } catch (e: any) {
      setErrors([`Failed to parse: ${e.message}`])
    }
  }

  const summary = useMemo(() => (dataset ? monthSpan(dataset.rows) : null), [dataset])
  const startYear = dataset?.rows?.length ? Math.min(...dataset.rows.map(r => r.year)) : undefined
  const allKeys = useMemo(() => dataset ? Array.from(new Set(dataset.rows.flatMap(r => Object.keys(r.returns || {})))) : [], [dataset])

  // Build yearly returns per asset (requires 12 months)
  const yearly = useMemo(() => {
    if (!dataset) return null
    const rows = dataset.rows.slice().sort((a,b) => a.year === b.year ? a.month - b.month : a.year - b.year)
    const keysSet = new Set<string>()
    for (const r of rows) for (const k of Object.keys(r.returns || {})) keysSet.add(k)
    const keys = Array.from(keysSet)
    const years = Array.from(new Set(rows.map(r => r.year))).sort((a,b)=>a-b)
    const grouped = new Map<number, HistoricalMonthRow[]>()
    for (const y of years) grouped.set(y, [])
    for (const r of rows) grouped.get(r.year)!.push(r)
    const seriesByKey: Record<string, Array<number|null>> = {}
    keys.forEach(k => seriesByKey[k] = [])
    for (const y of years) {
      const group = grouped.get(y)!
      // Check we have 12 months
      if (group.length < 12) {
        keys.forEach(k => seriesByKey[k].push(null))
        continue
      }
      const byKey = new Map<string, number>()
      keys.forEach(k => byKey.set(k, 1))
      for (const m of group) {
        for (const k of keys) {
          const rr = (m.returns as any)[k]
          const r = typeof rr === 'number' ? rr : 0
          byKey.set(k, (byKey.get(k)! * (1 + r)))
        }
      }
      for (const k of keys) {
        const idx = (byKey.get(k)! - 1)
        seriesByKey[k].push(idx)
      }
    }
    return { years, seriesByKey }
  }, [dataset])

  // Build per-asset cumulative index (start 1.0)
  const cumulative = useMemo(() => {
    if (!dataset) return null
    const rows = dataset.rows.slice().sort((a,b) => a.year === b.year ? a.month - b.month : a.year - b.year)
    const keysSet = new Set<string>()
    for (const r of rows) for (const k of Object.keys(r.returns || {})) keysSet.add(k)
    const keys = Array.from(keysSet)
    const byKey: Record<string, number[]> = {}
    const accum: Record<string, number> = {}
    keys.forEach(k => { byKey[k] = []; accum[k] = 1 })
    for (const r of rows) {
      for (const k of keys) {
        const ret = (r.returns as any)[k]
        const rr = typeof ret === 'number' ? ret : 0
        accum[k] *= (1 + rr)
        byKey[k].push(accum[k])
      }
    }
    return byKey
  }, [dataset])

  return (
    <section>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>Historical Data</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Upload monthly historical returns JSON and persist in your browser. Monte Carlo bootstrap will use this data.</Typography>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f) }}
          />
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => inputRef.current?.click()}>Select File</Button>
            {dataset && <Button variant="text" color="error" onClick={async () => { await clearHistoricalDataset(); setDataset(null); setHistoricalOverride(null) }}>Clear</Button>}
          </Stack>
          {errors.length > 0 && (
            <Box sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid', borderColor: 'error.dark', bgcolor: 'error.dark', opacity: 0.9 }}>
              <Typography variant="subtitle2">Errors</Typography>
              <ul>{errors.map((er, i) => (<li key={i}>{er}</li>))}</ul>
            </Box>
          )}
          {dataset && summary && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Dataset Loaded</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Chip label={`${summary.count} months`} />
                <Chip label={`From ${summary.start.year}-${String(summary.start.month).padStart(2,'0')} to ${summary.end.year}-${String(summary.end.month).padStart(2,'0')}`} />
                {dataset.meta?.source && <Chip label={`Source: ${dataset.meta.source}`} />}
              </Stack>
              {/* Controls: view mode and asset filter */}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2, alignItems: 'center' }}>
                <ToggleButtonGroup exclusive value={viewMode} onChange={(_, v) => v && setViewMode(v)} size="small">
                  <ToggleButton value="yearly">Yearly</ToggleButton>
                  <ToggleButton value="cumulative">Cumulative</ToggleButton>
                </ToggleButtonGroup>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel id="asset-filter-label">Assets</InputLabel>
                  <Select labelId="asset-filter-label" multiple label="Assets" value={selectedKeys}
                          onChange={(e) => setSelectedKeys(typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as string[]))}
                          renderValue={(sel) => sel.join(', ')}>
                    {allKeys.map(k => (
                      <MenuItem key={k} value={k}>
                        <Checkbox checked={selectedKeys.indexOf(k) > -1} />
                        <ListItemText primary={k} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button size="small" onClick={() => setSelectedKeys(allKeys)}>Select All</Button>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {dataset && viewMode === 'yearly' && yearly && (
        <>
          <Typography variant="h6" gutterBottom>Yearly Returns</Typography>
          <YearlyMultiLineChart years={yearly.years} seriesByKey={Object.fromEntries(Object.entries(yearly.seriesByKey).filter(([k]) => selectedKeys.includes(k)))} title="Yearly Returns by Asset" />
          <HistoricalStatsPanel dataset={dataset} />
        </>
      )}
      {dataset && viewMode === 'cumulative' && cumulative && (
        <>
          <Typography variant="h6" gutterBottom>Cumulative Performance (index = 1.0)</Typography>
          <MultiLineChart seriesByKey={Object.fromEntries(Object.entries(cumulative).filter(([k]) => selectedKeys.includes(k)))} years={Math.round(Object.values(cumulative)[0].length/12)} startYear={startYear} title="Cumulative Index by Asset" />
          <HistoricalStatsPanel dataset={dataset} />
        </>
      )}
    </section>
  )
}
