import React, { useMemo, useState } from 'react'
import type { AssetClass } from '@types/engine'

const COLORS: Record<AssetClass, string> = {
  US_STOCK: '#7aa2f7',
  INTL_STOCK: '#91d7e3',
  BONDS: '#a6da95',
  REIT: '#f5a97f',
  CASH: '#eed49f',
  REAL_ESTATE: '#c6a0f6',
  CRYPTO: '#f28fad',
  GOLD: '#e5c07b'
}

export const StackedArea: React.FC<{ byClass: Record<AssetClass, number[]>; width?: number; height?: number; years?: number; startYear?: number; retAt?: number; xLabel?: string; yLabel?: string }> = ({ byClass, width = 800, height = 300, years, startYear, retAt, xLabel = 'Year', yLabel = 'Balance ($)' }) => {
  const keys = Object.keys(byClass) as AssetClass[]
  const months = byClass[keys[0]].length
  const totals = new Array<number>(months).fill(0)
  for (let m = 0; m < months; m++) totals[m] = keys.reduce((s, k) => s + (byClass[k][m] || 0), 0)
  const maxY = Math.max(...totals)
  const padLeft = 48
  const padBottom = 28
  const padTop = 18
  const padRight = 8
  const W = width, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const x = (i: number) => padLeft + (i / Math.max(1, months - 1)) * innerW
  const y = (v: number) => padTop + (maxY ? innerH - (v / maxY) * innerH : innerH)

  // Build stacked coordinates
  const stacks: Record<AssetClass, number[]> = {} as any
  keys.forEach((k) => (stacks[k] = new Array(months).fill(0)))
  for (let m = 0; m < months; m++) {
    let acc = 0
    for (const k of keys) {
      acc += byClass[k][m] || 0
      stacks[k][m] = acc
    }
  }

  const areaPath = (top: number[], bottom: number[]) => {
    const up = top.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
    const lo = bottom.slice().reverse().map((v, j) => `L ${x(months - 1 - j)} ${y(v)}`).join(' ')
    return `${up} ${lo} Z`
  }

  // Draw in order so first key appears at the bottom
  const layers = [] as JSX.Element[]
  let prev: number[] = new Array(months).fill(0)
  for (const k of keys) {
    const top = stacks[k]
    const bottom = prev
    layers.push(<path key={k} d={areaPath(top, bottom)} fill={COLORS[k]} opacity={0.65} stroke="none" />)
    prev = top
  }

  function fmtAbbrev(n: number) {
    const abs = Math.abs(n)
    if (abs >= 1e9) return `$${(n/1e9).toFixed(1).replace(/\.0$/,'')}B`
    if (abs >= 1e6) return `$${(n/1e6).toFixed(1).replace(/\.0$/,'')}M`
    if (abs >= 1e3) return `$${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`
    return `$${Math.round(n).toLocaleString()}`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <rect x={0} y={0} width={W} height={H} fill="#101626" rx={8} />
      {/* Gridlines */}
      <g stroke="#1f2940" strokeWidth={1} opacity={0.9}>
        {[0,0.25,0.5,0.75,1].map((t, idx) => (<line key={idx} x1={padLeft} x2={W - padRight} y1={y(t*maxY)} y2={y(t*maxY)} />))}
        {/* Minor Y gridlines */}
        {[0.125,0.375,0.625,0.875].map((t, idx) => (<line key={`my${idx}`} x1={padLeft} x2={W - padRight} y1={y(t*maxY)} y2={y(t*maxY)} opacity={0.4} />))}
        {(() => {
          const yrs = years ?? Math.max(1, Math.round(months/12))
          const maxTicks = Math.max(2, Math.min(10, Math.round((W - padLeft - padRight) / 80)))
          const step = Math.max(1, Math.ceil(yrs / maxTicks))
          const arr = [] as JSX.Element[]
          for (let yi = 0; yi <= yrs; yi += step) {
            const xi = Math.min(months-1, Math.round((yi/yrs) * (months-1)))
            arr.push(<line key={yi} y1={padTop} y2={H - padBottom} x1={x(xi)} x2={x(xi)} />)
          }
          // Minor X gridlines
          for (let yi = 0; yi <= yrs - step; yi += step) {
            const xi1 = Math.min(months-1, Math.round((yi/yrs) * (months-1)))
            const xi2 = Math.min(months-1, Math.round(((yi+step)/yrs) * (months-1)))
            const mid = Math.round((xi1 + xi2)/2)
            arr.push(<line key={`mx${yi}`} y1={padTop} y2={H - padBottom} x1={x(mid)} x2={x(mid)} opacity={0.4} />)
          }
          return arr
        })()}
      </g>
      {/* X-axis labels */}
      <g fill="#9aa4b2" fontSize={10}>
        {(() => {
          const yrs = years ?? Math.max(1, Math.round(months/12))
          const maxTicks = Math.max(2, Math.min(10, Math.round((W - padLeft - padRight) / 80)))
          const step = Math.max(1, Math.ceil(yrs / maxTicks))
          const arr = [] as JSX.Element[]
          for (let yi = 0; yi <= yrs; yi += step) {
            const xi = Math.min(months-1, Math.round((yi/yrs) * (months-1)))
            const label = startYear ? String(startYear + yi) : String(yi)
            arr.push(<text key={yi} x={x(xi)} y={H - 6} textAnchor="middle">{label}</text>)
          }
          // minor labels
          for (let yi = 0; yi <= yrs - step; yi += step) {
            const xi1 = Math.min(months-1, Math.round((yi/yrs) * (months-1)))
            const xi2 = Math.min(months-1, Math.round(((yi+step)/yrs) * (months-1)))
            const mid = Math.round((xi1 + xi2)/2)
            if (startYear != null) {
              const year = startYear + Math.floor(mid/12)
              const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mid % 12]
              arr.push(<text key={`mxl${yi}`} x={x(mid)} y={H - 6} textAnchor="middle" opacity={0.6} fontSize={9}>{`${mon} ${year}`}</text>)
            }
          }
          return arr
        })()}
      </g>
      {/* Axis labels */}
      <g fill="#9aa4b2" fontSize={11}>
        <text x={W/2} y={H - 2} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(12 ${H/2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
      </g>

      {/* Retirement marker */}
      {typeof retAt === 'number' && retAt >= 0 && (
        <g>
          <line x1={x(Math.min(months-1, retAt))} x2={x(Math.min(months-1, retAt))} y1={padTop} y2={H - padBottom} stroke="#f5a97f" strokeDasharray="6 3" />
          <text x={x(Math.min(months-1, retAt)) + 6} y={padTop + 12} fill="#f5a97f" fontSize={10}>Retirement</text>
        </g>
      )}
      <g>{layers}</g>
      {/* Legend */}
      <g transform={`translate(${W - 220}, ${padTop + 8})`} fontSize={10} fill="#c8d3e6">
        <rect x={0} y={0} width={210} height={keys.length*16 + 16} fill="#0b1020" stroke="#1f2940" rx={6} />
        <g transform="translate(8,6)">
          {keys.map((k, i) => (
            <g key={k} transform={`translate(0, ${i*16})`}>
              <rect width={12} height={8} y={2} fill={COLORS[k]} />
              <text x={18} y={9}>{k}</text>
            </g>
          ))}
        </g>
      </g>
      {/* Y-axis labels */}
      <g fill="#9aa4b2" fontSize={10}>
        {[0,0.25,0.5,0.75,1].map((t, idx) => (<text key={`yl${idx}`} x={padLeft - 6} y={y(t*maxY) + 3} textAnchor="end">{fmtAbbrev(t*maxY)}</text>))}
        {[0.125,0.375,0.625,0.875].map((t, idx) => (<text key={`myl${idx}`} x={padLeft - 6} y={y(t*maxY) + 3} textAnchor="end" opacity={0.6} fontSize={9}>{fmtAbbrev(t*maxY)}</text>))}
      </g>
    </svg>
  )
}
/*
StackedArea (SVG) – deterministic by-class balance over time.
Draws stacked layers with legend, axes, grid, and optional retirement marker.
*/
