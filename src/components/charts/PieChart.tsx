import React, { useMemo, useState } from 'react'

interface PieDatum {
  label: string
  value: number
  color: string
}

interface PieChartProps {
  data: PieDatum[]
  width?: number
  height?: number
  title?: string
  activeLabel?: string | null
  onSliceHover?: (label: string | null) => void
  legendPosition?: 'right' | 'bottom' | 'none'
}

export const PieChart: React.FC<PieChartProps> = ({ data, width = 480, height = 320, title, activeLabel, onSliceHover, legendPosition = 'right' }) => {
  const filtered = useMemo(() => data.filter((d) => d.value > 0), [data])
  const total = filtered.reduce((s, d) => s + d.value, 0) || 1
  const [internalActive, setInternalActive] = useState<string | null>(null)
  const focusLabel = activeLabel ?? internalActive

  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) / 2 - 24
  let a0 = -Math.PI / 2
  const arcs = filtered.map((d) => {
    const fraction = d.value / total
    const span = fraction * Math.PI * 2
    const a1 = a0 + span
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = span > Math.PI ? 1 : 0
    const path = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
    const midAngle = a0 + span / 2
    const midX = cx + (r + 12) * Math.cos(midAngle)
    const midY = cy + (r + 12) * Math.sin(midAngle)
    a0 = a1
    const fullCircle = span >= Math.PI * 2 * 0.9999
    return { path, color: d.color, label: d.label, value: d.value, midX, midY, percent: fraction * 100, fullCircle }
  })

  const handleHover = (label: string | null) => {
    setInternalActive(label)
    onSliceHover?.(label)
  }

  const legend = legendPosition === 'none' || !filtered.length
    ? null
    : (
      <div
        style={{
          marginLeft: legendPosition === 'right' ? 'auto' : undefined,
          marginTop: legendPosition === 'bottom' ? 16 : 0,
          maxHeight: height,
          overflowY: filtered.length > 10 ? 'auto' : 'visible',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          background: '#FFFFFF',
          padding: '12px 16px',
          minWidth: legendPosition === 'right' ? 180 : undefined
        }}
      >
        {filtered.map((d) => {
          const percent = Math.round((d.value / total) * 100)
          const active = focusLabel === d.label
          return (
            <div
              key={d.label}
              onMouseEnter={() => handleHover(d.label)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                color: '#334155',
                cursor: 'default'
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, opacity: active ? 1 : 0.85, display: 'inline-block' }} />
              <span style={{ flex: 1 }}>{d.label}</span>
              <span style={{ color: '#475569' }}>{percent}%</span>
            </div>
          )
        })}
      </div>
    )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: legendPosition === 'bottom' ? 'column' : 'row',
        alignItems: legendPosition === 'bottom' ? 'center' : 'stretch',
        width: '100%',
        gap: legendPosition === 'bottom' ? 16 : 24
      }}
      onMouseLeave={() => handleHover(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ flexShrink: 0 }}>
        <rect x={0} y={0} width={width} height={height} fill="#FFFFFF" rx={16} />
        {title && <text x={width/2} y={28} textAnchor="middle" fill="#334155" fontSize={14} fontWeight={600}>{title}</text>}
        <g transform={`translate(0, ${title ? 8 : 0})`}>
          {arcs.map((a) => {
            const isActive = focusLabel ? focusLabel === a.label : false
            const dimmed = focusLabel && focusLabel !== a.label
            const opacity = dimmed ? 0.3 : 0.92
            const strokeWidth = isActive ? 3 : 1.2
            if (a.fullCircle) {
              return (
                <circle
                  key={a.label}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={a.color}
                  opacity={opacity}
                  stroke="#FFFFFF"
                  strokeWidth={strokeWidth}
                  onMouseEnter={() => handleHover(a.label)}
                />
              )
            }
            return (
              <path
                key={a.label}
                d={a.path}
                fill={a.color}
                opacity={opacity}
                stroke="#FFFFFF"
                strokeWidth={strokeWidth}
                onMouseEnter={() => handleHover(a.label)}
              />
            )
          })}
        </g>
        {arcs.length === 1 && (
          <text x={cx} y={cy + 6} textAnchor="middle" fill="#1e293b" fontSize={16} fontWeight={600}>{Math.round(arcs[0].percent)}%</text>
        )}
      </svg>
      {legend}
    </div>
  )
}
