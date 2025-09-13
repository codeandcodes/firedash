import React, { useMemo, useState } from 'react'
import type { AssetClass } from '@types/engine'

const COLORS: Record<AssetClass, string> = {
  US_STOCK: '#7aa2f7',
  INTL_STOCK: '#91d7e3',
  BONDS: '#a6da95',
  REIT: '#f5a97f',
  CASH: '#eed49f'
}

export const StackedArea: React.FC<{ byClass: Record<AssetClass, number[]>; width?: number; height?: number; years?: number; startYear?: number }> = ({ byClass, width = 800, height = 300, years, startYear }) => {
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

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <rect x={0} y={0} width={W} height={H} fill="#101626" rx={8} />
      {/* Gridlines */}
      <g stroke="#1f2940" strokeWidth={1} opacity={0.9}>
        {[0,0.25,0.5,0.75,1].map((t, idx) => (<line key={idx} x1={padLeft} x2={W - padRight} y1={y(t*maxY)} y2={y(t*maxY)} />))}
        {new Array(Math.max(1, Math.round(months/12))+1).fill(0).map((_, i) => {
          const xi = Math.min(months-1, Math.round((i/Math.max(1, Math.round(months/12))) * (months-1)))
          return <line key={i} y1={padTop} y2={H - padBottom} x1={x(xi)} x2={x(xi)} />
        })}
      </g>
      {/* X-axis labels */}
      <g fill="#9aa4b2" fontSize={10}>
        {new Array(Math.max(1, Math.round(months/12))+1).fill(0).map((_, i) => {
          const xi = Math.min(months-1, Math.round((i/Math.max(1, Math.round(months/12))) * (months-1)))
          const label = startYear ? String(startYear + i) : String(i)
          return <text key={i} x={x(xi)} y={H - 6} textAnchor="middle">{label}</text>
        })}
      </g>
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
    </svg>
  )
}
