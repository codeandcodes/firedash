import type { Snapshot } from '@types/schema'
import type { SimOptions } from '@types/engine'

function djb2(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i)
  return (h >>> 0).toString(36)
}

export function resultsKey(snapshot: Snapshot, opts: SimOptions): string {
  const keyObj = {
    s: snapshot,
    o: {
      years: opts.years,
      inflation: opts.inflation,
      rebalFreq: opts.rebalFreq,
      mcMode: opts.mcMode,
      bbm: opts.bootstrapBlockMonths,
      bns: opts.bootstrapNoiseSigma,
      paths: opts.paths
    }
  }
  return 'results:' + djb2(JSON.stringify(keyObj))
}

export function scenariosKey(snapshot: Snapshot, opts: SimOptions, targets: Array<{ label: string; success: number }>, pathsPerEval: number): string {
  const keyObj = {
    s: snapshot,
    o: {
      years: opts.years,
      inflation: opts.inflation,
      rebalFreq: opts.rebalFreq,
      mcMode: opts.mcMode,
      bbm: opts.bootstrapBlockMonths,
      bns: opts.bootstrapNoiseSigma
    },
    t: targets,
    p: pathsPerEval
  }
  return 'scenarios:' + djb2(JSON.stringify(keyObj))
}

export function saveCache<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}
export function loadCache<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? JSON.parse(s) as T : null
  } catch { return null }
}

