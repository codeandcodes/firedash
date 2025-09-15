import React, { useMemo, useState } from 'react'
import type { Snapshot } from '@types/schema'
import { buildTimeline } from '@engine/schedule'
import { computeAllocation } from '@engine/alloc'

function fmtShort(n: number) {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e9) return sign + '$' + (a/1e9).toFixed(1) + 'B'
  if (a >= 1e6) return sign + '$' + (a/1e6).toFixed(1) + 'M'
  if (a >= 1e3) return sign + '$' + (a/1e3).toFixed(1) + 'K'
  return sign + '$' + Math.round(a).toString()
}

export const YearlyBalanceStackedChart: React.FC<{
  snapshot: Snapshot
  totals: number[]
  years: number
  inflation: number
  startYear?: number
  width?: number
  height?: number
  title?: string
}> = ({ snapshot, totals, years, inflation, startYear, width = 1000, height = 360, title = 'Year-end Balance Breakdown' }) => {
  const months = years * 12
  const data = useMemo(() => {
    const tl = buildTimeline(snapshot, years)
    const inflM = Math.log(1 + inflation) / 12
    const ssMonthly = (snapshot.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)
    const spendMonthly = Math.max(0, snapshot.retirement.expected_spend_monthly || 0)
    // per-year property flows with payoff
    const perYear = Array.from({ length: years }, () => ({ rentNet: 0, mortgage: 0, reCarry: 0 }))
    for (const re of snapshot.real_estate || []) {
      const taxes = re.taxes || 0
      const ins = re.insurance || 0
      const maint = (re.maintenance_pct || 0) * (re.value || 0)
      const rNet = re.rental ? ((re.rental.rent || 0) * (1 - (re.rental.vacancy_pct || 0)) - (re.rental.expenses || 0)) : 0
      const P = Math.max(0, re.mortgage_balance || 0)
      const pay = Math.max(0, re.payment || 0)
      const r = Math.max(0, (re.rate || 0) / 12)
      let mortgageMonths = 0
      if (P > 0 && pay > 0) {
        if (r > 0 && pay > P * r) mortgageMonths = Math.ceil(Math.log(pay / (pay - r * P)) / Math.log(1 + r))
        else if (r === 0) mortgageMonths = Math.ceil(P / pay)
        else mortgageMonths = months
      }
      for (let m = 0; m < months; m++) {
        const y = Math.floor(m / 12)
        perYear[y].rentNet += rNet
        perYear[y].reCarry += taxes/12 + ins/12 + maint/12
        if (m < mortgageMonths) perYear[y].mortgage += pay
      }
    }
    // contributions/extra expenses (exclude property)
    const contrib: number[] = new Array(years).fill(0)
    const extraExp: number[] = new Array(years).fill(0)
    for (const cf of tl.cashflows) {
      if (cf.kind === 'property') continue
      const y = Math.floor(cf.monthIndex / 12)
      if (cf.amount > 0) contrib[y] += cf.amount; else extraExp[y] += -cf.amount
    }
    // SS and spend per year
    const ss: number[] = new Array(years).fill(0)
    const spend: number[] = new Array(years).fill(0)
    for (let y = 0; y < years; y++) {
      const ms = y*12, me = Math.min(months - 1, (y+1)*12 - 1)
      for (let m = ms; m <= me; m++) {
        const retired = tl.retirementAt == null ? true : m >= (tl.retirementAt as number)
        if (tl.ssStartMonth != null && m >= (tl.ssStartMonth as number)) ss[y] += ssMonthly * Math.exp(inflM * m)
        if (retired) spend[y] += spendMonthly * Math.exp(inflM * m)
      }
    }
    const endBal: number[] = new Array(years).fill(0)
    const startBal: number[] = new Array(years).fill(0)
    const initialTotal = computeAllocation(snapshot).total
    for (let y = 0; y < years; y++) {
      const me = Math.min(months - 1, (y+1)*12 - 1)
      const prevEnd = y === 0 ? initialTotal : endBal[y - 1]
      endBal[y] = totals[me]
      startBal[y] = prevEnd
    }
    const inc: number[] = new Array(years).fill(0)
    const exp: number[] = new Array(years).fill(0)
    const ret: number[] = new Array(years).fill(0)
    for (let y = 0; y < years; y++) {
      inc[y] = contrib[y] + ss[y] + perYear[y].rentNet
      exp[y] = spend[y] + perYear[y].mortgage + perYear[y].reCarry + extraExp[y]
      ret[y] = endBal[y] - startBal[y] - (inc[y] - exp[y])
    }
    return { years: Array.from({ length: years }, (_, i) => (startYear || 0) + i), startBal, endBal, inc, exp, ret }
  }, [snapshot, totals, years, inflation, startYear])

  const padLeft = 64, padBottom = 28, padTop = 24, padRight = 8
  const W = width, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const n = years
  const x = (i: number) => padLeft + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const allVals: number[] = []
  for (let i = 0; i < n; i++) {
    allVals.push(data.endBal[i])
    allVals.push(Math.max(0, data.startBal[i] - data.exp[i]))
  }
  const minY = Math.max(0, Math.min(...allVals))
  const maxY = Math.max(...allVals)
  const range = maxY - minY || 1
  const yMin = minY
  const yMax = maxY + range * 0.05
  const y = (v: number) => padTop + (yMax > yMin ? innerH - ((v - yMin) / (yMax - yMin)) * innerH : innerH)

  function areaPath(top: number[], bottom: number[]) {
    const up = top.map((v, i) => `${i===0?'M':'L'} ${x(i)} ${y(v)}`).join(' ')
    const down = bottom.slice().reverse().map((v, rgi) => {
      const i = bottom.length - 1 - rgi
      return `L ${x(i)} ${y(v)}`
    }).join(' ')
    return `${up} ${down} Z`
  }

  // Build stacked series: starting baseline after expenditures, then returns area, then income area to endBal
  const baseAfterExp = data.startBal.map((s, i) => s - data.exp[i])
  const afterReturns = data.startBal.map((s, i) => s - data.exp[i] + data.ret[i])
  const end = data.endBal

  const [hoverI, setHoverI] = useState<number | null>(null)

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
      {/* grid */}
      <g stroke="#1f2940" strokeWidth={1} opacity={0.85}>
        {Array.from({ length: 5 }).map((_, i) => {
          const t = i / 4
          const v = yMin + t * (yMax - yMin)
          return <line key={i} x1={padLeft} x2={W - padRight} y1={y(v)} y2={y(v)} />
        })}
        {data.years.map((_, i) => (<line key={i} y1={padTop} y2={H - padBottom} x1={x(i)} x2={x(i)} opacity={0.3} />))}
      </g>
      <g stroke="#c8d3e6" strokeWidth={1.25}>
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={H - padBottom} />
        <line x1={padLeft} y1={H - padBottom} x2={W - padRight} y2={H - padBottom} />
      </g>
      {/* areas */}
      <path d={areaPath(baseAfterExp, baseAfterExp.map((_v,i)=>Math.min(yMax, yMin)))} fill="transparent" />
      <path d={areaPath(baseAfterExp, afterReturns)} fill="#a6da95" opacity={0.6} />
      <path d={areaPath(afterReturns, end)} fill="#4caf50" opacity={0.6} />
      <path d={areaPath(baseAfterExp, data.startBal)} fill="#f28fad" opacity={0.6} />
      {/* end balance line */}
      <path d={end.map((v, i) => `${i===0?'M':'L'} ${x(i)} ${y(v)}`).join(' ')} stroke="#c8d3e6" strokeWidth={2} fill="none" />
      {/* labels */}
      <g fill="#9aa4b2" fontSize={10}>
        {Array.from({ length: 5 }).map((_, i) => {
          const t = i / 4
          const v = yMin + t * (yMax - yMin)
          return <text key={i} x={padLeft - 6} y={y(v) + 3} textAnchor="end">{fmtShort(v)}</text>
        })}
        {data.years.map((yv, i) => (<text key={i} x={x(i)} y={H - 6} textAnchor="middle">{String(yv)}</text>))}
        <text x={W/2} y={14} textAnchor="middle" fill="#c8d3e6">{title}</text>
      </g>
      {/* legend */}
      <g transform={`translate(${W - 240}, ${padTop + 8})`} fontSize={10} fill="#c8d3e6">
        <rect x={0} y={0} width={230} height={64} fill="#0b1020" stroke="#1f2940" rx={6} />
        <g transform="translate(8,6)">
          <g transform="translate(0,0)"><rect width={12} height={8} y={2} fill="#a6da95" opacity={0.6} /><text x={18} y={9}
          >Returns</text></g>
          <g transform="translate(0,16)"><rect width={12} height={8} y={2} fill="#4caf50" opacity={0.6} /><text x={18} y={9}
          >Income</text></g>
          <g transform="translate(0,32)"><rect width={12} height={8} y={2} fill="#f28fad" opacity={0.6} /><text x={18} y={9}
          >Expenditures</text></g>
        </g>
      </g>
      {hoverI != null && (
        <g>
          <line x1={x(hoverI)} x2={x(hoverI)} y1={padTop} y2={H - padBottom} stroke="#c8d3e6" strokeDasharray="4 3" opacity={0.6} />
          <g transform={`translate(${Math.min(W - 220, x(hoverI) + 8)}, ${padTop + 8})`}>
            <rect width={200} height={84} fill="#0b1020" stroke="#1f2940" rx={6} />
            <text x={8} y={14} fill="#c8d3e6" fontSize={11}>{data.years[hoverI]}</text>
            <text x={8} y={30} fill="#c8d3e6" fontSize={11}>End: {fmtShort(data.endBal[hoverI])}</text>
            <text x={8} y={46} fill="#a6da95" fontSize={11}>Returns: {fmtShort(data.ret[hoverI])}</text>
            <text x={8} y={62} fill="#4caf50" fontSize={11}>Income: {fmtShort(data.inc[hoverI])}</text>
            <text x={8} y={78} fill="#f28fad" fontSize={11}>Expenditures: {fmtShort(data.exp[hoverI])}</text>
          </g>
        </g>
      )}
    </svg>
  )
}

