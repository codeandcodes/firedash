/**
 * YearlyFlowsChart
 * - Visualizes per-year flows as stacked bars: Income + Returns above 0, Expenditures below 0.
 * - Bars centered within bins; retirement marker line; hover tooltip shows breakdown.
 */
import React, { useEffect, useMemo, useState } from 'react'
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

export const YearlyFlowsChart: React.FC<{
  snapshot: Snapshot
  yearEnds: number[]
  years: number
  inflation: number
  startYear?: number
  retAt?: number
  width?: number
  height?: number
  title?: string
  comparison?: { snapshot: Snapshot; yearEnds: number[] }
}> = ({ snapshot, yearEnds, years, inflation, startYear, retAt, width, height = 320, title = 'Returns, Income, Expenditures per Year', comparison }) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [autoWidth, setAutoWidth] = useState(0)
  useEffect(() => {
    if (typeof width === 'number') return
    const el = container
    if (!el) return
    const update = () => {
      const next = el.getBoundingClientRect().width
      if (next > 0) setAutoWidth(next)
    }
    update()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries.length ? entries[entries.length - 1] : null
        if (!entry) return
        const next = entry.contentRect.width
        if (next > 0) setAutoWidth(next)
      })
      observer.observe(el)
      return () => observer.disconnect()
    }
    const onResize = () => update()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [width, container])

  const months = years * 12
  const flowData = useMemo(() => {
    const calc = (snap: Snapshot, ends: number[]) => {
      const safe = (n: number | undefined | null) => (typeof n === 'number' && isFinite(n) ? n : 0)
      const tl = buildTimeline(snap, years)
      const inflM = Math.log(1 + inflation) / 12
      const ssMonthly = (snap.social_security || []).reduce((s, ss) => Math.max(s, ss.monthly_amount || 0), 0)
      const spendMonthly = Math.max(0, snap.retirement.expected_spend_monthly || 0)
      const perYear = Array.from({ length: years }, () => ({ rentNet: 0, mortgage: 0, reCarry: 0 }))
      for (const re of snap.real_estate || []) {
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
      const contrib: number[] = new Array(years).fill(0)
      const extraExp: number[] = new Array(years).fill(0)
      for (const cf of tl.cashflows) {
        if (cf.kind === 'property') continue
        const y = Math.floor(cf.monthIndex / 12)
        if (cf.amount > 0) contrib[y] += cf.amount; else extraExp[y] += -cf.amount
      }
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
      const initialTotal = Number.isFinite(computeAllocation(snap).total) ? computeAllocation(snap).total : 0
      for (let y = 0; y < years; y++) {
        const prevEnd = y === 0 ? initialTotal : endBal[y - 1]
        endBal[y] = safe(ends[y])
        startBal[y] = prevEnd
      }
      const inc: number[] = new Array(years).fill(0)
      const exp: number[] = new Array(years).fill(0)
      const ret: number[] = new Array(years).fill(0)
      for (let y = 0; y < years; y++) {
        inc[y] = safe(contrib[y]) + safe(ss[y]) + safe(perYear[y].rentNet)
        exp[y] = safe(spend[y]) + safe(perYear[y].mortgage) + safe(perYear[y].reCarry) + safe(extraExp[y])
        ret[y] = safe(endBal[y]) - safe(startBal[y]) - (inc[y] - exp[y])
      }
      return { inc, exp, ret }
    }
    return {
      base: calc(snapshot, yearEnds),
      compare: comparison ? calc(comparison.snapshot, comparison.yearEnds) : null
    }
  }, [snapshot, yearEnds, comparison, years, inflation, months])

  const padLeft = 64, padBottom = 28, padTop = 24, padRight = 8
  const resolvedWidth = typeof width === 'number' ? width : autoWidth || 1000
  const W = resolvedWidth, H = height
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom
  const n = years
  const base = flowData.base
  const compareData = flowData.compare
  const labels = useMemo(() => Array.from({ length: years }, (_, i) => (startYear != null ? startYear + i : i)), [years, startYear])
  // Bin-based bar positioning so bars don't hang off the y-axis
  const binW = n > 0 ? innerW / n : innerW
  const barGap = Math.min(12, binW * 0.15)
  const hasComparison = !!compareData
  const barW = hasComparison ? Math.max(4, (binW - barGap * 3) / 2) : Math.max(4, binW - 2 * barGap)
  const baseLeft = (i: number) => padLeft + i * binW + barGap
  const compLeft = hasComparison ? (i: number) => padLeft + i * binW + barGap * 2 + barW : undefined
  const xCenter = (i: number) => padLeft + i * binW + binW / 2

  // Scale: stack income + returns above 0, expenditures below 0
  const posCandidates: number[] = []
  const negCandidates: number[] = []
  for (let i = 0; i < n; i++) {
    posCandidates.push((isFinite(base.inc[i]) ? base.inc[i] : 0) + (isFinite(base.ret[i]) ? base.ret[i] : 0))
    negCandidates.push(isFinite(base.exp[i]) ? base.exp[i] : 0)
    if (compareData) {
      posCandidates.push((isFinite(compareData.inc[i]) ? compareData.inc[i] : 0) + (isFinite(compareData.ret[i]) ? compareData.ret[i] : 0))
      negCandidates.push(isFinite(compareData.exp[i]) ? compareData.exp[i] : 0)
    }
  }
  const posMaxRaw = Math.max(0, ...posCandidates)
  const negMaxRaw = Math.max(0, ...negCandidates)
  function niceStep(maxVal: number, targetTicks = 4): number {
    const raw = maxVal / Math.max(1, targetTicks)
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))))
    const candidates = [1, 2, 5, 10]
    for (const c of candidates) {
      const step = c * pow
      if (raw <= step) return step
    }
    return 10 * pow
  }
  const posStep = niceStep(posMaxRaw)
  const negStep = niceStep(negMaxRaw)
  const posMax = Math.max(posStep, Math.ceil(posMaxRaw / posStep) * posStep)
  const negMax = Math.max(negStep, Math.ceil(negMaxRaw / negStep) * negStep)
  const yMin = -negMax
  const yMax = posMax
  const y = (v: number) => {
    const denom = (yMax - yMin)
    if (!isFinite(denom) || denom === 0) return padTop + innerH
    return padTop + innerH - ((v - yMin) / denom) * innerH
  }

  const pos1 = base.inc.map(v => (isFinite(v) ? v : 0))
  const pos2 = base.inc.map((v, i) => (isFinite(v) ? v : 0) + (isFinite(base.ret[i]) ? base.ret[i] : 0))
  const neg = base.exp.map(v => (isFinite(v) ? v : 0))
  const compPos1 = compareData ? compareData.inc.map(v => (isFinite(v) ? v : 0)) : []
  const compPos2 = compareData ? compareData.inc.map((v, i) => (isFinite(v) ? v : 0) + (isFinite(compareData.ret[i]) ? compareData.ret[i] : 0)) : []
  const compNeg = compareData ? compareData.exp.map(v => (isFinite(v) ? v : 0)) : []

  const [hoverI, setHoverI] = useState<number | null>(null)

  return (
    <div ref={setContainer} style={{ width: '100%' }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}
         onMouseMove={(e) => {
           const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
           const mx = e.clientX - rect.left - padLeft
           const t = Math.max(0, Math.min(1, mx / innerW))
           setHoverI(Math.round(t * (n - 1)))
         }}
         onMouseLeave={() => setHoverI(null)}>
      <rect x={0} y={0} width={W} height={H} fill="#FFFFFF" rx={8} />
      {/* grid */}
      <g stroke="#E5E7EB" strokeWidth={1} opacity={1}>
        {Array.from({ length: 5 }).map((_, i) => {
          const t = i / 4
          const v = yMin + t * (yMax - yMin)
          return <line key={i} x1={padLeft} x2={W - padRight} y1={y(v)} y2={y(v)} />
        })}
        {labels.map((_, i) => (<line key={i} y1={padTop} y2={H - padBottom} x1={xCenter(i)} x2={xCenter(i)} opacity={0.3} />))}
      </g>
      <g stroke="#94A3B8" strokeWidth={1.25}>
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={H - padBottom} />
        <line x1={padLeft} y1={H - padBottom} x2={W - padRight} y2={H - padBottom} />
      </g>
      {/* stacked bars */}
      <g>
        {labels.map((_, i) => {
          const xl = baseLeft(i)
          const incTop = Math.max(0, pos1[i])
          const retTop = Math.max(0, pos2[i])
          const expVal = Math.max(0, neg[i])
          const incH = y(0) - y(incTop)
          const retH = y(incTop) - y(retTop)
          const expH = y(-expVal) - y(0)
          return (
            <g key={`base-${i}`}>
              {incH > 0 && <rect x={xl} y={y(incTop)} width={barW} height={incH} fill="#22C55E" opacity={0.9} />}
              {retH > 0 && <rect x={xl} y={y(retTop)} width={barW} height={retH} fill="#86EFAC" opacity={0.9} />}
              {expH > 0 && <rect x={xl} y={y(0)} width={barW} height={expH} fill="#FCA5A5" opacity={0.9} />}
            </g>
          )
        })}
        {hasComparison && compareData && compLeft && labels.map((_, i) => {
          const xl = compLeft(i)
          const incTop = Math.max(0, compPos1[i])
          const retTop = Math.max(0, compPos2[i])
          const expVal = Math.max(0, compNeg[i])
          const incH = y(0) - y(incTop)
          const retH = y(incTop) - y(retTop)
          const expH = y(-expVal) - y(0)
          return (
            <g key={`comp-${i}`}>
              {incH > 0 && <rect x={xl} y={y(incTop)} width={barW} height={incH} fill="#1D4ED8" opacity={0.85} />}
              {retH > 0 && <rect x={xl} y={y(retTop)} width={barW} height={retH} fill="#93C5FD" opacity={0.9} />}
              {expH > 0 && <rect x={xl} y={y(0)} width={barW} height={expH} fill="#EF4444" opacity={0.85} />}
            </g>
          )
        })}
      </g>
      {/* Retirement marker */}
      {typeof retAt === 'number' && retAt >= 0 && (
        (() => {
          const rYear = Math.floor(retAt / 12)
          const idx = Math.max(0, Math.min(n - 1, rYear))
          const xc = xCenter(idx)
          return (
            <g>
              <line x1={xc} x2={xc} y1={padTop} y2={H - padBottom} stroke="#F59E0B" strokeDasharray="6 3" />
              <text x={xc + 6} y={padTop + 12} fill="#F59E0B" fontSize={10}>Retirement</text>
            </g>
          )
        })()
      )}
      {/* labels */}
      <g fill="#6B7280" fontSize={10}>
        {(() => {
          const ticks: number[] = []
          for (let v = 0; v <= posMax; v += posStep) ticks.push(v)
          for (let v = -negStep; v >= -negMax; v -= negStep) ticks.push(v)
          return ticks.map((v, idx) => (
            <text key={idx} x={padLeft - 6} y={y(v) + 3} textAnchor="end">{fmtShort(v)}</text>
          ))
        })()}
        {(() => {
          const maxLabels = Math.min(12, Math.floor(innerW / 90))
          const step = Math.max(1, Math.ceil(n / Math.max(1, maxLabels)))
          return labels.map((yv, i) => (i % step === 0 ? <text key={i} x={xCenter(i)} y={H - 6} textAnchor="middle">{String(yv)}</text> : null))
        })()}
        <text x={W/2} y={14} textAnchor="middle" fill="#334155">{title}</text>
      </g>
      {/* legend */}
      <g transform={`translate(${W - 260}, ${padTop + 8})`} fontSize={10} fill="#334155">
        <rect x={0} y={0} width={250} height={hasComparison ? 120 : 64} fill="#FFFFFF" stroke="#E5E7EB" rx={6} />
        <g transform="translate(8,6)">
          <g transform="translate(0,0)"><rect width={12} height={8} y={2} fill="#86EFAC" opacity={0.8} /><text x={18} y={9}
          >Returns</text></g>
          <g transform="translate(0,16)"><rect width={12} height={8} y={2} fill="#22C55E" opacity={0.8} /><text x={18} y={9}
          >Income</text></g>
          <g transform="translate(0,32)"><rect width={12} height={8} y={2} fill="#FCA5A5" opacity={0.8} /><text x={18} y={9}
          >Expenditures</text></g>
          {hasComparison && (
            <>
              <g transform="translate(0,52)"><rect width={12} height={8} y={2} fill="#93C5FD" opacity={0.9} /><text x={18} y={9}
              >Scenario returns</text></g>
              <g transform="translate(0,68)"><rect width={12} height={8} y={2} fill="#1D4ED8" opacity={0.85} /><text x={18} y={9}
              >Scenario income</text></g>
              <g transform="translate(0,84)"><rect width={12} height={8} y={2} fill="#EF4444" opacity={0.85} /><text x={18} y={9}
              >Scenario exp.</text></g>
            </>
          )}
        </g>
      </g>
      {hoverI != null && (
        <g>
          <line x1={xCenter(hoverI)} x2={xCenter(hoverI)} y1={padTop} y2={H - padBottom} stroke="#4F7BFF" strokeDasharray="4 3" opacity={0.6} />
          <g transform={`translate(${Math.min(W - (hasComparison ? 280 : 220), xCenter(hoverI) + 8)}, ${padTop + 8})`}>
            <rect width={hasComparison ? 260 : 200} height={hasComparison ? 126 : 84} fill="#FFFFFF" stroke="#E5E7EB" rx={6} />
            <text x={8} y={14} fill="#334155" fontSize={11}>{labels[hoverI]}</text>
            <text x={8} y={30} fill="#166534" fontSize={11}>Returns: {fmtShort(base.ret[hoverI])}</text>
            <text x={8} y={46} fill="#15803D" fontSize={11}>Income: {fmtShort(base.inc[hoverI])}</text>
            <text x={8} y={62} fill="#991B1B" fontSize={11}>Expenditures: {fmtShort(base.exp[hoverI])}</text>
            {hasComparison && compareData && (
              <>
                <text x={8} y={78} fill="#1D4ED8" fontSize={11}>Scenario income: {fmtShort(compareData.inc[hoverI])}</text>
                <text x={8} y={94} fill="#93C5FD" fontSize={11}>Scenario returns: {fmtShort(compareData.ret[hoverI])}</text>
                <text x={8} y={110} fill="#B91C1C" fontSize={11}>Scenario exp: {fmtShort(compareData.exp[hoverI])}</text>
              </>
            )}
          </g>
        </g>
      )}
    </svg>
    </div>
  )
}
