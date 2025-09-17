export interface RandomContext {
  random: () => number
  randn: () => number
}

function createScalarRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRandomContext(seed?: number): RandomContext {
  const rand = seed == null ? Math.random : createScalarRng(seed)
  let spare: number | null = null
  const randn = () => {
    if (spare != null) {
      const v = spare
      spare = null
      return v
    }
    let u = 0
    let v = 0
    while (u === 0) u = rand()
    while (v === 0) v = rand()
    const mag = Math.sqrt(-2.0 * Math.log(u))
    spare = mag * Math.sin(2.0 * Math.PI * v)
    return mag * Math.cos(2.0 * Math.PI * v)
  }
  return { random: rand, randn }
}

export function offsetSeed(base: number | undefined, offset: number): number | undefined {
  if (base == null) return undefined
  const combined = (base + offset) >>> 0
  return combined
}

