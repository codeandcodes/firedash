import React from 'react'

export const PieChart: React.FC<{ data: { label: string; value: number; color: string }[]; width?: number; height?: number; title?: string }>
  = ({ data, width = 360, height = 220, title }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const cx = width / 2, cy = height / 2, r = Math.min(width, height) / 2 - 14
  let a0 = -Math.PI / 2
  const arcs = data.map((d) => {
    const a1 = a0 + (d.value / total) * Math.PI * 2
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const large = a1 - a0 > Math.PI ? 1 : 0
    const path = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
    a0 = a1
    return { path, color: d.color, label: d.label, value: d.value }
  })
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <rect x={0} y={0} width={width} height={height} fill="#101626" rx={8} />
      {title && <text x={width/2} y={16} textAnchor="middle" fill="#c8d3e6" fontSize={12}>{title}</text>}
      <g>
        {arcs.map((a, i) => (<path key={i} d={a.path} fill={a.color} opacity={0.85} stroke="#0b1020" strokeWidth={1} />))}
      </g>
      <g transform={`translate(${width - 140}, 24)`} fontSize={10} fill="#c8d3e6">
        <rect x={0} y={-8} width={132} height={data.length*16 + 16} fill="#0b1020" stroke="#1f2940" rx={6} />
        <g transform="translate(8,4)">
          {data.map((d, i) => (
            <g key={i} transform={`translate(0, ${i*16})`}>
              <rect width={12} height={8} y={2} fill={d.color} />
              <text x={18} y={9}>{d.label} — {Math.round((d.value/total)*100)}%</text>
            </g>
          ))}
        </g>
      </g>
    </svg>
  )
}
