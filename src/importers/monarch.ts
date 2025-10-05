import type { Account, HoldingLot, Snapshot, RealEstate } from '@types/schema'

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
  realEstate: RealEstate[]
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

type MonarchAccountMetadata = {
  mask?: string
  subtype?: string
  icon?: string
  logoUrl?: string
  credential?: {
    id?: string
    updateRequired?: boolean
    dataProvider?: string | null
    disconnectedFromDataProviderAt?: string | null
    syncDisabledAt?: string | null
    syncDisabledReason?: string | null
  }
  institution?: {
    id?: string
    name?: string
    status?: string | null
    plaidStatus?: AnyObj | null
    newConnectionsDisabled?: boolean
    hasIssuesReported?: boolean
    hasIssuesReportedMessage?: string | null
    url?: string | null
    transactionsStatus?: string | null
    balanceStatus?: string | null
    logoUrl?: string | null
  }
  ownedByUser?: {
    id?: string
    name?: string
    profilePictureUrl?: string | null
  }
  limit?: number
  includeBalanceInNetWorth?: boolean
  isAsset?: boolean
  isHidden?: boolean
  syncDisabled?: boolean
  connectionStatus?: {
    connectionStatusCode?: string
    copyTitle?: string
    inAppSmallCopy?: string
    inAppCopy?: string
    helpCenterUrl?: string
  } | null
}

type MonarchAccountBalance = {
  id: string
  name?: string
  typeName?: string
  typeDisplay?: string
  typeGroup?: string
  balance: number
  asOf?: string
  includeInNetWorth: boolean
  metadata?: MonarchAccountMetadata
}

const DEFAULT_APPRECIATION = 0.035

function normalizeLabel(value?: string | null): string | null {
  if (!value) return null
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned || null
}

function extractAccountMetadata(entry: AnyObj | undefined): MonarchAccountMetadata | undefined {
  if (!entry || typeof entry !== 'object') return undefined
  const metadata: MonarchAccountMetadata = {}

  if (typeof entry.mask === 'string') metadata.mask = entry.mask
  const subtypeName = entry?.subtype?.display || entry?.subtype?.name
  if (typeof subtypeName === 'string') metadata.subtype = subtypeName
  if (typeof entry.icon === 'string') metadata.icon = entry.icon
  const logo = entry.logoUrl || entry?.institution?.logo
  if (typeof logo === 'string') metadata.logoUrl = logo

  if (entry.credential && typeof entry.credential === 'object') {
    metadata.credential = {
      id: typeof entry.credential.id === 'string' ? entry.credential.id : undefined,
      updateRequired: entry.credential.updateRequired === true,
      dataProvider: typeof entry.credential.dataProvider === 'string' ? entry.credential.dataProvider : entry.credential.dataProvider ?? null,
      disconnectedFromDataProviderAt:
        typeof entry.credential.disconnectedFromDataProviderAt === 'string'
          ? entry.credential.disconnectedFromDataProviderAt
          : null,
      syncDisabledAt:
        typeof entry.credential.syncDisabledAt === 'string' ? entry.credential.syncDisabledAt : null,
      syncDisabledReason:
        typeof entry.credential.syncDisabledReason === 'string' ? entry.credential.syncDisabledReason : null,
    }
  }

  const institution = entry?.institution || entry?.credential?.institution
  if (institution && typeof institution === 'object') {
    metadata.institution = {
      id: typeof institution.id === 'string' ? institution.id : undefined,
      name: typeof institution.name === 'string' ? institution.name : undefined,
      status: typeof institution.status === 'string' || institution.status === null ? institution.status : undefined,
      plaidStatus: institution.plaidStatus ?? null,
      newConnectionsDisabled: institution.newConnectionsDisabled === true,
      hasIssuesReported: institution.hasIssuesReported === true,
      hasIssuesReportedMessage:
        typeof institution.hasIssuesReportedMessage === 'string'
          ? institution.hasIssuesReportedMessage
          : null,
      url: typeof institution.url === 'string' ? institution.url : null,
      transactionsStatus:
        typeof institution.transactionsStatus === 'string' ? institution.transactionsStatus : null,
      balanceStatus: typeof institution.balanceStatus === 'string' ? institution.balanceStatus : null,
      logoUrl: typeof institution.logo === 'string' ? institution.logo : undefined,
    }
  }

  if (entry.ownedByUser && typeof entry.ownedByUser === 'object') {
    metadata.ownedByUser = {
      id: typeof entry.ownedByUser.id === 'string' ? entry.ownedByUser.id : undefined,
      name: typeof entry.ownedByUser.name === 'string' ? entry.ownedByUser.name : undefined,
      profilePictureUrl:
        typeof entry.ownedByUser.profilePictureUrl === 'string' ? entry.ownedByUser.profilePictureUrl : null,
    }
  }

  const limit = safeNumber(entry.limit)
  if (typeof limit === 'number') metadata.limit = limit

  metadata.includeBalanceInNetWorth = entry?.includeBalanceInNetWorth !== false
  metadata.isAsset = entry?.isAsset === true
  metadata.isHidden = entry?.isHidden === true
  metadata.syncDisabled = entry?.syncDisabled === true

  if (entry.connectionStatus && typeof entry.connectionStatus === 'object') {
    metadata.connectionStatus = {
      connectionStatusCode:
        typeof entry.connectionStatus.connectionStatusCode === 'string'
          ? entry.connectionStatus.connectionStatusCode
          : undefined,
      copyTitle:
        typeof entry.connectionStatus.copyTitle === 'string' ? entry.connectionStatus.copyTitle : undefined,
      inAppSmallCopy:
        typeof entry.connectionStatus.inAppSmallCopy === 'string'
          ? entry.connectionStatus.inAppSmallCopy
          : undefined,
      inAppCopy:
        typeof entry.connectionStatus.inAppCopy === 'string'
          ? entry.connectionStatus.inAppCopy
          : undefined,
      helpCenterUrl:
        typeof entry.connectionStatus.helpCenterUrl === 'string'
          ? entry.connectionStatus.helpCenterUrl
          : undefined,
    }
  } else if (entry.connectionStatus === null) {
    metadata.connectionStatus = null
  }

  return Object.keys(metadata).length ? metadata : undefined
}

