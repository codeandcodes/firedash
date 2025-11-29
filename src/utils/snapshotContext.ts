import type { Snapshot, Account, HoldingLot, RealEstate, Contribution, Expense, SocialSecurity, Assumptions } from '@types/schema'

type CompactHolding = Pick<HoldingLot, 'ticker' | 'name' | 'asset_class'> & {
  units: number
  price: number
}

type CompactAccount = Pick<Account, 'id' | 'name' | 'type' | 'cash_balance'> & {
  holdings?: CompactHolding[]
}

type CompactRealEstate = Pick<RealEstate, 'id' | 'value' | 'mortgage_balance' | 'taxes' | 'insurance' | 'maintenance_pct' | 'rental'>

function compactHolding(lot: HoldingLot): CompactHolding {
  return {
    ticker: lot.ticker,
    name: lot.name,
    asset_class: lot.asset_class,
    units: lot.units,
    price: lot.price
  }
}

function compactAccount(account: Account): CompactAccount {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    cash_balance: account.cash_balance,
    holdings: (account.holdings || []).map(compactHolding)
  }
}

function compactRealEstate(entry: RealEstate): CompactRealEstate {
  return {
    id: entry.id,
    value: entry.value,
    mortgage_balance: entry.mortgage_balance,
    taxes: entry.taxes,
    insurance: entry.insurance,
    maintenance_pct: entry.maintenance_pct,
    rental: entry.rental
  }
}

function compactContrib(c: Contribution) {
  return {
    account_id: c.account_id,
    amount: c.amount,
    frequency: c.frequency,
    start: c.start,
    end: c.end
  }
}

function compactExpense(e: Expense) {
  return {
    amount: e.amount,
    frequency: e.frequency,
    category: e.category,
    start: e.start,
    end: e.end
  }
}

function compactSocial(s: SocialSecurity) {
  return {
    claim_age: s.claim_age,
    monthly_amount: s.monthly_amount,
    COLA: s.COLA
  }
}

function compactAssumptions(a?: Assumptions) {
  if (!a) return undefined
  return {
    inflation_mode: a.inflation_mode,
    inflation_pct: a.inflation_pct,
    rebalancing: a.rebalancing,
    tax_profile: a.tax_profile
  }
}

function computeAccountSummary(accounts: Account[]) {
  const totals: Record<Account['type'], number> = {
    'taxable-brokerage': 0,
    '401k': 0,
    'ira': 0,
    'roth': 0,
    'hsa': 0,
    'cash': 0,
    'crypto': 0,
    'other': 0
  }
  let investableAssets = 0
  let cashTotal = 0
  for (const acc of accounts) {
    const holdingsValue = (acc.holdings || []).reduce((sum, lot) => sum + lot.units * lot.price, 0)
    const total = (acc.cash_balance || 0) + holdingsValue
    totals[acc.type] = (totals[acc.type] || 0) + total
    if (acc.type === 'cash') {
      cashTotal += total
    } else {
      investableAssets += total
    }
  }
  return { investableAssets, cashTotal, totals }
}

export function buildLLMSnapshotContext(snapshot: Snapshot) {
  return {
    timestamp: snapshot.timestamp,
    currency: snapshot.currency,
    person: snapshot.person,
    retirement: snapshot.retirement,
    accounts: snapshot.accounts.map(compactAccount),
    account_summary: computeAccountSummary(snapshot.accounts),
    real_estate: (snapshot.real_estate || []).map(compactRealEstate),
    contributions: (snapshot.contributions || []).map(compactContrib),
    expenses: (snapshot.expenses || []).map(compactExpense),
    social_security: (snapshot.social_security || []).map(compactSocial),
    assumptions: compactAssumptions(snapshot.assumptions)
  }
}

/*
Produces a trimmed snapshot object for LLM prompts:
- Keeps account/holding basics plus aggregated totals to highlight investable assets.
- Drops metadata, worker config, and other extraneous fields to keep prompts within context limits.
*/
