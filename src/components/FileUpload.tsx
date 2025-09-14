import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@state/AppContext'
import { resultsKey, scenariosKey, saveCache } from '@state/cache'
import { validateSnapshot } from '@types/schema'
import { Box, Button, Typography } from '@mui/material'

export const FileUpload: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const { setSnapshot, simOptions } = useApp() as any
  const navigate = useNavigate()

  async function onFileSelected(file: File) {
    setErrors([])
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const res = validateSnapshot(json)
      if (!res.valid) {
        setErrors(res.errors || ['Invalid file'])
        return
      }
      setSnapshot(json)
      // Start processing immediately: navigate to results
      navigate('/results')
      // Optionally kick off background scenarios precompute (best-effort)
      try {
        const targets = [
          { label: `Optimistic (50%)`, success: 0.5 },
          { label: `Realistic (75%)`, success: 0.75 },
          { label: `Conservative (90%)`, success: 0.90 }
        ]
        const keySc = scenariosKey(json, {
          years: simOptions.years,
          inflation: simOptions.inflation,
          rebalFreq: simOptions.rebalFreq,
          mcMode: simOptions.mcMode,
          bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
          bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
        }, targets, 400)
        // Trigger workers to compute and cache
        targets.forEach((t) => {
          const w = new Worker(new URL('../workers/spendWorker.ts', import.meta.url), { type: 'module' })
          const total = (json.accounts||[]).reduce((s: number, a: any)=> s + (a.balance||0), 0)
          const base = json.retirement?.expected_spend_monthly || Math.max(total * 0.04 / 12, total / ((simOptions.years||40)*12))
          const lo = Math.max(0, base / 4), hi = Math.max(1000, base * 4)
          w.onmessage = (e: MessageEvent<any>) => {
            if (e.data?.type === 'done') {
              const prev = (loadCache(keySc) as any) || {}
              prev[e.data.result.label] = { monthly: e.data.result.monthly, success: e.data.result.success }
              saveCache(keySc, prev)
              w.terminate()
            } else if (e.data?.type === 'error') {
              w.terminate()
            }
          }
          w.postMessage({ snapshot: json, options: {
            years: simOptions.years,
            inflation: simOptions.inflation,
            rebalFreq: simOptions.rebalFreq,
            mcMode: simOptions.mcMode,
            bootstrapBlockMonths: simOptions.bootstrapBlockMonths,
            bootstrapNoiseSigma: simOptions.bootstrapNoiseSigma
          }, target: t, pathsPerEval: 300, maxIter: 10, lowerBoundMonthly: lo, upperBoundMonthly: hi })
        })
      } catch {}
    } catch (e: any) {
      setErrors([`Failed to parse: ${e.message}`])
    }
  }

  const [dragOver, setDragOver] = useState(false)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFileSelected(f)
        }}
      />
      <Box onClick={() => inputRef.current?.click()}
           onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
           onDragLeave={() => setDragOver(false)}
           onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFileSelected(f) }}
           sx={{
             p: 3,
             border: '2px dashed',
             borderColor: dragOver ? 'primary.main' : 'divider',
             borderRadius: 2,
             textAlign: 'center',
             cursor: 'pointer'
           }}>
        <Typography>Drag & drop JSON here, or click to select</Typography>
        <Button sx={{ mt: 1 }} variant="outlined">Choose File</Button>
      </Box>
      {errors.length > 0 && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid', borderColor: 'error.dark', bgcolor: 'error.dark', opacity: 0.9 }}>
          <Typography variant="subtitle2">Validation errors</Typography>
          <ul>
            {errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </Box>
      )}
    </>
  )
}
