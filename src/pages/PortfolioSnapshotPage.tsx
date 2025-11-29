import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography, InputAdornment } from '@mui/material'
import { useApp } from '@state/AppContext'
import { useChat } from '@state/ChatContext'
import type { Account, RealEstate, Snapshot } from '@types/schema'
import { computeAllocation, classifyHolding } from '@engine/alloc'
import { PieChart } from '@components/charts/PieChart'
import { MultiLineChart } from '@components/charts/MultiLineChart'

import { headingStyle, accentBorder, SECTION_COLORS, mutedChip } from '../utils/sectionColors'

const ACCOUNT_COLORS = ['#7aa2f7','#91d7e3','#a6da95','#f5a97f','#eed49f','#c6a0f6','#8bd5ca','#f28fad','#f0c6c6','#b8c0e0']
const HOLDING_COLORS = ['#7aa2f7','#91d7e3','#a6da95','#f5a97f','#eed49f','#c6a0f6','#8bd5ca','#f28fad','#f0c6c6','#b8c0e0']
const MONEY0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const MONEY2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const UNITS_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const PCT_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const DEFAULT_TIMELINE_MONTHS = 40 * 12

interface AggregatedHolding {
  key: string
  label: string
  units: number | null
  price: number | null
  value: number
}

interface CashflowItem { label: string; amount: number }
interface CashflowBucket { total: number; items: CashflowItem[] }
interface CashflowYearRow {
  year: number
  contributions: CashflowBucket
  expenses: CashflowBucket
  social: CashflowBucket
}

interface AmortizationResult {
  balanceSeries: number[]
  rentSeries: number[]
  payoffMonth?: number
}

const fmtMoney0 = (value: number) => MONEY0.format(Math.round(value || 0))
const fmtMoney2 = (value: number) => MONEY2.format(value || 0)
const fmtUnits = (value: number | null) => value == null ? '-' : UNITS_FMT.format(value)

const accountDisplayName = (account: Account) => (account.name?.trim() || account.id)

const accountValue = (account: Account) => (account.holdings || []).reduce((sum, lot) => sum + lot.units * lot.price, 0) + (account.cash_balance || 0)

function aggregateHoldings(account: Account): AggregatedHolding[] {
  const map = new Map<string, { label: string; units: number; value: number }>()
  for (const lot of account.holdings || []) {
    const value = lot.units * lot.price
    if (!isFinite(value)) continue
    const label = lot.ticker || lot.name || lot.asset_class || 'Holding'
    const current = map.get(label) || { label, units: 0, value: 0 }
    current.units += lot.units
    current.value += value
    map.set(label, current)
  }
  if (account.cash_balance && account.cash_balance > 0) {
    map.set('Cash', { label: 'Cash', units: 0, value: account.cash_balance })
  }
  return Array.from(map.values())
    .map((entry) => ({
      key: entry.label,
      label: entry.label,
      units: entry.label === 'Cash' ? null : entry.units,
      price: entry.label === 'Cash' ? null : (entry.units > 0 ? entry.value / entry.units : null),
      value: entry.value
    }))
    .sort((a, b) => b.value - a.value)
}

function retirementDateISO(snapshot: Snapshot): string | undefined {
  const base = new Date(snapshot.timestamp)
  if (snapshot.retirement?.target_date) return snapshot.retirement.target_date
  const targetAge = snapshot.retirement?.target_age
  const currentAge = snapshot.person?.current_age
  if (typeof targetAge !== 'number' || typeof currentAge !== 'number') return undefined
  const deltaYears = targetAge - currentAge
  if (!Number.isFinite(deltaYears)) return undefined
  const next = new Date(base)
  next.setFullYear(base.getFullYear() + deltaYears)
  return next.toISOString().slice(0, 10)
}

function ensureCashflowBucket(bucket?: CashflowBucket): CashflowBucket {
  return bucket || { total: 0, items: [] }
}

function pushBucketAmount(bucket: CashflowBucket, label: string, amount: number) {
  if (!amount) return
  const item = bucket.items.find((i) => i.label === label)
  if (item) {
    item.amount += amount
  } else {
    bucket.items.push({ label, amount })
  }
  bucket.total += amount
}

