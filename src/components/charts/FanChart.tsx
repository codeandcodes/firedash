import React, { useMemo, useState } from 'react'

function formatCurrency(n: number) {
  return `$${Math.round(n).toLocaleString()}`
}

export interface FanChartProps {
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
  width?: number
  height?: number
  years?: number
  title?: string
  startYear?: number
}

export const FanChart: React.FC<FanChartProps> = ({ p10, p25, p50, p75, p90, width = 800, height = 300, years, title, startYear }) => {
  const months = p50.length
  const maxY = Math.max(...p90)
  const padLeft = 48
  const padBottom = 28
  const padTop = 18
  const padRight = 8
  const W = width, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const x = (i: number) => padLeft + (i / Math.max(1, months - 1)) * innerW
  const y = (v: number) => padTop + (maxY ? innerH - (v / maxY) * innerH : innerH)

  const areaPath = (upper: number[], lower: number[]) => {
    const up = upper.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
    const lo = lower.slice().reverse().map((v, j) => `L ${x(months - 1 - j)} ${y(v)}`).join(' ')
    return `${up} ${lo} Z`
  }
  const linePath = (series: number[]) => series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')

  const maxLabel = formatCurrency(maxY)

  const [hoverI, setHoverI] = useState<number | null>(null)
  const hover = useMemo(() => {
    if (hoverI == null) return null
    const i = Math.max(0, Math.min(months - 1, hoverI))
    return { i, x: x(i), y: y(p50[i]), v: p50[i] }
  }, [hoverI, months, p50])

  const yearsCount = years ?? Math.max(1, Math.round(months / 12))
  const xTicks = new Array(yearsCount + 1).fill(0).map((_, i) => ({ i: Math.min(months - 1, Math.round((i / yearsCount) * (months - 1))), label: startYear ? String(startYear + i) : String(i) }))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: t * maxY, label: formatCurrency(t * maxY) }))

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

      {/* Gridlines */}
      <g stroke="#1f2940" strokeWidth={1} opacity={0.9}>
        {yTicks.map((t, idx) => (
          <line key={idx} x1={padLeft} x2={W - padRight} y1={y(t.v)} y2={y(t.v)} />
        ))}
        {xTicks.map((t, idx) => (
          <line key={idx} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} />
        ))}
      </g>

      <g>
        <path d={areaPath(p90, p10)} fill="#7aa2f733" stroke="none" />
        <path d={areaPath(p75, p25)} fill="#7aa2f755" stroke="none" />
        <path d={linePath(p50)} fill="none" stroke="#7aa2f7" strokeWidth={2} />
      </g>

      {/* Axes labels and legend */}
      <g fill="#9aa4b2" fontSize="10">
        <text x={4} y={padTop + 10}>{maxLabel}</text>
        <text x={4} y={H - 8}>0</text>
        {xTicks.map((t, idx) => (
          <text key={idx} x={x(t.i)} y={H - 6} textAnchor="middle">{t.label}</text>
        ))}
        {title && <text x={W / 2} y={14} textAnchor="middle" fill="#c8d3e6">{title}</text>}
      </g>

      {/* Legend */}
      <g transform={`translate(${W - 220}, ${padTop + 8})`} fontSize={10} fill="#c8d3e6">
        <rect x={0} y={0} width={210} height={44} fill="#0b1020" stroke="#1f2940" rx={6} />
        <g transform="translate(8,6)">
          <rect width={14} height={6} y={2} fill="#7aa2f733" />
          <text x={20} y={8}>P10–P90</text>
          <rect width={14} height={6} y={18} fill="#7aa2f755" />
          <text x={20} y={24}>P25–P75</text>
          <line x1={2} x2={16} y1={34} y2={34} stroke="#7aa2f7" strokeWidth={2} />
          <text x={20} y={36}>Median</text>
        </g>
      </g>

      {/* Tooltip */}
      {hover && (
        <g>
          <line x1={hover.x} x2={hover.x} y1={padTop} y2={H - padBottom} stroke="#7aa2f7" strokeDasharray="4 3" opacity={0.6} />
          <circle cx={hover.x} cy={hover.y} r={3} fill="#7aa2f7" />
          <g transform={`translate(${Math.min(W - 180, hover.x + 8)}, ${Math.max(padTop + 8, hover.y - 10)})`}>
            <rect width={160} height={64} fill="#0b1020" stroke="#1f2940" rx={6} />
            <text x={8} y={14} fill="#c8d3e6" fontSize={11}>Month {hover.i} ({Math.round(hover.i/12)}y)</text>
            <text x={8} y={30} fill="#9aa4b2" fontSize={11}>Median: {formatCurrency(p50[hover.i])}</text>
            <text x={8} y={46} fill="#9aa4b2" fontSize={11}>P25/P75: {formatCurrency(p25[hover.i])} / {formatCurrency(p75[hover.i])}</text>
          </g>
        </g>
      )}
    </svg>
  )
}
