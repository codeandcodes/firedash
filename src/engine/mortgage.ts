/**
 * Mortgage amortization helpers. Computes month-by-month principal/interest and payoff timing.
 */
export interface AmortMonth {
  month: number
  interest: number
  principal: number
  balance: number
}

export interface AmortizationResult {
  months: AmortMonth[]
  paidOffAtMonth?: number
  negativeAmortization?: boolean
}

export function amortizationSchedule(principal: number, annualRate: number, payment: number, maxMonths = 600): AmortizationResult {
  const months: AmortMonth[] = []
  let P = Math.max(0, principal)
  const r = Math.max(0, annualRate) / 12
  const pmt = Math.max(0, payment)
  if (P === 0 || pmt === 0) return { months: [{ month: 0, interest: 0, principal: 0, balance: P }] }
  const negativeAmortization = r > 0 && pmt <= P * r
  let paidOffAtMonth: number | undefined
  for (let m = 0; m < maxMonths; m++) {
    const interest = P * r
    const principalPay = Math.max(0, pmt - interest)
    P = P - principalPay
    if (P < 1e-6) { P = 0; months.push({ month: m, interest, principal: principalPay, balance: P }); paidOffAtMonth = m + 1; break }
    months.push({ month: m, interest, principal: principalPay, balance: P })
    if (negativeAmortization) {
      // interest-only or negative amortization — will not pay off
      // allow schedule to run to horizon
    }
  }
  return { months, paidOffAtMonth, negativeAmortization }
}