function extractAccountsPayload(raw: AnyObj | undefined): MonarchAccountBalance[] {
  const summaries = raw?.data?.accountTypeSummaries ?? raw?.accountTypeSummaries
  const result: MonarchAccountBalance[] = []

  if (Array.isArray(summaries)) {
    for (const summary of summaries) {
      const typeName = typeof summary?.type?.name === 'string' ? summary.type.name : undefined
      if (typeName && typeName.toLowerCase() === 'brokerage') continue

      const accounts = Array.isArray(summary?.accounts) ? summary.accounts : []
      for (const entry of accounts) {
        const id = typeof entry?.id === 'string' ? entry.id : undefined
        if (!id) continue
        const balance =
          safeNumber(entry?.displayBalance) ?? safeNumber(entry?.signedBalance) ?? safeNumber(entry?.balance) ?? 0
        const asOf = typeof entry?.updatedAt === 'string' ? entry.updatedAt : undefined
        const metadata = extractAccountMetadata(entry)
        result.push({
          id,
          name: typeof entry?.displayName === 'string' ? entry.displayName : undefined,
          typeName,
          typeDisplay: typeof summary?.type?.display === 'string' ? summary.type.display : undefined,
          typeGroup: typeof summary?.type?.group === 'string' ? summary.type.group : undefined,
          balance,
          asOf,
          includeInNetWorth: entry?.includeBalanceInNetWorth !== false && entry?.includeInNetWorth !== false,
          metadata
        })
      }
    }
    return result
  }

  const list = raw?.data?.accounts ?? raw?.accounts
  if (!Array.isArray(list)) return []
  for (const entry of list) {
    const id = typeof entry?.id === 'string' ? entry.id : undefined
    if (!id) continue
    const balances = Array.isArray(entry?.recentBalances) ? entry.recentBalances : []
    let latestBalance: number | undefined
    let latestDate: string | undefined
    for (const bal of balances) {
      if (typeof bal === 'number') {
        latestBalance = bal
        continue
      }
      const value = safeNumber(bal?.balance)
      if (value == null) continue
      const dateStr = typeof bal?.date === 'string' ? bal.date : undefined
      if (!latestDate || (dateStr && new Date(dateStr) > new Date(latestDate))) {
        latestBalance = value
        latestDate = dateStr
      }
    }
    if (latestBalance == null) latestBalance = 0
    result.push({
      id,
      name: typeof entry?.name === 'string' ? entry.name : undefined,
      typeName: typeof entry?.type?.name === 'string' ? entry.type.name : undefined,
      typeDisplay: typeof entry?.type?.display === 'string' ? entry.type.display : undefined,
      typeGroup: typeof entry?.type?.group === 'string' ? entry.type.group : undefined,
      balance: latestBalance,
      asOf: latestDate,
      includeInNetWorth: entry?.includeInNetWorth !== false
    })
  }
  return result
}