function monthIndex(base: Date, iso?: string): number | undefined {
  if (!iso) return undefined
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return undefined
  return (target.getFullYear() - base.getFullYear()) * 12 + (target.getMonth() - base.getMonth())
}

function buildCashflowCalendar(snapshot: Snapshot, baseDate: Date, retirementYear: number, accountNameById: Map<string, string>): CashflowYearRow[] {
  const yearMap = new Map<number, CashflowYearRow>()
  const ensureYear = (year: number) => {
    if (!yearMap.has(year)) {
      yearMap.set(year, {
        year,
        contributions: { total: 0, items: [] },
        expenses: { total: 0, items: [] },
        social: { total: 0, items: [] }
      })
    }
    return yearMap.get(year) as CashflowYearRow
  }

  let maxContributionMonth = 0
  let maxExpenseMonth = 0
  let maxSocialMonth = 0
  const baseYear = baseDate.getFullYear()
  const defaultEnd = DEFAULT_TIMELINE_MONTHS - 1

  for (const c of snapshot.contributions || []) {
    const start = Math.max(0, monthIndex(baseDate, c.start) ?? 0)
    const rawEnd = monthIndex(baseDate, c.end)
    const end = Math.min(defaultEnd, rawEnd != null ? rawEnd : (c.frequency === 'once' ? start : defaultEnd))
    const amount = Math.max(0, c.amount || 0)
    if (!amount || start > defaultEnd) continue
    const label = c.note?.trim() || accountNameById.get(c.account_id) || c.account_id || 'Contribution'
    if (c.frequency === 'once') {
      const year = baseYear + Math.floor(start / 12)
      pushBucketAmount(ensureYear(year).contributions, label, amount)
      maxContributionMonth = Math.max(maxContributionMonth, start)
      continue
    }
    const step = c.frequency === 'annual' ? 12 : 1
    for (let m = start; m <= end && m <= defaultEnd; m += step) {
      const year = baseYear + Math.floor(m / 12)
      pushBucketAmount(ensureYear(year).contributions, label, amount)
      maxContributionMonth = Math.max(maxContributionMonth, m)
    }
  }

  for (const ex of snapshot.expenses || []) {
    const start = Math.max(0, monthIndex(baseDate, ex.start) ?? 0)
    const rawEnd = monthIndex(baseDate, ex.end)
    const end = Math.min(defaultEnd, rawEnd != null ? rawEnd : (ex.frequency === 'once' ? start : defaultEnd))
    const amount = Math.max(0, ex.amount || 0)
    if (!amount || start > defaultEnd) continue
    const label = ex.category?.toUpperCase() || 'Expense'
    if (ex.frequency === 'once') {
      const year = baseYear + Math.floor(start / 12)
      pushBucketAmount(ensureYear(year).expenses, label, amount)
      maxExpenseMonth = Math.max(maxExpenseMonth, start)
      continue
    }
    const step = ex.frequency === 'annual' ? 12 : 1
    for (let m = start; m <= end && m <= defaultEnd; m += step) {
      const year = baseYear + Math.floor(m / 12)
      pushBucketAmount(ensureYear(year).expenses, label, amount)
      maxExpenseMonth = Math.max(maxExpenseMonth, m)
    }
  }

  if ((snapshot.social_security || []).length && snapshot.person?.current_age != null) {
    for (const ss of snapshot.social_security || []) {
      const claimAge = Math.max(snapshot.person.current_age, ss.claim_age)
      const start = Math.max(0, Math.round((claimAge - snapshot.person.current_age) * 12))
      const monthly = Math.max(0, ss.monthly_amount || 0)
      if (!monthly || start > defaultEnd) continue
      const cola = ss.COLA ?? snapshot.assumptions?.inflation_pct ?? 0.02
      for (let m = start; m <= defaultEnd; m++) {
        const yearsSinceClaim = Math.floor((m - start) / 12)
        const payment = monthly * Math.pow(1 + cola, Math.max(0, yearsSinceClaim))
        const year = baseYear + Math.floor(m / 12)
        pushBucketAmount(ensureYear(year).social, `Claim at ${Math.round(ss.claim_age)} (${ss.monthly_amount ? fmtMoney0(ss.monthly_amount) : '$0'}/mo)`, payment)
        maxSocialMonth = Math.max(maxSocialMonth, m)
      }
    }
  }

  const lastCashflowYear = baseYear + Math.floor(Math.max(maxContributionMonth, maxExpenseMonth, maxSocialMonth) / 12)
  const projectionEndYear = Math.max(retirementYear + 40, lastCashflowYear)
  const rows: CashflowYearRow[] = []
  for (let year = baseYear; year <= projectionEndYear; year++) {
    const bucket = ensureYear(year)
    bucket.contributions.items.sort((a, b) => b.amount - a.amount)
    bucket.expenses.items.sort((a, b) => b.amount - a.amount)
    bucket.social.items.sort((a, b) => b.amount - a.amount)
    rows.push(bucket)
  }

  return rows
}

