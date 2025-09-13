import type { Account, HoldingLot } from '@types/schema'

type AnyObj = Record<string, any>

function mapAccountType(monarchType?: string, monarchSubtype?: string): Account['type'] {
  const t = (monarchSubtype || monarchType || '').toLowerCase()
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
    const holding0 = node.holdings?.[0]
    const security = node.security || holding0
    const account = holding0?.account
    let accountId: string | undefined = account?.id
    if (!accountId) continue
    const isCrypto =
      typeof (security?.ticker || holding0?.ticker) === 'string' && /-USD$/.test((security?.ticker || holding0?.ticker).toUpperCase())
    const accTypeRaw = mapAccountType(account?.subtype?.name || account?.type?.name, account?.subtype?.display)
    let accType = accTypeRaw
    let accName: string = account?.displayName || accountId
    // If Monarch grouped crypto under brokerage, split into a synthetic crypto account
    if (isCrypto && accTypeRaw !== 'crypto') {
      accountId = `${accountId}-crypto`
      accType = 'crypto'
      accName = `${(account?.displayName || 'Account')} (Crypto)`
    }
    if (!accountMap.has(accountId)) {
      accountMap.set(accountId, { id: accountId, type: accType, name: accName, holdings: [], cash_balance: 0 })
    }

    const units = safeNumber(node.quantity) ?? safeNumber(holding0?.quantity) ?? 0
    const price = safeNumber(security?.currentPrice) ?? safeNumber(holding0?.closingPrice) ?? (safeNumber(node.totalValue) && units ? (node.totalValue as number) / units : 0)
    const basisTotal = safeNumber(node.basis)
    const cb = basisTotal && units ? basisTotal / units : undefined

    const lot: HoldingLot = {
      ticker: security?.ticker || holding0?.ticker || undefined,
      units,
      price: price || 0,
      cost_basis: cb
    }

    accountMap.get(accountId)!.holdings!.push(lot)

    const sync = node.lastSyncedAt || security?.currentPriceUpdatedAt || holding0?.closingPriceUpdatedAt
    if (typeof sync === 'string') {
      if (!latestSync || new Date(sync) > new Date(latestSync)) latestSync = sync
    }
  }

  return { accounts: Array.from(accountMap.values()), meta: { positions, accounts: accountMap.size, lastSyncedAt: latestSync } }
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