type BalanceCategory = 'cash' | 'real-estate' | 'loan' | 'investment' | null

function resolveAccountCategory(acc: MonarchAccountBalance): BalanceCategory {
  const tokens = [acc.typeName, acc.typeDisplay, acc.typeGroup, acc.name]
    .map((v) => (typeof v === 'string' ? v.toLowerCase().replace(/_/g, ' ') : ''))
    .filter(Boolean)
  const text = tokens.join(' ')
  if (!text && typeof acc.typeName === 'string') {
    const raw = acc.typeName.toLowerCase()
    if (raw === 'real_estate') return 'real-estate'
    if (raw === 'loan') return 'loan'
    if (raw === 'depository') return 'cash'
    if (raw === 'brokerage' || raw === 'investment') return 'investment'
  }
  if (text.includes('real estate')) return 'real-estate'
  if (text.includes('loan') || text.includes('mortgage') || text.includes('liability') || text.includes('credit')) return 'loan'
  if (text.includes('depository') || text.includes('cash') || text.includes('bank') || text.includes('checking') || text.includes('savings')) return 'cash'
  if (text.includes('investment') || text.includes('brokerage') || text.includes('retirement')) return 'investment'
  return null
}

export function importMonarchInvestments(json: AnyObj, accountsPayload?: AnyObj): ImportResult {
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

  if (!Array.isArray(edges)) edges = []

  const accountMap = new Map<string, Account>()
  let positions = 0
  let latestSync: string | undefined
  const updateLatest = (ts?: string) => {
    if (!ts) return
    const date = new Date(ts)
    if (!Number.isFinite(date.valueOf())) return
    if (!latestSync || date > new Date(latestSync)) {
      latestSync = date.toISOString()
    }
  }

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
        accountMap.set(accountId, {
          id: accountId,
          type: accType,
          name: accName,
          holdings: [],
          cash_balance: 0,
          metadata: undefined
        })
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
    if (typeof sync === 'string') updateLatest(sync)
  }

  const balances = extractAccountsPayload(accountsPayload)
  const usedPropertyIds = new Set<string>()
  const ensurePropertyId = (base: string): string => {
    const normalized = base.replace(/\s+/g, ' ').trim() || 'Property'
    let candidate = normalized
    let counter = 2
    while (usedPropertyIds.has(candidate)) {
      candidate = `${normalized} (${counter})`
      counter += 1
    }
    usedPropertyIds.add(candidate)
    return candidate
  }

  const realEstateDrafts: Array<{ entity: RealEstate; accountId: string; normalizedName: string | null }> = []
  const loanDrafts: Array<{ accountId: string; name?: string; normalizedName: string | null; balance: number; metadata?: MonarchAccountMetadata }> = []

  const ensureAccountRecord = (
    accId: string,
    type: Account['type'],
    name?: string,
    metadata?: MonarchAccountMetadata
  ) => {
    if (!accountMap.has(accId)) {
      accountMap.set(accId, {
        id: accId,
        type,
        name: name || accId,
        holdings: [],
        cash_balance: 0,
        metadata: metadata ? { ...metadata } : undefined
      })
    } else {
      const existing = accountMap.get(accId)!
      if (!existing.name && name) existing.name = name
      if (existing.type === 'other' && type !== 'other') existing.type = type
      if (metadata) {
        existing.metadata = { ...(existing.metadata || {}), ...metadata }
      }
    }
    return accountMap.get(accId)!
  }

  for (const acc of balances) {
    if (!acc.includeInNetWorth) continue
    updateLatest(acc.asOf)
    const category = resolveAccountCategory(acc)
    if (category === 'investment') {
      continue
    }
    if (category === 'real-estate') {
      const label = ensurePropertyId(acc.name || acc.id)
      const entity: RealEstate = {
        id: label,
        value: Math.max(0, acc.balance || 0),
        appreciation_pct: DEFAULT_APPRECIATION
      }
      realEstateDrafts.push({ entity, accountId: acc.id, normalizedName: normalizeLabel(acc.name) || normalizeLabel(label) })
      continue
    }
    if (category === 'cash') {
      const balance = acc.balance || 0
      const record = ensureAccountRecord(acc.id, balance >= 0 ? 'cash' : 'other', acc.name, acc.metadata)
      record.cash_balance = balance
      continue
    }
    if (category === 'loan') {
      loanDrafts.push({
        accountId: acc.id,
        name: acc.name,
        normalizedName: normalizeLabel(acc.name) || normalizeLabel(acc.id),
        balance: Math.abs(acc.balance || 0),
        metadata: acc.metadata
      })
      continue
    }

    // Fallback: create an account entry using the reported balance.
    const fallbackType = mapAccountType(acc.typeName, undefined, undefined)
    const record = ensureAccountRecord(acc.id, fallbackType, acc.name, acc.metadata)
    if (!record.holdings || record.holdings.length === 0) {
      record.cash_balance = acc.balance || 0
    }
  }

  const unmatchedLoans: typeof loanDrafts = []
  for (const loan of loanDrafts) {
    const match = realEstateDrafts.find((re) =>
      re.accountId === loan.accountId ||
      (loan.normalizedName && re.normalizedName && (
        loan.normalizedName === re.normalizedName ||
        loan.normalizedName.includes(re.normalizedName) ||
        re.normalizedName.includes(loan.normalizedName)
      ))
    )
    if (match) {
      match.entity.mortgage_balance = loan.balance
    } else {
      unmatchedLoans.push(loan)
    }
  }

  for (const loan of unmatchedLoans) {
    const target = accountMap.get(loan.accountId)
    const liability = -Math.abs(loan.balance)
    if (target) {
      target.cash_balance = (target.cash_balance || 0) + liability
      if (!target.name && loan.name) target.name = loan.name
      if (loan.metadata) {
        target.metadata = { ...(target.metadata || {}), ...loan.metadata }
      }
    } else {
      accountMap.set(loan.accountId, {
        id: loan.accountId,
        type: 'other',
        name: loan.name || loan.accountId,
        holdings: [],
        cash_balance: liability,
        metadata: loan.metadata ? { ...loan.metadata } : undefined
      })
    }
  }

  const realEstate = realEstateDrafts.map((draft) => draft.entity)

  return { accounts: Array.from(accountMap.values()), realEstate, meta: { positions, accounts: accountMap.size, lastSyncedAt: latestSync } }
}

