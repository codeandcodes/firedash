import type { Account, HoldingLot, Snapshot } from '@types/schema'

type AnyObj = Record<string, any>

function mapAccountType(monarchType?: string, monarchSubtype?: string, institutionName?: string | null): Account['type'] {
  const t = (monarchSubtype || monarchType || '').toLowerCase()
  if (!institutionName && (!monarchType && !monarchSubtype)) return 'other'
  if (t.includes('crypto')) return 'crypto'
  if (t.includes('roth')) return 'roth'
  if (t.includes('401k')) return '401k'
  if (t.includes('ira')) return 'ira'
  if (t.includes('hsa')) return 'hsa'
  if (t.includes('cash') || t.includes('checking') || t.includes('savings')) return 'cash'
  return 'taxable-brokerage'
}

function safeNumber(n: any): number | undefined {
  const x = typeof n === 'string' ? Number(n) : n
  return typeof x === 'number' && isFinite(x) ? x : undefined
}

export interface ImportResult {
  accounts: Account[]
  meta: { positions: number; accounts: number; lastSyncedAt?: string }
}

export function parseMonarchSnippet(raw: string): AnyObj {
  let s = (raw || '').trim()
  const tryParse = (t: string) => {
    // remove trailing commas that break strict JSON
    const cleaned = t.replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(cleaned)
  }
  try {
    if (s.startsWith('{') || s.startsWith('[')) return tryParse(s)
    if (s.startsWith('"aggregateHoldings"')) return tryParse(`{${s}}`)
    if (s.startsWith('"edges"')) return tryParse(`{${s}}`)
    // attempt to extract first {...} block
    const i = s.indexOf('{')
    const j = s.lastIndexOf('}')
    if (i !== -1 && j !== -1 && j > i) {
      return tryParse(s.slice(i, j + 1))
    }
  } catch (_) {
    // fall through
  }
  throw new Error('Unrecognized or invalid JSON snippet')
}

export function importMonarchInvestments(json: AnyObj): ImportResult {
  // Accept a variety of GraphQL-like shapes
  let edges: any[] | undefined =
    json?.data?.portfolio?.aggregateHoldings?.edges ??
    json?.data?.aggregateHoldings?.edges ??
    json?.aggregateHoldings?.edges ??
    (Array.isArray(json?.edges) ? json.edges : undefined)

  if (!edges && Array.isArray(json)) {
    // maybe directly an array of nodes
    edges = json
  }

  if (!edges || !Array.isArray(edges)) {
    throw new Error('Could not find aggregate holdings edges in pasted JSON')
  }

  const accountMap = new Map<string, Account>()
  let positions = 0
  let latestSync: string | undefined

  for (const e of edges) {
    const node = e?.node ?? e
    if (!node) continue
    positions++
    const holdingsArr = Array.isArray(node.holdings) ? node.holdings : []
    const security = node.security
    const basisTotal = safeNumber(node.basis)
    const nodeTotalValue = safeNumber(node.totalValue)
    const sumValues = holdingsArr.reduce((s: number, h: any) => s + (safeNumber(h.value) || 0), 0)

    for (const hh of holdingsArr) {
      const account = hh?.account
      const instName: string | null = account?.institution?.name || null
      const isInstitutionless = !instName

      // Determine target account id, type, and name
      let accountId: string
      let accType: Account['type']
      let accName: string

      if (isInstitutionless) {
        // Group into an 'other' synthetic account keyed by displayName to avoid mixing unrelated holdings
        const label = (account?.displayName || 'Unlinked') as string
        accountId = `other:${label}`
        accType = 'other'
        accName = `${label} (Other)`
      } else {
        // Use the real account id and map the type
        const baseId: string | undefined = account?.id
        if (!baseId) continue
        accountId = baseId
        const accTypeRaw = mapAccountType(account?.type?.name, account?.subtype?.name || account?.subtype?.display, instName)
        accType = accTypeRaw
        accName = account?.displayName || accountId

        // If crypto position was grouped under non-crypto account, split into a synthetic crypto view
        const isCryptoType = (hh?.type || '').toLowerCase() === 'cryptocurrency'
        const tick = (hh?.ticker || security?.ticker || '').toUpperCase()
        const isCryptoTicker = /-USD$/.test(tick) || /^(BTC|ETH|SOL|ADA|DOGE|MATIC)$/.test(tick)
        if ((isCryptoType || isCryptoTicker) && accTypeRaw !== 'crypto') {
          accountId = `${accountId}-crypto`
          accType = 'crypto'
          accName = `${(account?.displayName || 'Account')} (Crypto)`
        }
      }

      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, { id: accountId, type: accType, name: accName, holdings: [], cash_balance: 0 })
      }

      // Position values and proportional basis
      const units = safeNumber(hh.quantity) ?? 0
      // Prefer security.currentPrice if its timestamp is newer than holding's closingPriceUpdatedAt
      const hUpd = Date.parse(hh?.closingPriceUpdatedAt || '')
      const sUpd = Date.parse(security?.currentPriceUpdatedAt || '')
      const hPrice = safeNumber(hh.closingPrice)
      const sPrice = safeNumber(security?.currentPrice)
      const price = (isFinite(sUpd) && (!isFinite(hUpd) || sUpd > hUpd) ? sPrice : hPrice) ?? sPrice ?? hPrice ?? 0
      const value = safeNumber(hh.value) ?? (units && price ? units * price : 0)
      let cost_basis: number | undefined
      if (basisTotal && (nodeTotalValue || sumValues) && units) {
        const denom = nodeTotalValue || sumValues
        const share = (value && denom ? (value / denom) : 0) * (basisTotal as number)
        cost_basis = share / units
      }

      const lot: HoldingLot = {
        ticker: hh.ticker || security?.ticker || undefined,
        name: (hh.name || security?.name || undefined) as string | undefined,
        units,
        price: price || 0,
        cost_basis,
      }
      accountMap.get(accountId)!.holdings!.push(lot)
    }

    const sync = node.lastSyncedAt || security?.currentPriceUpdatedAt || holdingsArr[0]?.closingPriceUpdatedAt
    if (typeof sync === 'string') {
      if (!latestSync || new Date(sync) > new Date(latestSync)) latestSync = sync
    }
  }

  return { accounts: Array.from(accountMap.values()), meta: { positions, accounts: accountMap.size, lastSyncedAt: latestSync } }
}