function normalizeMortgages(re: RealEstate) {
  if (re.mortgages && re.mortgages.length) return re.mortgages
  if (re.mortgage_balance || re.payment || re.rate) {
    return [{ id: `${re.id}-legacy`, balance: re.mortgage_balance || 0, payment: re.payment || 0, rate: re.rate }]
  }
  return []
}

function propertyNetRent(re: RealEstate) {
  const rentals = re.rentals && re.rentals.length ? re.rentals : re.rental ? [re.rental] : []
  return rentals.reduce((sum, rental) => {
    const rent = rental.rent || 0
    const vacancy = rental.vacancy_pct || 0
    const expenses = rental.expenses || 0
    return sum + (rent * (1 - vacancy) - expenses)
  }, 0)
}

function buildAmortization(re: RealEstate, annualRaisePct: number): AmortizationResult {
  const mortgages = normalizeMortgages(re)
  const monthsLimit = DEFAULT_TIMELINE_MONTHS
  const balanceSeries: number[] = []
  let payoffMonth: number | undefined
  if (mortgages.length) {
    const perMortgage: number[][] = []
    let longest = 0
    for (const mortgage of mortgages) {
      const principal = Math.max(0, mortgage.balance || 0)
      const payment = Math.max(0, mortgage.payment || 0)
      const rate = Math.max(0, (mortgage.rate || 0) / 12)
      if (principal <= 0 || payment <= 0) {
        perMortgage.push(new Array(monthsLimit).fill(0))
        continue
      }
      const series: number[] = [principal]
      let balance = principal
      let stagnation = 0
      let localPayoff: number | undefined
      for (let m = 0; m < monthsLimit && balance > 0; m++) {
        const interest = balance * rate
        const principalPay = payment - interest
        if (principalPay <= 0) {
          stagnation += 1
          if (stagnation > 24) break
        } else {
          stagnation = 0
        }
        const nextBalance = Math.max(0, balance + interest - payment)
        series.push(nextBalance)
        balance = nextBalance
        if (nextBalance === 0) {
          localPayoff = m + 1
          break
        }
      }
      if (localPayoff != null) {
        payoffMonth = payoffMonth != null ? Math.max(payoffMonth, localPayoff) : localPayoff
      }
      if (series.length < 2) series.push(0)
      longest = Math.max(longest, series.length)
      perMortgage.push(series)
    }
    for (let m = 0; m < Math.max(1, longest); m++) {
      let total = 0
      for (const series of perMortgage) {
        total += series[Math.min(series.length - 1, m)] ?? 0
      }
      balanceSeries.push(total)
    }
  } else {
    balanceSeries.push(0)
  }

  const rentSeries: number[] = []
  const baseRent = propertyNetRent(re)
  let rent = baseRent
  for (let m = 0; m < Math.max(balanceSeries.length, 12); m++) {
    if (m > 0 && m % 12 === 0) rent *= (1 + annualRaisePct)
    rentSeries.push(rent)
  }

  return { balanceSeries, rentSeries, payoffMonth }
}

