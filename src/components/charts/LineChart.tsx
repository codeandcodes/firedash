import React, { useMemo, useState } from 'react'

export const LineChart: React.FC<{ series: number[]; width?: number; height?: number; color?: string; label?: string; years?: number; startYear?: number }> = ({ series, width = 800, height = 240, color = '#a6da95', label, years, startYear }) => {
  const maxY = Math.max(...series)
  const padLeft = 48
  const padBottom = 28
  const padTop = 18
  const padRight = 8
  const W = width, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const months = series.length
  const x = (i: number) => padLeft + (i / Math.max(1, months - 1)) * innerW
  const y = (v: number) => padTop + (maxY ? innerH - (v / maxY) * innerH : innerH)
  const path = series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')

  const [hoverI, setHoverI] = useState<number | null>(null)
  const hover = useMemo(() => {
    if (hoverI == null) return null
    const i = Math.max(0, Math.min(months - 1, hoverI))
    return { i, x: x(i), y: y(series[i]), v: series[i] }
  }, [hoverI, months, series])

  const yearsCount = years ?? Math.max(1, Math.round(months / 12))
  const xTicks = new Array(yearsCount + 1).fill(0).map((_, i) => ({ i: Math.min(months - 1, Math.round((i / yearsCount) * (months - 1))), label: startYear ? String(startYear + i) : String(i) }))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: t * maxY, label: `$${Math.round(t * maxY).toLocaleString()}` }))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}
         onMouseMove={(e) => {
           const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
           const mx = e.clientX - rect.left - padLeft
           const t = Math.max(0, Math.min(1, mx / innerW))
           setHoverI(Math.round(t * (months - 1)))
         }}
         onMouseLeave={() => setHoverI(null)}>
      <rect x={0} y={0} width={W} height={H} fill="#101626" rx={8} />
      <g stroke="#1f2940" strokeWidth={1} opacity={0.9}>
        {yTicks.map((t, idx) => (<line key={idx} x1={padLeft} x2={W - padRight} y1={y(t.v)} y2={y(t.v)} />))}
        {xTicks.map((t, idx) => (<line key={idx} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} />))}
      </g>
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      <g fill="#9aa4b2" fontSize="10">
        {xTicks.map((t, idx) => (<text key={idx} x={x(t.i)} y={H - 6} textAnchor="middle">{t.label}</text>))}
        <text x={W / 2} y={14} textAnchor="middle" fill="#c8d3e6">{label || 'Balance over time'}</text>
      </g>
      {hover && (
        <g>
          <line x1={hover.x} x2={hover.x} y1={padTop} y2={H - padBottom} stroke={color} strokeDasharray="4 3" opacity={0.6} />
          <circle cx={hover.x} cy={hover.y} r={3} fill={color} />
          <g transform={`translate(${Math.min(W - 180, hover.x + 8)}, ${Math.max(padTop + 8, hover.y - 10)})`}>
            <rect width={160} height={48} fill="#0b1020" stroke="#1f2940" rx={6} />
            <text x={8} y={16} fill="#c8d3e6" fontSize={11}>Month {hover.i} ({Math.round(hover.i/12)}y)</text>
            <text x={8} y={32} fill="#9aa4b2" fontSize={11}>Value: ${Math.round(hover.v).toLocaleString()}</text>
          </g>
        </g>
      )}
    </svg>
  )
}
