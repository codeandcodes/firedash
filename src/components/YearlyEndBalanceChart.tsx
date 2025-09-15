import React, { useMemo, useState } from 'react'

function fmtShort(n: number) {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e9) return sign + '$' + (a/1e9).toFixed(1) + 'B'
  if (a >= 1e6) return sign + '$' + (a/1e6).toFixed(1) + 'M'
  if (a >= 1e3) return sign + '$' + (a/1e3).toFixed(1) + 'K'
  return sign + '$' + Math.round(a).toString()
}

const COLORS: Record<string,string> = {
  Conservative: '#f28fad',
  Normal: '#a6da95',
  Optimistic: '#7aa2f7'
}

export const YearlyEndBalanceChart: React.FC<{
  years: number[]
  seriesByKey: Record<'Conservative'|'Normal'|'Optimistic', number[]>
  width?: number
  height?: number
  title?: string
}> = ({ years, seriesByKey, width = 1000, height = 320, title = 'Year-end Balances' }) => {
  const keys = Object.keys(seriesByKey) as Array<'Conservative'|'Normal'|'Optimistic'>
  const n = years.length
  const flatVals: number[] = []
  for (const k of keys) for (const v of seriesByKey[k]) if (isFinite(v)) flatVals.push(v)
  const minY = flatVals.length ? Math.min(...flatVals) : 0
  const maxY = flatVals.length ? Math.max(...flatVals) : 1
  const range = maxY - minY || 1
  const yMin = Math.max(0, minY - range * 0.05)
  const yMax = maxY + range * 0.05

  const padLeft = 64, padBottom = 28, padTop = 22, padRight = 8
  const W = width, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const x = (i: number) => padLeft + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const y = (v: number) => padTop + (yMax > yMin ? innerH - ((v - yMin) / (yMax - yMin)) * innerH : innerH)

  function pathOf(arr: number[]) {
    return arr.map((v, i) => `${i===0?'M':'L'} ${x(i)} ${y(v)}`).join(' ')
  }

  // x-ticks from years
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

  // y ticks in currency
  const yTicks = [] as { v: number; label: string }[]
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const v = yMin + t * (yMax - yMin)
    yTicks.push({ v, label: fmtShort(v) })
  }
  const minorYTicks = (() => {
    const arr: { v: number; label: string }[] = []
    for (let k = 0; k < 5 - 1; k++) {
      const v1 = yTicks[k].v, v2 = yTicks[k+1].v
      const mid = (v1 + v2) / 2
      arr.push({ v: mid, label: fmtShort(mid) })
    }
    return arr
  })()
  const minorXTicks = (() => {
    const arr: { i: number; label: string }[] = []
    for (let k = 0; k < xTicks.length - 1; k++) {
      const i1 = xTicks[k].i, i2 = xTicks[k+1].i
      const mid = Math.round((i1 + i2) / 2)
      const y1 = Number(xTicks[k].label), y2 = Number(xTicks[k+1].label)
      const label = (!isNaN(y1) && !isNaN(y2)) ? String(Math.round((y1 + y2)/2)) : ''
      arr.push({ i: mid, label })
    }
    return arr
  })()

  const [hoverI, setHoverI] = useState<number | null>(null)
  const hover = useMemo(() => {
    if (hoverI == null) return null
    const i = Math.max(0, Math.min(n - 1, hoverI))
    const vals = Object.fromEntries(keys.map(k => [k, seriesByKey[k][i]])) as Record<string, number>
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
      <g stroke="#1f2940" strokeWidth={1} opacity={0.85}>
        {yTicks.map((t, idx) => (<line key={idx} x1={padLeft} x2={W - padRight} y1={y(t.v)} y2={y(t.v)} />))}
        {xTicks.map((t, idx) => (<line key={idx} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} />))}
        {minorYTicks.map((t, idx) => (<line key={`my${idx}`} x1={padLeft} x2={W - padRight} y1={y(t.v)} y2={y(t.v)} opacity={0.4} />))}
        {minorXTicks.map((t, idx) => (<line key={`mx${idx}`} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} opacity={0.4} />))}
      </g>
      <g stroke="#c8d3e6" strokeWidth={1.25}>
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={H - padBottom} />
        <line x1={padLeft} y1={H - padBottom} x2={W - padRight} y2={H - padBottom} />
      </g>
      {keys.map((k) => (
        <path key={k} d={pathOf(seriesByKey[k])} fill="none" stroke={COLORS[k]} strokeWidth={2} />
      ))}
      <g fill="#9aa4b2" fontSize={11}>
        <text x={W/2} y={H - 2} textAnchor="middle">Year</text>
        <text transform={`translate(12 ${H/2}) rotate(-90)`} textAnchor="middle">Balance</text>
      </g>
      <g fill="#9aa4b2" fontSize={10}>
        {xTicks.map((t, idx) => (<text key={idx} x={x(t.i)} y={H - 6} textAnchor="middle">{t.label}</text>))}
        {minorXTicks.map((t, idx) => (<text key={`mxl${idx}`} x={x(t.i)} y={H - 6} textAnchor="middle" opacity={0.6} fontSize={9}>{t.label}</text>))}
        {yTicks.map((t, idx) => (<text key={idx} x={padLeft - 6} y={y(t.v) + 3} textAnchor="end">{t.label}</text>))}
        {minorYTicks.map((t, idx) => (<text key={`myl${idx}`} x={padLeft - 6} y={y(t.v) + 3} textAnchor="end" opacity={0.6} fontSize={9}>{t.label}</text>))}
        <text x={W / 2} y={14} textAnchor="middle" fill="#c8d3e6">{title}</text>
      </g>
      {/* Legend */}
      <g transform={`translate(${W - 260}, ${padTop + 8})`} fontSize={10} fill="#c8d3e6">
        <rect x={0} y={0} width={250} height={keys.length*16 + 16} fill="#0b1020" stroke="#1f2940" rx={6} />
        <g transform="translate(8,6)">
          {keys.map((k, i) => (
            <g key={k} transform={`translate(0, ${i*16})`}>
              <rect width={12} height={8} y={2} fill={COLORS[k]} />
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
              <text key={k} x={8} y={28 + i*16} fill={COLORS[k]} fontSize={11}>{k}: {fmtShort(hover.vals[k])}</text>
            ))}
          </g>
        </g>
      )}
    </svg>
  )
}