function CashflowSection({ rows }: { rows: CashflowYearRow[] }) {
  if (!rows.length) {
    return (
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">No timed contributions, expenses, or social security entries to display.</Typography>
      </Box>
    )
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        mt: 3,
        gridTemplateColumns: {
          xs: 'repeat(auto-fill, minmax(220px, 1fr))',
          md: 'repeat(auto-fill, minmax(260px, 1fr))'
        }
      }}
    >
      {rows.map((row) => (
        <Card key={row.year} elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(148,163,184,0.15)', p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{row.year}</Typography>
          <Stack spacing={1}>
            <CashflowBucketList label="Contributions" color={SECTION_COLORS.contributions} bucket={row.contributions} emptyText="No contributions" />
            <CashflowBucketList label="Expenses" color={SECTION_COLORS.expenses} bucket={row.expenses} emptyText="No expenses" />
            <CashflowBucketList label="Social Security" color={SECTION_COLORS.social} bucket={row.social} emptyText="No benefits" />
          </Stack>
        </Card>
      ))}
    </Box>
  )
}

function CashflowBucketList({ label, color, bucket, emptyText }: { label: string; color: string; bucket: CashflowBucket; emptyText: string }) {
  return (
    <Box>
      <Typography variant="body2" sx={{ color, fontWeight: 600, mb: 0.5 }}>
        {label} • {fmtMoney0(bucket.total)}
      </Typography>
      {bucket.items.length ? (
        <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} spacing={0.5}>
          {bucket.items.map((item) => (
            <Typography component="li" key={`${label}-${item.label}`} variant="body2" color="text.secondary">
              {item.label}: {fmtMoney0(item.amount)}
            </Typography>
          ))}
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary">{emptyText}</Typography>
      )}
    </Box>
  )
}

interface AccountDetailCardProps {
  account: Account
  onEdit: (accountId: string) => void
}

import { ContextIcon } from '@components/ContextIcon';

