import { describe, expect, it } from 'vitest'
import type { Snapshot, RealEstate } from '../../src/types/schema'
import { mergeMonarchImport } from '../../src/utils/snapshotMerge'

function buildSnapshot(partial?: Partial<Snapshot>): Snapshot {
  return {
    timestamp: partial?.timestamp || '2024-01-01T00:00:00.000Z',
    currency: partial?.currency || 'USD',
    accounts: partial?.accounts || [],
    real_estate: partial?.real_estate || [],
    contributions: partial?.contributions || [],
    expenses: partial?.expenses || [],
    retirement: partial?.retirement || { expected_spend_monthly: 4000, target_age: 60, withdrawal_strategy: 'fixed-real' },
    social_security: partial?.social_security || [],
    assumptions: partial?.assumptions || { inflation_mode: 'fixed', inflation_pct: 0.02 },
    person: partial?.person || { current_age: 35 }
  }
}

describe('mergeMonarchImport', () => {
  it('preserves mortgages and rentals from the base snapshot when Monarch omits them', () => {
    const baseProperty: RealEstate = {
      id: 'home',
      value: 500000,
      mortgage_balance: 250000,
      mortgages: [{ id: 'mort-1', balance: 250000, rate: 0.032 }],
      rentals: [{ id: 'rent-1', rent: 2000 }],
      rental: { id: 'rent-1', rent: 2000 },
      appreciation_pct: 0.03
    }
    const importedProperty: RealEstate = {
      id: 'home',
      value: 525000,
      mortgage_balance: 240000
    }
    const base = buildSnapshot({ real_estate: [baseProperty] })
    const imported = buildSnapshot({ real_estate: [importedProperty] })

    const result = mergeMonarchImport(base, imported)
    const mergedProp = result.real_estate?.[0]

    expect(mergedProp?.value).toBe(525000)
    expect(mergedProp?.mortgage_balance).toBe(240000)
    expect(mergedProp?.mortgages).toEqual(baseProperty.mortgages)
    expect(mergedProp?.rentals).toEqual(baseProperty.rentals)
    expect(mergedProp?.rental).toEqual(baseProperty.rental)
  })

  it('retains existing properties when Monarch import does not include real estate data', () => {
    const base = buildSnapshot({
      real_estate: [{ id: 'cabin', value: 120000, appreciation_pct: 0.02 }]
    })
    const imported = buildSnapshot({ real_estate: [] })

    const result = mergeMonarchImport(base, imported)
    expect(result.real_estate).toEqual(base.real_estate)
  })

  it('uses Monarch timestamp metadata when no base snapshot exists', () => {
    const imported = buildSnapshot({})
    const metaTs = '2024-03-15T09:00:00.000Z'

    const result = mergeMonarchImport(null, imported, { lastSyncedAt: metaTs })
    expect(result.timestamp).toBe(metaTs)
  })
})
