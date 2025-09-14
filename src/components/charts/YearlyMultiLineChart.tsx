import React, { useMemo, useState } from 'react'

const DEFAULT_COLORS = [
  '#7aa2f7','#91d7e3','#a6da95','#f5a97f','#eed49f','#c6a0f6','#f28fad','#e5c07b'
]

export const YearlyMultiLineChart: React.FC<{
  years: number[]
  seriesByKey: Record<string, Array<number | null>>
  width?: number
  height?: number
  title?: string
}> = ({ years, seriesByKey, width = 1000, height = 360, title }) => {
  const keys = Object.keys(seriesByKey)
  const n = years.length
  const flatVals: number[] = []
  for (const k of keys) for (const v of seriesByKey[k]) if (typeof v === 'number' && isFinite(v)) flatVals.push(v)
  const minY = flatVals.length ? Math.min(...flatVals) : 0
  const maxY = flatVals.length ? Math.max(...flatVals) : 1
  // pad range
  const range = maxY - minY || 1
  const yMin = minY - range * 0.05
  const yMax = maxY + range * 0.05

  const colors = useMemo(() => {
    const map: Record<string,string> = {}
    keys.forEach((k, i) => { map[k] = DEFAULT_COLORS[i % DEFAULT_COLORS.length] })
    return map
  }, [keys])

  const padLeft = 64, padBottom = 28, padTop = 22, padRight = 8
  const W = width, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const x = (i: number) => padLeft + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const y = (v: number) => padTop + (yMax > yMin ? innerH - ((v - yMin) / (yMax - yMin)) * innerH : innerH)

  function pathOf(arr: Array<number | null>) {
    let d = ''
    let pen = false
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]
      if (v == null || !isFinite(v as number)) { pen = false; continue }
      const cmd = pen ? 'L' : 'M'
      d += `${cmd} ${x(i)} ${y(v as number)} `
      pen = true
    }
    return d.trim()
  }

  // Compute x-ticks using actual present years to avoid misalignment
  const maxTicks = Math.max(2, Math.min(14, Math.round(innerW / 90)))
  const spanYears = years.length ? (years[years.length - 1] - years[0]) : 0
  const candidates = [1, 2, 5, 10, 20, 25, 50]
  let step = 1
  for (const c of candidates) {
    const ticks = spanYears > 0 ? Math.floor(spanYears / c) + 1 : 1
    if (ticks <= maxTicks) { step = c; break }
    step = c
  }
  const yearToIndex = new Map<number, number>()
  years.forEach((yv, idx) => yearToIndex.set(yv, idx))
  const xTicks: { i: number; label: string }[] = []
  for (let yv = years[0]; yv <= years[years.length - 1]; yv += step) {
    const idx = yearToIndex.get(yv)
    if (idx != null) xTicks.push({ i: idx, label: String(yv) })
  }

  // y ticks
  const yTicks = [] as { v: number; label: string }[]
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const v = yMin + t * (yMax - yMin)
    yTicks.push({ v, label: `${(v * 100).toFixed(0)}%` })
  }

  const [hoverI, setHoverI] = useState<number | null>(null)
  const hover = useMemo(() => {
    if (hoverI == null) return null
    const i = Math.max(0, Math.min(n - 1, hoverI))
    const vals = Object.fromEntries(keys.map(k => [k, seriesByKey[k][i]])) as Record<string, number | null>
    return { i, x: x(i), year: years[i], vals }
  }, [hoverI, years, seriesByKey, n, keys])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}
         onMouseMove={(e) => {
           const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
           const mx = e.clientX - rect.left - padLeft
           const t = Math.max(0, Math.min(1, mx / innerW))
           setHoverI(Math.round(t * (n - 1)))
         }}
         onMouseLeave={() => setHoverI(null)}>
      <rect x={0} y={0} width={W} height={H} fill="#101626" rx={8} />
      {/* Grid */}
      <g stroke="#1f2940" strokeWidth={1} opacity={0.85}>
        {yTicks.map((t, idx) => (<line key={idx} x1={padLeft} x2={W - padRight} y1={y(t.v)} y2={y(t.v)} />))}
        {xTicks.map((t, idx) => (<line key={idx} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} />))}
      </g>
      {/* Axes */}
      <g stroke="#c8d3e6" strokeWidth={1.25}>
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={H - padBottom} />
        <line x1={padLeft} y1={H - padBottom} x2={W - padRight} y2={H - padBottom} />
      </g>
      {/* Series */}
      {keys.map((k) => (
        <path key={k} d={pathOf(seriesByKey[k])} fill="none" stroke={colors[k]} strokeWidth={2} />
      ))}
      {/* Labels */}
      <g fill="#9aa4b2" fontSize={10}>
        {xTicks.map((t, idx) => (<text key={idx} x={x(t.i)} y={H - 6} textAnchor="middle">{t.label}</text>))}
        {yTicks.map((t, idx) => (<text key={idx} x={padLeft - 6} y={y(t.v) + 3} textAnchor="end">{t.label}</text>))}
        <text x={W / 2} y={14} textAnchor="middle" fill="#c8d3e6">{title || 'Yearly Returns by Asset'}</text>
      </g>
      {/* Legend */}
      <g transform={`translate(${W - 220}, ${padTop + 8})`} fontSize={10} fill="#c8d3e6">
        <rect x={0} y={0} width={210} height={keys.length*16 + 16} fill="#0b1020" stroke="#1f2940" rx={6} />
        <g transform="translate(8,6)">
          {keys.map((k, i) => (
            <g key={k} transform={`translate(0, ${i*16})`}>
              <rect width={12} height={8} y={2} fill={colors[k]} />
              <text x={18} y={9}>{k}</text>
            </g>
          ))}
        </g>
      </g>
      {hover && (
        <g>
          <line x1={hover.x} x2={hover.x} y1={padTop} y2={H - padBottom} stroke="#c8d3e6" strokeDasharray="4 3" opacity={0.6} />
          <g transform={`translate(${Math.min(W - 220, hover.x + 8)}, ${padTop + 8})`}>
            <rect width={200} height={keys.length*16 + 24} fill="#0b1020" stroke="#1f2940" rx={6} />
            <text x={8} y={14} fill="#c8d3e6" fontSize={11}>{hover.year}</text>
            {keys.map((k, i) => (
              <text key={k} x={8} y={28 + i*16} fill={colors[k]} fontSize={11}>{k}: {hover.vals[k] == null ? '-' : `${((hover.vals[k] as number)*100).toFixed(1)}%`}</text>
            ))}
          </g>
        </g>
      )}
    </svg>
  )
}
