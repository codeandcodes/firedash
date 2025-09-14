/* eslint-disable no-restricted-globals */
import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'
import { simulate, simulateSeries } from '@engine/sim'

type Req = {
  snapshot: Snapshot
  options: SimOptions & { maxPathsForSeries?: number }
}

self.onmessage = (e: MessageEvent<Req>) => {
  try {
    const { snapshot, options } = e.data
    const series = simulateSeries(snapshot, options)
    const { summary } = simulate(snapshot, options)
    ;(self as any).postMessage({ ok: true, series, summary })
  } catch (err: any) {
    ;(self as any).postMessage({ ok: false, error: String(err?.message || err) })
  }
}

