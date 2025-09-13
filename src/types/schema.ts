// Snapshot schema types and basic validator

export type Currency = 'USD'

export type AccountType =
  | 'taxable-brokerage'
  | '401k'
  | 'ira'
  | 'roth'
  | 'hsa'
  | 'cash'

export interface HoldingLot {
  ticker?: string
  asset_class?: string
  units: number
  price: number
  cost_basis?: number
}

export interface Account {
  id: string
  type: AccountType
  name?: string
  holdings?: HoldingLot[]
  cash_balance?: number
}

export interface RentalInfo {
  rent: number
  vacancy_pct?: number
  expenses?: number
}

export interface RealEstate {
  id: string
  value: number
  mortgage_balance?: number
  rate?: number
  payment?: number
  taxes?: number
  insurance?: number
  maintenance_pct?: number
  rental?: RentalInfo
  sale_plan?: { year: number; costs_pct?: number }
}

export type Frequency = 'once' | 'monthly' | 'annual'

export interface Contribution {
  account_id: string
  amount: number
  frequency: Frequency
  start?: string
  end?: string
}

export interface Expense {
  amount: number
  frequency: Frequency
  start?: string
  end?: string
  category?: string
}

export interface RetirementPlan {
  target_date?: string
  target_age?: number
  expected_spend_monthly: number
  withdrawal_strategy?: 'fixed-real' | 'guardrails' | 'vpw' | 'floor-upside'
}

export interface SocialSecurity {
  claim_age: number
  monthly_amount: number
  COLA?: number
}

export interface PersonProfile {
  current_age?: number
}

export interface Assumptions {
  inflation_mode?: 'fixed' | 'historical_CPI'
  inflation_pct?: number
  rebalancing?: { frequency?: 'monthly' | 'quarterly' | 'annual'; threshold_pct?: number }
  tax_profile?: {
    federal_marginal?: number
    qualified_dividends_rate?: number
    ltcg_rate?: number
    state_rate?: number
  }
}

export interface Snapshot {
  timestamp: string
  currency: Currency
  accounts: Account[]
  real_estate?: RealEstate[]
  contributions?: Contribution[]
  expenses?: Expense[]
  retirement: RetirementPlan
  social_security?: SocialSecurity[]
  assumptions?: Assumptions
  person?: PersonProfile
}

export function validateSnapshot(data: any): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  function push(cond: boolean, msg: string) {
    if (!cond) errors.push(msg)
  }

  push(!!data && typeof data === 'object', 'Snapshot must be an object')
  if (!data || typeof data !== 'object') return { valid: false, errors }

  push(typeof data.timestamp === 'string', 'timestamp is required (ISO string)')
  push(data.currency === 'USD', "currency must be 'USD'")
  push(Array.isArray(data.accounts), 'accounts must be an array')

  if (Array.isArray(data.accounts)) {
    for (const [i, a] of data.accounts.entries()) {
      push(typeof a.id === 'string', `accounts[${i}].id required`)
      push(typeof a.type === 'string', `accounts[${i}].type required`)
      if (a.holdings) {
        for (const [j, h] of a.holdings.entries()) {
          push(typeof h.units === 'number', `accounts[${i}].holdings[${j}].units number`)
          push(typeof h.price === 'number', `accounts[${i}].holdings[${j}].price number`)
        }
      }
    }
  }

  push(!!data.retirement && typeof data.retirement === 'object', 'retirement section required')
  if (data.retirement) {
    push(
      typeof data.retirement.expected_spend_monthly === 'number',
      'retirement.expected_spend_monthly required (number)'
    )
  }

  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}