const DEFAULT_RETIREMENT = { expected_spend_monthly: 4000, target_age: 60, withdrawal_strategy: 'fixed-real' } as Snapshot['retirement']
const DEFAULT_ASSUMPTIONS = { inflation_mode: 'fixed', inflation_pct: 0.02, rebalancing: { frequency: 'annual', threshold_pct: 0.2 } } as NonNullable<Snapshot['assumptions']>
const DEFAULT_PERSON = { current_age: 35 } as NonNullable<Snapshot['person']>

export function buildSnapshotFromImport(importResult: ImportResult, overrides?: Partial<Snapshot>): Snapshot {
  return {
    timestamp: overrides?.timestamp ?? new Date().toISOString(),
    currency: overrides?.currency ?? 'USD',
    accounts: importResult.accounts,
    real_estate: overrides?.real_estate ?? importResult.realEstate ?? [],
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
  if (!wrapped?.aggregateHoldings && (wrapped?.edges || wrapped?.__typename === 'AggregateHoldingConnection')) {
    wrapped = { aggregateHoldings: wrapped }
  }
  return importMonarchInvestments(wrapped, obj)
}
/*
Monarch investments importer (GraphQL aggregate holdings + accounts balances).
- Groups positions by holding.account; institutionless → synthetic 'Other'.
- Crypto under non-crypto → synthetic '(Crypto)' account to avoid mixing.
- Price selection prefers fresher security.currentPrice over stale holding closingPrice.
- Populates HoldingLot.name from holding/security when available.
- Merges Monarch accounts payload to fill cash balances, real estate values, and mortgage liabilities.
*/