function AccountDetailCard({ account, onEdit }: AccountDetailCardProps) {
  const { setContext } = useChat();
  const [active, setActive] = useState<string | null>(null)
  const holdings = useMemo(() => aggregateHoldings(account), [account])
  const total = holdings.reduce((sum, h) => sum + h.value, 0)
  const pieData = holdings.map((h, idx) => ({ label: h.label, value: h.value, color: HOLDING_COLORS[idx % HOLDING_COLORS.length] }))
  return (
    <Card id={`acct-${account.id}`} sx={{ mt: 3, scrollMarginTop: '80px', ...accentBorder('accounts'), border: '1px solid rgba(148,163,184,0.15)' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{accountDisplayName(account)}</Typography>
            <ContextIcon onClick={() => setContext({ account })} />
          </Box>
          <Button size="small" variant="outlined" onClick={() => onEdit(account.id)}>Edit</Button>
        </Stack>
        {pieData.length ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2, width: '100%' }}>
            <PieChart data={pieData} activeLabel={active} onSliceHover={setActive} width={440} height={320} legendPosition="right" />
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">No holdings to visualize.</Typography>
        )}
        {holdings.length ? (
          <Box sx={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="num">Units</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((row) => {
                  const pct = total ? (row.value / total) * 100 : 0
                  return (
                    <tr key={row.key}
                        className={active === row.label ? 'table-row-active' : undefined}
                        onMouseEnter={() => setActive(row.label)}
                        onMouseLeave={() => setActive(null)}>
                      <td>{row.label}</td>
                      <td className="num">{fmtUnits(row.units)}</td>
                      <td className="num">{row.price != null ? fmtMoney2(row.price) : '-'}</td>
                      <td className="num">{fmtMoney0(row.value)}</td>
                      <td className="num">{PCT_FMT.format(pct)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function PortfolioSnapshotPage() {
  const { snapshot } = useApp()
  const navigate = useNavigate()

  const [rentalRaise, setRentalRaise] = useState<Record<string, number>>({})
  const retirementRef = useRef<HTMLDivElement | null>(null)
  const accountsRef = useRef<HTMLDivElement | null>(null)
  const realEstateRef = useRef<HTMLDivElement | null>(null)
  const cashflowRef = useRef<HTMLDivElement | null>(null)

  if (!snapshot) {
    return (
      <section>
        <Typography variant="h4" gutterBottom>Portfolio Snapshot</Typography>
        <Typography>No snapshot loaded. Go to Upload.</Typography>
      </section>
    )
  }

  const baseDate = useMemo(() => new Date(snapshot.timestamp), [snapshot.timestamp])
  const retirementISO = retirementDateISO(snapshot)
  const retirementYear = retirementISO ? new Date(retirementISO).getFullYear() : (snapshot.retirement?.target_age && snapshot.person?.current_age != null
    ? baseDate.getFullYear() + Math.max(0, snapshot.retirement.target_age - snapshot.person.current_age)
    : baseDate.getFullYear())
  const alloc = computeAllocation(snapshot)

  const accountSummaries = useMemo(() => snapshot.accounts.map((account) => ({
    account,
    displayName: accountDisplayName(account),
    value: accountValue(account)
  })).sort((a, b) => b.value - a.value), [snapshot.accounts])

  const totalAccountsValue = accountSummaries.reduce((sum, entry) => sum + entry.value, 0)
  const accountSlices = accountSummaries.map((entry, idx) => ({
    label: entry.displayName,
    value: entry.value,
    color: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length],
    accountId: entry.account.id
  }))
  const labelToAccountId = new Map(accountSlices.map((slice) => [slice.label, slice.accountId]))
  const idToLabel = new Map(accountSlices.map((slice) => [slice.accountId, slice.label]))
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const activeAccountLabel = activeAccountId ? idToLabel.get(activeAccountId) ?? null : null

  const assetClassSums: Record<string, number> = { US_STOCK: 0, INTL_STOCK: 0, BONDS: 0, REIT: 0, CASH: 0, REAL_ESTATE: 0, CRYPTO: 0, GOLD: 0 }
  for (const a of snapshot.accounts) {
    if (a.cash_balance) assetClassSums.CASH += a.cash_balance
    for (const h of a.holdings || []) {
      const v = h.units * h.price
      const key = classifyHolding(h)
      assetClassSums[key] = (assetClassSums[key] || 0) + v
    }
  }
  for (const re of snapshot.real_estate || []) assetClassSums.REAL_ESTATE += re.value || 0
  const assetClassData = Object.entries(assetClassSums).filter(([, v]) => v > 0).map(([k, v], idx) => ({
    label: k,
    value: v,
    color: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length]
  }))

  const accountNameById = new Map(snapshot.accounts.map((a) => [a.id, accountDisplayName(a)]))
  const cashflowRows = useMemo(() => buildCashflowCalendar(snapshot, baseDate, retirementYear, accountNameById), [snapshot, baseDate, retirementYear, accountNameById])

  const handleEditAccount = (accountId: string) => {
    navigate(`/builder?account=${encodeURIComponent(accountId)}`)
  }

  const navItems = [
    { key: 'retirement', label: 'Retirement', ref: retirementRef, color: 'retirement' as const },
    { key: 'accounts', label: 'Accounts', ref: accountsRef, color: 'accounts' as const },
    { key: 'realEstate', label: 'Real Estate', ref: realEstateRef, color: 'realEstate' as const },
    { key: 'cashflows', label: 'Cashflows', ref: cashflowRef, color: 'contributions' as const }
  ] as const

  const sectionButtonSx = (key: keyof typeof SECTION_COLORS) => ({
    backgroundColor: SECTION_COLORS[key],
    color: '#fff',
    borderColor: SECTION_COLORS[key],
    '&:hover': {
      backgroundColor: SECTION_COLORS[key],
      opacity: 0.9
    }
  })

  const { setContext } = useChat();

  const handleSelection = () => {
    const selection = window.getSelection()?.toString();
    if (selection) {
      // This is a simplified way to find the context. A real implementation would
      // need a more robust way to map the selected text to the snapshot data.
      const account = snapshot?.accounts.find((a) => selection.includes(a.name || ''));
      if (account) {
        setContext({ account });
      }
    }
  };

  return (
    <section onMouseUp={handleSelection}>
      <Typography variant="h4" gutterBottom>Portfolio Snapshot</Typography>
      <Typography sx={{ mb: 2 }} color="text.secondary">Timestamp: <code>{snapshot.timestamp}</code></Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 3 }}>
        {navItems.map((item) => (
          <Button
            key={item.key}
            size="small"
            variant="contained"
            sx={sectionButtonSx(item.color)}
            onClick={() => item.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {item.label}
          </Button>
        ))}
      </Stack>

      <Card ref={retirementRef} elevation={0} sx={{ p: 3, mb: 4, ...accentBorder('retirement'), border: '1px solid rgba(148,163,184,0.15)' }}>
        <Typography variant="h6" sx={headingStyle('retirement')}>Retirement</Typography>
        <Grid container spacing={2} mt={1}>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(148,163,184,0.15)' }}>
              <CardContent>
                <Typography variant="overline">Current Age</Typography>
                <Typography variant="h6">{snapshot.person?.current_age ?? '—'}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(148,163,184,0.15)' }}>
              <CardContent>
                <Typography variant="overline">Target Age</Typography>
                <Typography variant="h6">{snapshot.retirement?.target_age ?? '—'}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(148,163,184,0.15)' }}>
              <CardContent>
                <Typography variant="overline">Target Date</Typography>
                <Typography variant="h6">{retirementISO ?? '—'}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(148,163,184,0.15)' }}>
              <CardContent>
                <Typography variant="overline">Planned Spend / Mo</Typography>
                <Typography variant="h6">{fmtMoney0(snapshot.retirement.expected_spend_monthly || 0)}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        {snapshot.assumptions?.inflation_pct != null ? (
          <Chip label={`Inflation assumption ${PCT_FMT.format(snapshot.assumptions.inflation_pct * 100)}%`} size="small" sx={{ mt: 2, ...mutedChip('retirement') }} />
        ) : null}
      </Card>

      <Card ref={accountsRef} elevation={0} sx={{ p: 3, mb: 4, ...accentBorder('accounts'), border: '1px solid rgba(148,163,184,0.15)' }} onMouseUp={handleSelection}>
        <Typography variant="h6" sx={headingStyle('accounts')}>Accounts</Typography>
        <Grid container spacing={2} mt={1} mb={2}>
          <Grid item xs={12} sm={4}>
            <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
              <CardContent>
                <Typography variant="overline">Total Invested</Typography>
                <Typography variant="h5">{fmtMoney0(alloc.total)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
              <CardContent>
                <Typography variant="overline">Accounts</Typography>
                <Typography variant="h5">{snapshot.accounts.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
              <CardContent>
                <Typography variant="overline">Real Estate</Typography>
                <Typography variant="h5">{snapshot.real_estate?.length || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        {accountSlices.length ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2, width: '100%' }}>
            <PieChart
              data={accountSlices.map(({ label, value, color }) => ({ label, value, color }))}
              activeLabel={activeAccountLabel}
              onSliceHover={(label) => setActiveAccountId(label ? (labelToAccountId.get(label) ?? null) : null)}
              width={520}
              height={340}
              title={`Account Distribution (${fmtMoney0(totalAccountsValue)})`}
              legendPosition="right"
            />
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No accounts with balances.</Typography>
        )}
        <Box sx={{ overflowX: 'auto', mb: 2 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th className="num">Value</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {accountSummaries.map(({ account, displayName, value }) => {
                const pct = totalAccountsValue ? (value / totalAccountsValue) * 100 : 0
                const isActive = activeAccountId === account.id
                return (
                  <tr key={account.id}
                      className={isActive ? 'table-row-active' : undefined}
                      onMouseEnter={() => setActiveAccountId(account.id)}
                      onMouseLeave={() => setActiveAccountId(null)}>
                    <td><a href={`#acct-${account.id}`}>{displayName}</a></td>
                    <td>{account.type}</td>
                    <td className="num">{fmtMoney0(value)}</td>
                    <td className="num">{PCT_FMT.format(pct)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Box>
        {assetClassData.length ? (
          <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(148,163,184,0.15)' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Asset Class Breakdown</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
                <PieChart data={assetClassData} width={480} height={320} legendPosition="right" />
              </Box>
            </CardContent>
          </Card>
        ) : null}
      </Card>

      {snapshot.accounts.map((account) => (
        <AccountDetailCard key={account.id} account={account} onEdit={handleEditAccount} />
      ))}

      <Card ref={realEstateRef} elevation={0} sx={{ p: 3, mt: 4, ...accentBorder('realEstate'), border: '1px solid rgba(148,163,184,0.15)' }}>
        <Typography variant="h6" sx={headingStyle('realEstate')}>Real Estate</Typography>
        {!(snapshot.real_estate && snapshot.real_estate.length) ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No real estate properties captured in this snapshot.</Typography>
        ) : (
          <Stack spacing={3} mt={2}>
            {snapshot.real_estate?.map((re) => {
              const raisePct = rentalRaise[re.id] ?? snapshot.assumptions?.inflation_pct ?? 0.02
              const amortization = buildAmortization(re, raisePct)
              const years = Math.max(5, Math.ceil(amortization.balanceSeries.length / 12))
              const payoffYear = amortization.payoffMonth != null ? baseDate.getFullYear() + Math.floor(amortization.payoffMonth / 12) : undefined
              const mortgages = normalizeMortgages(re)
              const monthlyPayment = mortgages.reduce((sum, m) => sum + Math.max(0, m.payment || 0), 0)
              const mortgageBalance = re.mortgage_balance || mortgages.reduce((sum, m) => sum + Math.max(0, m.balance || 0), 0)
              return (
                <Card key={re.id} elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148,163,184,0.15)' }}>
                  <CardContent>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{re.id}</Typography>
                        <Typography variant="body2" color="text.secondary">Value {fmtMoney0(re.value || 0)}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" label={`Mortgage balance ${fmtMoney0(mortgageBalance)}`} sx={{ ...mutedChip('realEstate'), mr: 1 }} />
                          {monthlyPayment ? <Chip size="small" label={`Monthly payment ${fmtMoney0(monthlyPayment)}`} sx={{ ...mutedChip('realEstate'), mr: 1 }} /> : null}
                          {payoffYear ? <Chip size="small" label={`Payoff ≈ ${payoffYear}`} sx={{ ...mutedChip('realEstate'), mr: 1 }} /> : null}
                        </Stack>
                      </Box>
                      <Box sx={{ minWidth: { xs: '100%', md: 220 } }}>
                        <TextField
                          fullWidth
                          type="number"
                          label="Annual rent raise %"
                          value={Math.round((raisePct || 0) * 1000) / 10}
                          onChange={(event) => {
                            const pct = Number(event.target.value)
                            if (!Number.isFinite(pct)) return
                            setRentalRaise((prev) => ({ ...prev, [re.id]: pct / 100 }))
                          }}
                          InputProps={{
                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            inputProps: { min: -10, max: 20, step: 0.1 }
                          }}
                        />
                      </Box>
                    </Stack>
                    <Box sx={{ mt: 3, overflowX: 'auto' }}>
                      <MultiLineChart
                        seriesByKey={{
                          'Mortgage balance': amortization.balanceSeries,
                          'Monthly rent (net)': amortization.rentSeries
                        }}
                        years={years}
                        startYear={baseDate.getFullYear()}
                        title="Mortgage amortization vs rental income"
                        yLabel="Dollars"
                        xLabel="Years"
                        width={900}
                        height={320}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )
            })}
          </Stack>
        )}
      </Card>

      <Card ref={cashflowRef} elevation={0} sx={{ p: 3, my: 4, ...accentBorder('contributions'), border: '1px solid rgba(148,163,184,0.15)' }}>
        <Typography variant="h6" sx={headingStyle('contributions')}>Contributions • Expenses • Social Security</Typography>
        <Typography variant="body2" color="text.secondary">
          Projected yearly cashflows from {baseDate.getFullYear()} through at least {retirementYear + 40}. Contributions are shown in green, expenses in red, and social security in brown.
        </Typography>
        <CashflowSection rows={cashflowRows} />
      </Card>
    </section>
  )
}

/*
Portfolio Snapshot page.
- Organizes snapshot into builder-aligned sections (retirement, accounts, real estate, cashflows) with shared color accents.
- Accounts: interactive pies linking to tables, per-account detail cards with percent column and edit shortcut.
- Real estate: amortization chart with adjustable rent escalation.
- Cashflow calendar: yearly roll-up of contributions, expenses, and social security post-retirement.
*/
