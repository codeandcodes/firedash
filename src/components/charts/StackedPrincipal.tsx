import React from 'react'

export const StackedPrincipal: React.FC<{
  total: number[]
  principal: number[]
  width?: number
  height?: number
  years?: number
  startYear?: number
  title?: string
  xLabel?: string
  yLabel?: string
  retAt?: number
}> = ({ total, principal, width = 900, height = 320, years, startYear, title, xLabel = 'Year', yLabel = 'Balance ($)', retAt }) => {
  const months = Math.min(total.length, principal.length)
  const padLeft = 56, padBottom = 28, padTop = 20, padRight = 8
  const W = width, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const maxY = Math.max(...total.slice(0, months))
  const x = (i: number) => padLeft + (i / Math.max(1, months - 1)) * innerW
  const y = (v: number) => padTop + (maxY ? innerH - (v / maxY) * innerH : innerH)

  // Layers: base = principal clipped to [0, total]; top = max(0, total - principal)
  const base = new Array<number>(months)
  const top = new Array<number>(months)
  for (let m = 0; m < months; m++) {
    const t = total[m]
    const p = Math.max(0, principal[m])
    const pClamped = Math.max(0, Math.min(t, p))
    base[m] = pClamped
    top[m] = Math.max(0, t - pClamped)
  }

  const areaPath = (upper: number[], lower: number[]) => {
    const up = upper.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
    const lo = lower.slice().reverse().map((v, j) => `L ${x(months - 1 - j)} ${y(v)}`).join(' ')
    return `${up} ${lo} Z`
  }

  // Grid and ticks
  const yearsCount = years ?? Math.max(1, Math.round(months / 12))
  const maxTicks = Math.max(2, Math.min(10, Math.round(innerW / 80)))
  const step = Math.max(1, Math.ceil(yearsCount / maxTicks))
  const xTicks: { i: number; label: string }[] = []
  for (let yi = 0; yi <= yearsCount; yi += step) {
    const xi = Math.min(months - 1, Math.round((yi / yearsCount) * (months - 1)))
    xTicks.push({ i: xi, label: startYear ? String(startYear + yi) : String(yi) })
  }

  // Hover state
  const [hoverI, setHoverI] = React.useState<number | null>(null)
  const hover = React.useMemo(() => {
    if (hoverI == null) return null
    const i = Math.max(0, Math.min(months - 1, hoverI))
    return { i, x: x(i), total: total[i], principal: principal[i], above: Math.max(0, total[i] - Math.max(0, Math.min(total[i], principal[i]))) }
  }, [hoverI, months, total, principal])

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
      <g stroke="#E5E7EB" strokeWidth={1} opacity={1}>
        {[0,0.25,0.5,0.75,1].map((t, idx) => (<line key={idx} x1={padLeft} x2={W - padRight} y1={y(t*maxY)} y2={y(t*maxY)} />))}
        {xTicks.map((t, idx) => (<line key={idx} y1={padTop} y2={H - padBottom} x1={x(t.i)} x2={x(t.i)} />))}
      </g>
      {/* Axes */}
      <g stroke="#94A3B8" strokeWidth={1.25}>
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={H - padBottom} />
        <line x1={padLeft} y1={H - padBottom} x2={W - padRight} y2={H - padBottom} />
      </g>
      {/* Axis labels */}
      <g fill="#6B7280" fontSize={11}>
        <text x={W/2} y={H - 2} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(12 ${H/2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
      </g>
      {/* Areas: base then top */}
      <path d={areaPath(base, new Array(months).fill(0))} fill="#eed49f" opacity={0.75} />
      <path d={areaPath(total, base)} fill="#7aa2f7" opacity={0.65} />
      {/* Retirement marker */}
      {typeof retAt === 'number' && retAt >= 0 && (
        <g>
          <line x1={x(Math.min(months-1, retAt))} x2={x(Math.min(months-1, retAt))} y1={padTop} y2={H - padBottom} stroke="#F59E0B" strokeDasharray="6 3" />
          <text x={x(Math.min(months-1, retAt)) + 6} y={padTop + 12} fill="#F59E0B" fontSize={10}>Retirement</text>
        </g>
      )}
      {/* Labels */}
      <g fill="#6B7280" fontSize={10}>
        {xTicks.map((t, idx) => (<text key={idx} x={x(t.i)} y={H - 6} textAnchor="middle">{t.label}</text>))}
        <text x={W / 2} y={14} textAnchor="middle" fill="#334155">{title || 'Balance and Principal'}</text>
      </g>
      {/* Hover */}
      {hover && (
        <g>
          <line x1={hover.x} x2={hover.x} y1={padTop} y2={H - padBottom} stroke="#4F7BFF" strokeDasharray="4 3" opacity={0.6} />
          <g transform={`translate(${Math.min(W - 220, hover.x + 8)}, ${padTop + 8})`}>
            <rect width={200} height={72} fill="#FFFFFF" stroke="#E5E7EB" rx={6} />
            <text x={8} y={16} fill="#334155" fontSize={11}>
              {startYear != null ? `${startYear + Math.floor(hover.i/12)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][hover.i%12]}` : `Month ${hover.i}`}
            </text>
            <text x={8} y={32} fill="#4F7BFF" fontSize={11}>Total: ${Math.round(hover.total).toLocaleString()}</text>
            <text x={8} y={48} fill="#EAB308" fontSize={11}>Principal: ${Math.round(hover.principal).toLocaleString()}</text>
            <text x={8} y={64} fill="#475569" fontSize={11}>Above Prin.: ${Math.round(hover.above).toLocaleString()}</text>
          </g>
        </g>
      )}
      {/* Legend */}
      <g transform={`translate(${W - 220}, ${padTop + 8})`} fontSize={10} fill="#334155">
        <rect x={0} y={0} width={210} height={16*2 + 16} fill="#FFFFFF" stroke="#E5E7EB" rx={6} />
        <g transform="translate(8,6)">
          <g transform="translate(0, 0)">
            <rect width={12} height={8} y={2} fill="#EAB308" />
            <text x={18} y={9}>Principal Remaining</text>
          </g>
          <g transform="translate(0, 16)">
            <rect width={12} height={8} y={2} fill="#4F7BFF" />
            <text x={18} y={9}>Above Principal</text>
          </g>
        </g>
      </g>
    </svg>
  )
}

/*
StackedPrincipal – two-layer stacked area of (1) Principal Remaining and (2) Above Principal (excess over principal).
Note: When total < principal, the excess is clipped at 0 so the stack height equals total.
*/