const DEFAULT_RETIREMENT = { expected_spend_monthly: 4000, target_age: 60, withdrawal_strategy: 'fixed-real' } as Snapshot['retirement']
const DEFAULT_ASSUMPTIONS = { inflation_mode: 'fixed', inflation_pct: 0.02, rebalancing: { frequency: 'annual', threshold_pct: 0.2 } } as NonNullable<Snapshot['assumptions']>
const DEFAULT_PERSON = { current_age: 35 } as NonNullable<Snapshot['person']>

export function buildSnapshotFromImport(importResult: ImportResult, overrides?: Partial<Snapshot>): Snapshot {
  return {
    timestamp: overrides?.timestamp ?? new Date().toISOString(),
    currency: overrides?.currency ?? 'USD',
    accounts: importResult.accounts,
    real_estate: overrides?.real_estate ?? [],
    contributions: overrides?.contributions ?? [],
    expenses: overrides?.expenses ?? [],
    retirement: overrides?.retirement ?? { ...DEFAULT_RETIREMENT },
    social_security: overrides?.social_security ?? [],
    assumptions: overrides?.assumptions ?? { ...DEFAULT_ASSUMPTIONS },
    person: overrides?.person ?? { ...DEFAULT_PERSON }
  }
}

export function importMonarchFromString(raw: string): ImportResult {
  const obj = parseMonarchSnippet(raw)
  // If the parsed object itself is the aggregateHoldings value, wrap it
  let wrapped = obj
  if (!wrapped.aggregateHoldings && (wrapped.edges || wrapped.__typename === 'AggregateHoldingConnection')) {
    wrapped = { aggregateHoldings: wrapped }
  }
  return importMonarchInvestments(wrapped)
}
/*
Monarch investments importer (GraphQL aggregate holdings).
- Groups positions by holding.account; institutionless → synthetic 'Other'.
- Crypto under non-crypto → synthetic '(Crypto)' account to avoid mixing.
- Price selection prefers fresher security.currentPrice over stale holding closingPrice.
- Populates HoldingLot.name from holding/security when available.
*/
