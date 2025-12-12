import type { Account, Snapshot } from '@types/schema'

export type AccountChangeType = 'new' | 'removed' | 'updated'

export interface AccountDiff {
  id: string
  name?: string
  type: Account['type']
  change: AccountChangeType
  oldValue?: number
  newValue?: number
  institution?: string
}

const VALUE_EPSILON = 0.01

function asNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(num) ? num : 0
}

function computeAccountValue(account: Account): number {
  const holdingsValue = (account.holdings || []).reduce((sum, lot) => {
    const units = asNumber(lot.units)
    const price = asNumber(lot.price)
    return sum + units * price
  }, 0)
  const cash = asNumber(account.cash_balance)
  return holdingsValue + cash
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readInstitutionName(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isRecord(value)) {
    const name = value.name
    return typeof name === 'string' ? name : undefined
  }
  return undefined
}

function extractInstitution(account: Account | undefined): string | undefined {
  if (!account || !isRecord(account.metadata)) return undefined
  const metadata = account.metadata as Record<string, unknown>
  const direct = readInstitutionName(metadata.institution)
  if (direct) return direct
  const credential = metadata.credential
  const credentialInstitution = readInstitutionName(credential)
  if (credentialInstitution) return credentialInstitution
  if (isRecord(credential)) {
    const nested = readInstitutionName(credential.institution)
    if (nested) return nested
  }
  return undefined
}

export function buildAccountDiffs(base: Snapshot | null | undefined, next: Snapshot): AccountDiff[] {
  const diffs: AccountDiff[] = []
  const baseAccounts = new Map<string, Account>()
  if (base?.accounts?.length) {
    for (const acc of base.accounts) {
      if (acc?.id) {
        baseAccounts.set(acc.id, acc)
      }
    }
  }

  for (const acc of next.accounts || []) {
    if (!acc?.id) continue
    const prev = baseAccounts.get(acc.id)
    const newValue = computeAccountValue(acc)
    if (!prev) {
      diffs.push({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        change: 'new',
        newValue,
        institution: extractInstitution(acc)
      })
    } else {
      const oldValue = computeAccountValue(prev)
      const diffAmount = Math.abs(newValue - oldValue)
      if (diffAmount > VALUE_EPSILON) {
        diffs.push({
          id: acc.id,
          name: acc.name || prev.name,
          type: acc.type,
          change: 'updated',
          oldValue,
          newValue,
          institution: extractInstitution(acc) || extractInstitution(prev)
        })
      }
      baseAccounts.delete(acc.id)
    }
  }

  for (const leftover of baseAccounts.values()) {
    diffs.push({
      id: leftover.id,
      name: leftover.name,
      type: leftover.type,
      change: 'removed',
      oldValue: computeAccountValue(leftover),
      institution: extractInstitution(leftover)
    })
  }

  const order: Record<AccountChangeType, number> = { removed: 0, updated: 1, new: 2 }
  return diffs.sort((a, b) => {
    const orderDiff = order[a.change] - order[b.change]
    if (orderDiff !== 0) return orderDiff
    return (a.name || a.id).localeCompare(b.name || b.id)
  })
}

export function formatCurrency(value?: number): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 }).format(value)
}

/*
Computes per-account diffs between the currently loaded snapshot and a merged Monarch import.
- Marks accounts as new, updated (balance changed), or removed.
- Provides formatted metadata so the UI can highlight changes for review before applying.
*/
