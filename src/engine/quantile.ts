// P^2 quantile estimator (Jain & Chlamtac, 1985) for a single quantile q in (0,1)
export class P2Quantile {
  private q: number
  private n: number[] = [0, 0, 0, 0, 0]
  private ns: number[] = [0, 0, 0, 0, 0]
  private dn: number[] = [0, 0, 0, 0, 0]
  private qv: number[] = [0, 0, 0, 0, 0]
  private count = 0
  constructor(q: number) { this.q = q }
  add(x: number) {
    if (!isFinite(x)) return
    if (this.count < 5) {
      this.qv[this.count++] = x
      if (this.count === 5) {
        this.qv.sort((a,b)=>a-b)
        this.n = [0,1,2,3,4]
        this.ns = [0, 2*this.q, 4*this.q, 2 + 2*this.q, 4]
        this.dn = [0, this.q/2, this.q, (1+this.q)/2, 1]
      }
      return
    }
    // find cell k
    let k = 0
    if (x < this.qv[0]) { this.qv[0] = x; k = 0 }
    else if (x < this.qv[1]) k = 0
    else if (x < this.qv[2]) k = 1
    else if (x < this.qv[3]) k = 2
    else if (x <= this.qv[4]) k = 3
    else { this.qv[4] = x; k = 3 }
    for (let i = k+1; i < 5; i++) this.n[i] += 1
    for (let i = 0; i < 5; i++) this.ns[i] += this.dn[i]
    // adjust heights
    for (let i = 1; i <= 3; i++) {
      const d = this.ns[i] - this.n[i]
      if ((d >= 1 && this.n[i+1] - this.n[i] > 1) || (d <= -1 && this.n[i-1] - this.n[i] < -1)) {
        const s = Math.sign(d)
        const qs = this.parabolic(i, s)
        if (this.qv[i-1] < qs && qs < this.qv[i+1]) this.qv[i] = qs
        else this.qv[i] = this.linear(i, s)
        this.n[i] += s
      }
    }
  }
  get(): number {
    if (this.count === 0) return NaN
    if (this.count < 5) {
      const tmp = this.qv.slice(0, this.count).sort((a,b)=>a-b)
      const idx = Math.max(0, Math.min(tmp.length-1, Math.floor(this.q * (tmp.length-1))))
      return tmp[idx]
    }
    return this.qv[2]
  }
  private parabolic(i: number, d: number) {
    const p = this.qv
    const n = this.n
    return p[i] + d / (n[i+1] - n[i-1]) * ((n[i] - n[i-1] + d) * (p[i+1] - p[i])/(n[i+1]-n[i]) + (n[i+1]-n[i]-d) * (p[i] - p[i-1])/(n[i]-n[i-1]))
  }
  private linear(i: number, d: number) {
    return this.qv[i] + d * (this.qv[i + d] - this.qv[i]) / (this.n[i + d] - this.n[i])
  }
}

