import type { Snapshot, RealEstate } from '@types/schema'

type ImportMeta = { lastSyncedAt?: string }

function resolveTimestamp(base?: string, imported?: string, meta?: ImportMeta): string {
  const metaTs = meta?.lastSyncedAt
  if (metaTs) return metaTs
  if (imported) return imported
  if (base) return base
  return new Date().toISOString()
}

function normalizeId(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  return trimmed || null
}

function mergeRealEstateLists(baseList?: RealEstate[], importedList?: RealEstate[]): RealEstate[] {
  if (!importedList || importedList.length === 0) {
    return baseList ? [...baseList] : []
  }
  const baseEntries = (baseList || []).map((item) => ({
    item,
    key: normalizeId(item.id)
  }))
  const matched = new Set<RealEstate>()
  const merged = importedList.map((incoming) => {
    const key = normalizeId(incoming.id)
    const match = baseEntries.find((candidate) => !!candidate.key && candidate.key === key)
    if (!match) return { ...incoming }
    matched.add(match.item)
    const combined: RealEstate = {
      ...match.item,
      ...incoming
    }
    combined.mortgages = match.item.mortgages
    combined.rentals = match.item.rentals
    combined.rental = match.item.rental
    if (incoming.mortgage_balance == null && match.item.mortgage_balance != null) {
      combined.mortgage_balance = match.item.mortgage_balance
    }
    return combined
  })
  for (const candidate of baseEntries) {
    if (!matched.has(candidate.item)) {
      merged.push({ ...candidate.item })
    }
  }
  return merged
}

export function mergeMonarchImport(base: Snapshot | null | undefined, imported: Snapshot, meta?: ImportMeta): Snapshot {
  const mergedRealEstate = mergeRealEstateLists(base?.real_estate, imported.real_estate)
  if (!base) {
    return {
      ...imported,
      real_estate: mergedRealEstate,
      timestamp: resolveTimestamp(undefined, imported.timestamp, meta)
    }
  }
  return {
    ...base,
    accounts: imported.accounts ?? [],
    real_estate: mergedRealEstate,
    timestamp: resolveTimestamp(base.timestamp, imported.timestamp, meta),
    currency: base.currency || imported.currency || 'USD'
  }
}

/*
Merges Monarch import snapshots over an existing snapshot:
- Always replace accounts because holdings/cash change most frequently.
- Merge real estate entries by id so Monarch updates refresh values/mortgage balances without losing manual mortgage/rental details; unmatched base properties carry over.
- Preserve contributions, expenses, retirement config, etc. from the base snapshot.
*/
