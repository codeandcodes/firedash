import React, { useMemo, useState } from 'react'

function formatCurrency(n: number) {
  return `$${Math.round(n).toLocaleString()}`
}
function formatAbbrev(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n/1e9).toFixed(1).replace(/\.0$/,'')}B`
  if (abs >= 1e6) return `$${(n/1e6).toFixed(1).replace(/\.0$/,'')}M`
  if (abs >= 1e3) return `$${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`
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
  retAt?: number
  xLabel?: string
  yLabel?: string
  highlight?: 'p10'|'p25'|'p50'|'p75'|'p90'
}

export const FanChart: React.FC<FanChartProps> = ({ p10, p25, p50, p75, p90, width = 800, height = 300, years, title, startYear, retAt, xLabel = 'Year', yLabel = 'Balance ($)', highlight = 'p50' }) => {
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
  const maxTicks = Math.max(2, Math.min(10, Math.round(innerW / 80)))
  const step = Math.max(1, Math.ceil(yearsCount / maxTicks))
  const ticksArr = [] as { i: number; label: string }[]
  for (let yi = 0; yi <= yearsCount; yi += step) {
    const xi = Math.min(months - 1, Math.round((yi / yearsCount) * (months - 1)))
    ticksArr.push({ i: xi, label: startYear ? String(startYear + yi) : String(yi) })
  }
  const xTicks = ticksArr
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: t * maxY, label: formatAbbrev(t * maxY) }))
  const minorYTicks = (() => {
    const arr: { v: number; label: string }[] = []
    for (let k = 0; k < 5 - 1; k++) {
      const v1 = yTicks[k].v, v2 = yTicks[k+1].v
      const mid = (v1 + v2) / 2
      arr.push({ v: mid, label: formatCurrency(mid) })
    }
    return arr
  })()
  const monthAbbrev = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const minorXTicks = (() => {
    const arr: { i: number; label: string }[] = []
    for (let k = 0; k < xTicks.length - 1; k++) {
      const i1 = xTicks[k].i, i2 = xTicks[k+1].i
      const mid = Math.round((i1 + i2) / 2)
      let label = ''
      if (startYear != null) {
        const year = startYear + Math.floor(mid/12)
        const mon = monthAbbrev[mid % 12]
        label = `${mon} ${year}`
      }
      arr.push({ i: mid, label })
    }
    return arr
  })()

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}
         onMouseMove={(e) => {
           const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
           const mx = e.clientX - rect.left - padLeft
           const t = Math.max(0, Math.min(1, mx / innerW))
           setHoverI(Math.round(t * (months - 1)))
         }}
         onMouseLeave={() => setHoverI(null)}>
      <rect x={0} y={0} width={W} height={H} fill="#FFFFFF" rx={8} />

      {/* Gridlines */}
      <g stroke="#E5E7EB" strokeWidth={1} opacity={1}>
        {yTicks.map((t, idx) => (
          <line key={idx} x1={padLeft} x2={W - padRight} y1={y(t.v)} y2={y(t.v)} />
        ))}
        {xTicks.map((t, idx) => (
          <line key={idx} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} />
        ))}
        {minorYTicks.map((t, idx) => (<line key={`my${idx}`} x1={padLeft} x2={W - padRight} y1={y(t.v)} y2={y(t.v)} opacity={0.4} />))}
        {minorXTicks.map((t, idx) => (<line key={`mx${idx}`} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} opacity={0.4} />))}
      </g>

      <g>
        <path d={areaPath(p90, p10)} fill="#4F7BFF22" stroke="none" />
        <path d={areaPath(p75, p25)} fill="#4F7BFF44" stroke="none" />
        {/* Base median line (subtle) */}
        <path d={linePath(p50)} fill="none" stroke="#93C5FD" strokeWidth={1.5} />
        {/* Highlight selected percentile */}
        {(() => {
          const series = highlight === 'p10' ? p10 : highlight === 'p25' ? p25 : highlight === 'p75' ? p75 : highlight === 'p90' ? p90 : p50
          const color = '#2563EB'
          const widthHL = 3
          return <path d={linePath(series)} fill="none" stroke={color} strokeWidth={widthHL} />
        })()}
      </g>

      {/* Retirement marker */}
      {typeof retAt === 'number' && retAt >= 0 && (
        <g>
          <line x1={x(Math.min(months-1, retAt))} x2={x(Math.min(months-1, retAt))} y1={padTop} y2={H - padBottom} stroke="#F59E0B" strokeDasharray="6 3" />
          <text x={x(Math.min(months-1, retAt)) + 6} y={padTop + 12} fill="#F59E0B" fontSize={10}>Retirement</text>
        </g>
      )}

      {/* Axes labels and legend */}
      <g fill="#6B7280" fontSize="10">
        <text x={4} y={padTop + 10}>{maxLabel}</text>
        <text x={4} y={H - 8}>0</text>
        {xTicks.map((t, idx) => (<text key={idx} x={x(t.i)} y={H - 6} textAnchor="middle">{t.label}</text>))}
        {minorXTicks.map((t, idx) => (<text key={`mxl${idx}`} x={x(t.i)} y={H - 6} textAnchor="middle" opacity={0.6} fontSize={9}>{t.label}</text>))}
        {title && <text x={W / 2} y={14} textAnchor="middle" fill="#334155">{title}</text>}
      </g>
      {/* Axis titles */}
      <g fill="#6B7280" fontSize={11}>
        <text x={W/2} y={H - 2} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(12 ${H/2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
      </g>

      {/* Legend */}
      <g transform={`translate(${W - 220}, ${padTop + 8})`} fontSize={10} fill="#334155">
        <rect x={0} y={0} width={210} height={44} fill="#FFFFFF" stroke="#E5E7EB" rx={6} />
        <g transform="translate(8,6)">
          <rect width={14} height={6} y={2} fill="#4F7BFF22" />
          <text x={20} y={8}>P10–P90</text>
          <rect width={14} height={6} y={18} fill="#4F7BFF44" />
          <text x={20} y={24}>P25–P75</text>
          <line x1={2} x2={16} y1={34} y2={34} stroke="#4F7BFF" strokeWidth={2} />
          <text x={20} y={36}>Median</text>
        </g>
      </g>

      {/* Tooltip */}
      {hover && (
        <g>
          <line x1={hover.x} x2={hover.x} y1={padTop} y2={H - padBottom} stroke="#4F7BFF" strokeDasharray="4 3" opacity={0.6} />
          <circle cx={hover.x} cy={hover.y} r={3} fill="#4F7BFF" />
          <g transform={`translate(${Math.min(W - 180, hover.x + 8)}, ${Math.max(padTop + 8, hover.y - 10)})`}>
            <rect width={160} height={64} fill="#FFFFFF" stroke="#E5E7EB" rx={6} />
            <text x={8} y={14} fill="#334155" fontSize={11}>
              {startYear != null ? `${startYear + Math.floor(hover.i/12)} (m${(hover.i%12)+1})` : `Month ${hover.i} (${Math.round(hover.i/12)}y)`}
            </text>
            <text x={8} y={30} fill="#475569" fontSize={11}>Median: {formatCurrency(p50[hover.i])}</text>
            <text x={8} y={46} fill="#475569" fontSize={11}>P25/P75: {formatCurrency(p25[hover.i])} / {formatCurrency(p75[hover.i])}</text>
          </g>
        </g>
      )}
    </svg>
  )
}
/*
FanChart (SVG) – draws percentile bands (P10/P25) and median line.
Includes axes, gridlines, legend, tooltip, and optional retirement marker.
*/
