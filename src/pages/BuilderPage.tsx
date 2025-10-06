import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@state/AppContext'
import type { Snapshot, Account, HoldingLot, RealEstate, Contribution, Expense, SocialSecurity, Assumptions, MortgageInfo, RentalInfo } from '@types/schema'
import { validateSnapshot } from '@types/schema'
import { importMonarchFromString } from '@importers/monarch'
import { Box, Button, Card, CardContent, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, InputAdornment } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined'

const SECTION_COLORS = {
  retirement: '#673ab7',
  accounts: '#1565c0',
  realEstate: '#2e7d32',
  contributions: '#ef6c00',
  expenses: '#c62828',
  social: '#6d4c41'
} as const

const currencyAdornment = <InputAdornment position="start">$</InputAdornment>

const currencyInputProps = (extra: Record<string, any> = {}) => ({
  startAdornment: currencyAdornment,
  inputMode: 'decimal',
  ...extra
})

const sectionButtonSx = (key: keyof typeof SECTION_COLORS) => ({
  backgroundColor: SECTION_COLORS[key],
  color: '#fff',
  borderColor: SECTION_COLORS[key],
  '&:hover': {
    backgroundColor: SECTION_COLORS[key],
    opacity: 0.9
  }
})

const sectionHeadingSx = (key: keyof typeof SECTION_COLORS) => ({
  color: SECTION_COLORS[key],
  fontWeight: 600,
  borderBottom: `2px solid ${SECTION_COLORS[key]}`,
  display: 'inline-block',
  paddingBottom: 0.25,
  marginBottom: 2
})

const addButtonSx = (key: keyof typeof SECTION_COLORS) => ({
  borderColor: SECTION_COLORS[key],
  color: SECTION_COLORS[key],
  '&:hover': {
    borderColor: SECTION_COLORS[key],
    backgroundColor: `${SECTION_COLORS[key]}14`
  }
})

function retirementDateISOFromSnapshot(snapshot: Snapshot): string | undefined {
  const timestamp = snapshot.timestamp || nowIso()
  const baseDate = new Date(timestamp)
  const targetAge = snapshot.retirement?.target_age
  const currentAge = snapshot.person?.current_age
  if (typeof targetAge !== 'number' || typeof currentAge !== 'number') return undefined
  const yearsUntil = targetAge - currentAge
  if (!Number.isFinite(yearsUntil)) return undefined
  baseDate.setFullYear(baseDate.getFullYear() + yearsUntil)
  return baseDate.toISOString().slice(0, 10)
}

function nowIso() {
  return new Date().toISOString()
}

const emptySnapshot: Snapshot = {
  timestamp: nowIso(),
  currency: 'USD',
  accounts: [],
  real_estate: [],
  contributions: [],
  expenses: [],
  retirement: { expected_spend_monthly: 4000, target_age: 60, withdrawal_strategy: 'fixed-real' },
  social_security: [],
  assumptions: { inflation_mode: 'fixed', inflation_pct: 0.02, rebalancing: { frequency: 'annual', threshold_pct: 0.2 } },
  person: { current_age: 35 }
}

/*
Snapshot Builder page.
- Import Monarch JSON; edit General/Retirement; manage Accounts/Holdings; Real Estate (with estimate helper), Contributions, Expenses, Social Security.
- Inline validation and tooltips for clarity; actions to load/download snapshot.
*/
export function BuilderPage() {
  const [draft, setDraft] = useState<Snapshot>({ ...emptySnapshot })
  const [errors, setErrors] = useState<string[]>([])
  const { setSnapshot, snapshot } = useApp()
  const nav = useNavigate()
  // Heavy JSON preview only when shown
  const [previewOpen, setPreviewOpen] = useState(false)
  const pretty = useMemo(() => JSON.stringify(draft, null, 2), [draft])
  // Holdings UI state: per-account open flag and page index for pagination
  const [holdingsOpen, setHoldingsOpen] = useState<Record<string, boolean>>({})
  const [holdingsPage, setHoldingsPage] = useState<Record<string, number>>({})
  const [accountDetailsOpen, setAccountDetailsOpen] = useState<Record<string, boolean>>({})
  const [recentAccountId, setRecentAccountId] = useState<string | null>(null)
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<HTMLElement | null>(null)
  const [accountMenuFor, setAccountMenuFor] = useState<string | null>(null)
  const [propertyMenuAnchor, setPropertyMenuAnchor] = useState<HTMLElement | null>(null)
  const [propertyMenuFor, setPropertyMenuFor] = useState<string | null>(null)
  const [contributionDetailsOpen, setContributionDetailsOpen] = useState<Record<string, boolean>>({})
  const [contributionMenuAnchor, setContributionMenuAnchor] = useState<HTMLElement | null>(null)
  const [contributionMenuFor, setContributionMenuFor] = useState<string | null>(null)
  const retirementRef = useRef<HTMLDivElement | null>(null)
  const accountsRef = useRef<HTMLDivElement | null>(null)
  const realEstateRef = useRef<HTMLDivElement | null>(null)
  const contributionsRef = useRef<HTMLDivElement | null>(null)
  const expensesRef = useRef<HTMLDivElement | null>(null)
  const socialSecurityRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (recentAccountId) {
      const el = document.querySelector(`[data-account-row="${recentAccountId}"]`)
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      const timer = window.setTimeout(() => setRecentAccountId(null), 2000)
      return () => window.clearTimeout(timer)
    }
  }, [recentAccountId])

  // Prefill from current snapshot if available and builder is empty
  useEffect(() => {
    if (snapshot && (!draft.accounts?.length && !draft.real_estate?.length)) {
      setDraft(snapshot)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  function update<K extends keyof Snapshot>(key: K, val: Snapshot[K]) {
    setDraft((d) => ({ ...d, [key]: val }))
  }

  function retirementDateISO(): string | undefined {
    return retirementDateISOFromSnapshot(draft)
  }

  // Accounts
  function addAccount() {
    const a: Account = { id: `acct-${(draft.accounts.length + 1).toString().padStart(2, '0')}`, type: 'taxable-brokerage', name: '', holdings: [], cash_balance: 0 }
    setRecentAccountId(a.id)
    update('accounts', [...draft.accounts, a])
  }
  function removeAccount(idx: number) {
    const next = draft.accounts.slice(); next.splice(idx, 1); update('accounts', next)
  }
  function setAccount(idx: number, patch: Partial<Account>) {
    const next = draft.accounts.slice(); next[idx] = { ...next[idx], ...patch }; update('accounts', next)
  }
  function addHolding(idx: number) {
    const lot: HoldingLot = { ticker: '', name: '', units: 0, price: 0 }
    const next = draft.accounts.slice()
    next[idx] = { ...next[idx], holdings: [ ...(next[idx].holdings || []), lot ] }
    update('accounts', next)
  }
  function setHolding(ai: number, hi: number, patch: Partial<HoldingLot>) {
    const next = draft.accounts.slice()
    const holds = (next[ai].holdings || []).slice(); holds[hi] = { ...holds[hi], ...patch }
    next[ai] = { ...next[ai], holdings: holds }
    update('accounts', next)
  }
  function removeHolding(ai: number, hi: number) {
    const next = draft.accounts.slice()
    const holds = (next[ai].holdings || []).slice(); holds.splice(hi, 1)
    next[ai] = { ...next[ai], holdings: holds }
    update('accounts', next)
  }

  function toggleAccountDetails(id: string) {
    setAccountDetailsOpen((state) => ({ ...state, [id]: !state[id] }))
  }

  function openAccountMenu(id: string, anchor: HTMLElement) {
    setAccountMenuFor(id)
    setAccountMenuAnchor(anchor)
  }

  function closeAccountMenu() {
    setAccountMenuFor(null)
    setAccountMenuAnchor(null)
  }
  // Real estate
  function openPropertyMenu(id: string, anchor: HTMLElement) {
    setPropertyMenuFor(id)
    setPropertyMenuAnchor(anchor)
  }
  function closePropertyMenu() {
    setPropertyMenuFor(null)
    setPropertyMenuAnchor(null)
  }

  function ensureMortgageList(re: RealEstate) {
    if (Array.isArray(re.mortgages)) return re
    const legacyBalance = re.mortgage_balance ?? 0
    const hasLegacy = legacyBalance > 0 || re.rate != null || re.payment != null || re.zip
    const mortgages = hasLegacy
      ? [{ id: `${re.id || 'mortgage'}-1`, balance: legacyBalance, rate: re.rate, payment: re.payment, zip: re.zip }]
      : []
    return { ...re, mortgages }
  }

  function ensureRentalList(re: RealEstate) {
    if (Array.isArray(re.rentals)) return re
    if (re.rental) {
      return { ...re, rentals: [{ id: `${re.id || 'rental'}-1`, ...re.rental }] }
    }
    return { ...re, rentals: [] }
  }

  function addMortgageRow(propertyIndex: number) {
    setRealEstateWith(propertyIndex, (current) => {
      const withList = ensureMortgageList(current)
      const mortgages = [...(withList.mortgages || [])]
      const nextIndex = mortgages.length + 1
      const nextId = `${withList.id || 'mortgage'}-${nextIndex}`
      const seedBalance = mortgages.length === 0 ? withList.mortgage_balance || 0 : 0
      const seedRate = mortgages.length === 0 ? withList.rate : undefined
      const seedPayment = mortgages.length === 0 ? withList.payment : undefined
      mortgages.push({ id: nextId, balance: seedBalance, rate: seedRate, payment: seedPayment, zip: withList.zip })
      return { ...withList, mortgages }
    })
  }

  function updateMortgageRow(propertyIndex: number, mortgageIndex: number, patch: Partial<MortgageInfo>) {
    setRealEstateWith(propertyIndex, (current) => {
      const withList = ensureMortgageList(current)
      const mortgages = [...(withList.mortgages || [])]
      mortgages[mortgageIndex] = { ...mortgages[mortgageIndex], ...patch }
      return { ...withList, mortgages }
    })
  }

  function removeMortgageRow(propertyIndex: number, mortgageIndex: number) {
    setRealEstateWith(propertyIndex, (current) => {
      const mortgages = (current.mortgages || []).slice()
      mortgages.splice(mortgageIndex, 1)
      return { ...current, mortgages }
    })
  }

  function addRentalRow(propertyIndex: number) {
    setRealEstateWith(propertyIndex, (current) => {
      const withList = ensureRentalList(current)
      const rentals = [...(withList.rentals || [])]
      const nextId = `${withList.id || 'rental'}-${rentals.length + 1}`
      rentals.push({ id: nextId, rent: 0 })
      return { ...withList, rentals }
    })
  }

  function updateRentalRow(propertyIndex: number, rentalIndex: number, patch: Partial<RentalInfo>) {
    setRealEstateWith(propertyIndex, (current) => {
      const withList = ensureRentalList(current)
      const rentals = [...(withList.rentals || [])]
      rentals[rentalIndex] = { ...rentals[rentalIndex], ...patch }
      return { ...withList, rentals }
    })
  }

  function removeRentalRow(propertyIndex: number, rentalIndex: number) {
    setRealEstateWith(propertyIndex, (current) => {
      const rentals = (current.rentals || []).slice()
      rentals.splice(rentalIndex, 1)
      return { ...current, rentals }
    })
  }

  function addRealEstate() {
    const re: RealEstate = {
      id: `prop-${(draft.real_estate?.length || 0) + 1}`,
      value: 0,
      appreciation_pct: 0.035,
      mortgages: [],
      rentals: []
    }
    update('real_estate', [ ...(draft.real_estate || []), re ])
  }
  function syncRealEstateDerived(re: RealEstate): RealEstate {
    const next: RealEstate = { ...re }
    if (next.mortgages && next.mortgages.length) {
      next.mortgage_balance = next.mortgages.reduce((sum, m) => sum + (m.balance || 0), 0)
      next.payment = next.mortgages.reduce((sum, m) => sum + (m.payment || 0), 0) || undefined
      const primary = next.mortgages[0]
      if (primary) {
        next.rate = primary.rate
        next.zip = primary.zip || next.zip
      }
    } else {
      next.mortgage_balance = next.mortgage_balance ?? 0
      if (!next.mortgage_balance) {
        next.payment = undefined
        next.rate = undefined
      }
    }
    if (next.rentals && next.rentals.length) {
      const primaryRental = next.rentals[0]
      next.rental = primaryRental
    } else if (!next.rentals || next.rentals.length === 0) {
      if (!next.rental) next.rental = undefined
    }
    return next
  }

  function setRealEstateWith(idx: number, updater: (current: RealEstate) => RealEstate) {
    const next = (draft.real_estate || []).slice()
    const current = next[idx] ?? ({ id: `prop-${idx + 1}`, value: 0 } as RealEstate)
    next[idx] = syncRealEstateDerived(updater({ ...current }))
    update('real_estate', next)
  }

  function setRealEstate(idx: number, patch: Partial<RealEstate>) {
    setRealEstateWith(idx, (current) => ({ ...current, ...patch }))
  }
  function estimateRealEstate(idx: number) {
    const re = (draft.real_estate || [])[idx]
    if (!re) return
    const v = re.value || 0
    const taxRate = (re.zip || '').startsWith('94') ? 0.011 : 0.01
    const est = {
      taxes: Math.round(v * taxRate),
      insurance: Math.round(v * 0.004),
      maintenance_pct: 0.01,
      appreciation_pct: re.appreciation_pct ?? 0.035,
      rental: {
        rent: Math.round((re.rental?.rent ?? v * 0.005)),
        vacancy_pct: re.rental?.vacancy_pct ?? 0.05,
        expenses: re.rental?.expenses ?? 150
      }
    } as Partial<RealEstate>
    setRealEstateWith(idx, (current) => ({ ...current, ...est }))
  }
  function removeRealEstate(idx: number) {
    const next = (draft.real_estate || []).slice(); next.splice(idx, 1); update('real_estate', next)
  }

  // Contributions / Expenses
  function addContribution() {
    const c: Contribution = { account_id: draft.accounts[0]?.id || '', amount: 0, frequency: 'monthly', note: '' }
    update('contributions', [ ...(draft.contributions || []), c ])
  }
  function setContribution(i: number, patch: Partial<Contribution>) {
    const next = (draft.contributions || []).slice(); next[i] = { ...next[i], ...patch }; update('contributions', next)
  }
  function removeContribution(i: number) {
    const next = (draft.contributions || []).slice(); next.splice(i, 1); update('contributions', next)
  }

  function toggleContributionDetails(key: string) {
    setContributionDetailsOpen((state) => ({ ...state, [key]: !state[key] }))
  }

  function openContributionMenu(key: string, anchor: HTMLElement) {
    setContributionMenuFor(key)
    setContributionMenuAnchor(anchor)
  }

  function closeContributionMenu() {
    setContributionMenuFor(null)
    setContributionMenuAnchor(null)
  }

  function addExpense() {
    const e: Expense = { amount: 0, frequency: 'monthly', category: 'living' }
    update('expenses', [ ...(draft.expenses || []), e ])
  }
  function setExpense(i: number, patch: Partial<Expense>) {
    const next = (draft.expenses || []).slice(); next[i] = { ...next[i], ...patch }; update('expenses', next)
  }
  function removeExpense(i: number) {
    const next = (draft.expenses || []).slice(); next.splice(i, 1); update('expenses', next)
  }

  // Social security
  function addSS() {
    const s: SocialSecurity = { claim_age: 67, monthly_amount: 2000, COLA: 0.02 }
    update('social_security', [ ...(draft.social_security || []), s ])
  }
  function setSS(i: number, patch: Partial<SocialSecurity>) {
    const next = (draft.social_security || []).slice(); next[i] = { ...next[i], ...patch }; update('social_security', next)
  }
  function removeSS(i: number) {
    const next = (draft.social_security || []).slice(); next.splice(i, 1); update('social_security', next)
  }

  function setAssumptions(patch: Partial<Assumptions>) {
    update('assumptions', { ...(draft.assumptions || {}), ...patch })
  }

  function download() {
    const res = validateSnapshot(draft)
    if (!res.valid) { setErrors(res.errors || ['Invalid snapshot']); return }
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'snapshot.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function loadIntoApp() {
    const res = validateSnapshot(draft)
    if (!res.valid) { setErrors(res.errors || ['Invalid snapshot']); return }
    setErrors([])
    setSnapshot(draft)
    nav('/snapshot')
  }

  function prefillSample() {
    fetch('/examples/sample_snapshot.json').then(r => r.json()).then((j) => setDraft(j))
  }

  function scrollToSection(ref: { current: HTMLElement | null }) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const sectionLinks: Array<{ key: keyof typeof SECTION_COLORS; label: string; ref: React.RefObject<HTMLDivElement | null> }> = [
    { key: 'retirement', label: 'Retirement', ref: retirementRef },
    { key: 'accounts', label: 'Accounts', ref: accountsRef },
    { key: 'realEstate', label: 'Real Estate', ref: realEstateRef },
    { key: 'contributions', label: 'Contributions', ref: contributionsRef },
    { key: 'expenses', label: 'Expenses', ref: expensesRef },
    { key: 'social', label: 'Social Security', ref: socialSecurityRef }
  ]

  const retirementDateValue = retirementDateISO()

  // Monarch JSON Paste
  const [monarchRaw, setMonarchRaw] = useState('')
  const [importInfo, setImportInfo] = useState<string>('')
  const [showMonarchImport, setShowMonarchImport] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const menuOpen = Boolean(menuAnchor)
  const handleMenuClose = () => setMenuAnchor(null)
  function importMonarch() {
    try {
      const res = importMonarchFromString(monarchRaw)
      setImportInfo(`Imported ${res.meta.positions} positions into ${res.meta.accounts} accounts${res.meta.lastSyncedAt ? ` (last sync ${res.meta.lastSyncedAt})` : ''}`)
      setDraft((d) => ({
        ...d,
        timestamp: res.meta.lastSyncedAt || d.timestamp,
        accounts: res.accounts,
        real_estate: res.realEstate.length ? res.realEstate : d.real_estate
      }))
      setErrors([])
    } catch (e: any) {
      setErrors([`Monarch import failed: ${e.message}`])
      setImportInfo('')
    }
  }

  return (
    <section>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h4">Snapshot Builder</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" aria-label="Snapshot builder options" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Compose a point-in-time snapshot, then download or load it into the dashboard.</Typography>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {sectionLinks.map((item) => (
            <Button key={item.key} size="small" variant="contained" sx={sectionButtonSx(item.key)} onClick={() => scrollToSection(item.ref)}>
              {item.label}
            </Button>
          ))}
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" variant="contained" onClick={loadIntoApp}>Submit</Button>
      </Stack>

      <Menu anchorEl={menuAnchor} open={menuOpen} onClose={handleMenuClose} keepMounted>
        <MenuItem onClick={() => { handleMenuClose(); setShowMonarchImport((v) => !v); }}>
          {showMonarchImport ? 'Hide Monarch Import' : 'Show Monarch Import'}
        </MenuItem>
        <MenuItem onClick={() => { handleMenuClose(); setDraft({ ...emptySnapshot, timestamp: nowIso() }); }}>Reset</MenuItem>
        {snapshot && <MenuItem onClick={() => { handleMenuClose(); setDraft(snapshot); }}>Load From Current</MenuItem>}
        <MenuItem onClick={() => { handleMenuClose(); prefillSample(); }}>Prefill Sample</MenuItem>
        <MenuItem onClick={() => { handleMenuClose(); download(); }}>Download JSON</MenuItem>
        <MenuItem onClick={() => { handleMenuClose(); setPreviewOpen(true); }}>View JSON Preview</MenuItem>
      </Menu>

      {errors.length > 0 && (
        <div className="errors">
          <strong>Validation errors</strong>
          <ul>{errors.map((e, i) => (<li key={i}>{e}</li>))}</ul>
        </div>
      )}

      <Collapse in={showMonarchImport} unmountOnExit>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="overline">Import from Monarch JSON</Typography>
            <TextField multiline fullWidth minRows={6} placeholder="Paste Monarch investments JSON here" value={monarchRaw} onChange={(e) => setMonarchRaw(e.target.value)} sx={{ mt: 1 }} />
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={importMonarch}>Import Investments</Button>
              {importInfo && <Typography color="text.secondary">{importInfo}</Typography>}
            </Stack>
          </CardContent>
        </Card>
      </Collapse>

      <Box ref={retirementRef}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={sectionHeadingSx('retirement')}>Retirement Setup</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>Set the core assumptions used throughout the results views.</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Current Age" value={draft.person?.current_age || ''} onChange={(e) => update('person', { ...(draft.person || {}), current_age: Number(e.target.value) || undefined })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Retirement Age" value={draft.retirement.target_age || ''} onChange={(e) => update('retirement', { ...draft.retirement, target_age: Number(e.target.value) || undefined })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Retirement Spend (monthly)" value={draft.retirement.expected_spend_monthly} InputProps={currencyInputProps()} onChange={(e) => update('retirement', { ...draft.retirement, expected_spend_monthly: Number(e.target.value) })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Inflation Adjustment %" value={draft.assumptions?.inflation_pct != null ? (draft.assumptions.inflation_pct * 100).toString() : ''} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} helperText="Applies to future spending" onChange={(e) => setAssumptions({ inflation_pct: Number(e.target.value) / 100 })} /></Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      <Box ref={accountsRef} sx={{ mt: 3 }}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={sectionHeadingSx('accounts')}>Accounts</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 56 }}>#</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell sx={{ width: 160 }}>Cash Balance</TableCell>
                    <TableCell align="right">Holdings</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {draft.accounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography color="text.secondary" variant="body2">No accounts yet. Add one to start.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {draft.accounts.map((a, i) => {
                    const accKey = a.id || `index-${i}`
                    const total = (a.holdings || []).length
                    const pageSize = 50
                    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1)
                    const currentPage = Math.max(0, Math.min((holdingsPage[accKey] || 0), maxPage))
                    const pages = Math.max(1, Math.ceil(total / pageSize))
                    const start = currentPage * pageSize
                    const end = Math.min(total, start + pageSize)
                    const slice = (a.holdings || []).slice(start, end)
                    const open = !!holdingsOpen[accKey]
                    const detailsOpen = !!accountDetailsOpen[accKey]
                    const isRecent = recentAccountId === accKey
                    return (
                      <React.Fragment key={`${accKey}-${i}`}>
                        <TableRow hover data-account-row={accKey} sx={{ backgroundColor: isRecent ? 'rgba(25, 118, 210, 0.12)' : undefined, transition: 'background-color 0.3s ease' }}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>
                      <TextField
                        variant="standard"
                        fullWidth
                        label="Name"
                        value={a.name || ''}
                        InputLabelProps={{ shrink: true }}
                        helperText={isRecent ? 'New account' : ' '}
                        onChange={(e) => setAccount(i, { name: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        variant="standard"
                        fullWidth
                        label="Type"
                        value={a.type}
                        InputLabelProps={{ shrink: true }}
                        helperText=" "
                        onChange={(e) => setAccount(i, { type: e.target.value as Account['type'] })}
                      >
                        <MenuItem value="taxable-brokerage">Taxable</MenuItem>
                        <MenuItem value="401k">401k</MenuItem>
                        <MenuItem value="ira">IRA</MenuItem>
                        <MenuItem value="roth">Roth</MenuItem>
                        <MenuItem value="hsa">HSA</MenuItem>
                        <MenuItem value="cash">Cash</MenuItem>
                        <MenuItem value="crypto">Crypto</MenuItem>
                        <MenuItem value="other">Other</MenuItem>
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        variant="standard"
                        fullWidth
                        label="Cash Balance"
                        value={a.cash_balance || 0}
                        InputLabelProps={{ shrink: true }}
                        InputProps={currencyInputProps()}
                        helperText=" "
                        onChange={(e) => setAccount(i, { cash_balance: Number(e.target.value) })}
                      />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                              <Button size="small" onClick={() => setHoldingsOpen((m) => ({ ...m, [accKey]: !open }))}>
                                {open ? 'Hide' : 'Show'} ({total})
                              </Button>
                              {open && total > pageSize && (
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Button size="small" onClick={() => setHoldingsPage((m) => ({ ...m, [accKey]: Math.max(0, currentPage - 1) }))} disabled={currentPage === 0}>Prev</Button>
                                  <Typography variant="caption" color="text.secondary">Page {currentPage + 1} / {pages}</Typography>
                                  <Button size="small" onClick={() => setHoldingsPage((m) => ({ ...m, [accKey]: Math.min(pages - 1, currentPage + 1) }))} disabled={currentPage >= pages - 1}>Next</Button>
                                </Stack>
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <IconButton size="small" onClick={(e) => openAccountMenu(accKey, e.currentTarget)} aria-label="Account options">
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                              <IconButton onClick={() => removeAccount(i)} aria-label="Remove account">
                                <DeleteIcon />
                              </IconButton>
                            </Stack>
                            <Menu anchorEl={accountMenuFor === accKey ? accountMenuAnchor : null} open={accountMenuFor === accKey && Boolean(accountMenuAnchor)} onClose={closeAccountMenu} keepMounted>
                              <MenuItem onClick={() => { toggleAccountDetails(accKey); closeAccountMenu(); }}>
                                {detailsOpen ? 'Hide account ID' : 'Show account ID'}
                              </MenuItem>
                            </Menu>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow>
                            <TableCell colSpan={6} sx={{ backgroundColor: 'background.default' }}>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
                                <Typography variant="subtitle2">Holdings ({total})</Typography>
                                {total > pageSize && (
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Button size="small" onClick={() => setHoldingsPage((m) => ({ ...m, [accKey]: Math.max(0, currentPage - 1) }))} disabled={currentPage === 0}>Prev</Button>
                                    <Typography variant="caption" color="text.secondary">Page {currentPage + 1} / {pages}</Typography>
                                    <Button size="small" onClick={() => setHoldingsPage((m) => ({ ...m, [accKey]: Math.min(pages - 1, currentPage + 1) }))} disabled={currentPage >= pages - 1}>Next</Button>
                                  </Stack>
                                )}
                              </Stack>
                              <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Ticker</TableCell>
                              <TableCell>Name</TableCell>
                              <TableCell sx={{ width: 120 }}>Units</TableCell>
                              <TableCell sx={{ width: 120 }}>Price</TableCell>
                              <TableCell align="right">Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {slice.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} align="left">
                                  <Typography color="text.secondary" variant="body2">No holdings yet.</Typography>
                                </TableCell>
                              </TableRow>
                            )}
                            {slice.map((h, hi) => (
                              <TableRow key={`${accKey}-holding-${start + hi}`} hover>
                                <TableCell>
                                  <TextField
                                    variant="standard"
                                    fullWidth
                                    value={h.ticker || ''}
                                    inputProps={{ 'aria-label': 'Ticker' }}
                                    onChange={(e) => setHolding(i, start + hi, { ticker: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    variant="standard"
                                    fullWidth
                                    value={h.name || ''}
                                    inputProps={{ 'aria-label': 'Holding name' }}
                                    onChange={(e) => setHolding(i, start + hi, { name: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    type="number"
                                    variant="standard"
                                    fullWidth
                                    value={h.units}
                                    inputProps={{ 'aria-label': 'Units' }}
                                    onChange={(e) => setHolding(i, start + hi, { units: Number(e.target.value) })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    type="number"
                                    variant="standard"
                                    fullWidth
                                    value={h.price}
                                    inputProps={{ 'aria-label': 'Price' }}
                                    InputProps={currencyInputProps()}
                                    onChange={(e) => setHolding(i, start + hi, { price: Number(e.target.value) })}
                                  />
                                </TableCell>
                                <TableCell align="right">
                                  <IconButton onClick={() => removeHolding(i, start + hi)} aria-label="Remove holding">
                                    <DeleteIcon />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow>
                              <TableCell colSpan={5} align="center">
                                <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('accounts')} onClick={() => addHolding(i)}>Add Holding</Button>
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </TableCell>
                    </TableRow>
                  )}
                  {detailsOpen && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ backgroundColor: 'background.default' }}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <TextField
                              variant="standard"
                              fullWidth
                              label="Account ID"
                              InputLabelProps={{ shrink: true }}
                              helperText="Used for linking contributions"
                              value={a.id}
                              onChange={(e) => setAccount(i, { id: e.target.value })}
                            />
                          </Grid>
                        </Grid>
                      </TableCell>
                    </TableRow>
                  )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('accounts')} onClick={addAccount}>Add Account</Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>

      <Box ref={realEstateRef} sx={{ mt: 3 }}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={sectionHeadingSx('realEstate')}>Real Estate</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Value</TableCell>
            <TableCell>Taxes</TableCell>
            <TableCell>Insurance</TableCell>
            <TableCell>Maintenance %</TableCell>
            <TableCell>Appreciation %</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
                </TableHead>
                <TableBody>
            {(draft.real_estate || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center"><Typography color="text.secondary" variant="body2">No properties yet.</Typography></TableCell>
              </TableRow>
            )}
            {(draft.real_estate || []).map((re, i) => {
              const propKey = re.id || `property-${i}`
              const maintenancePct = (re.maintenance_pct ?? 0) * 100
              const maintenanceError = maintenancePct < 0 || maintenancePct > 100
              const appreciationPct = (re.appreciation_pct ?? 0) * 100
              const appreciationError = appreciationPct < 0 || appreciationPct > 100
              const propertyMenuOpen = propertyMenuFor === propKey && Boolean(propertyMenuAnchor)
              const mortgages = re.mortgages || []
              const rentals = re.rentals || []
              const detailCellSx = { backgroundColor: 'background.default' }
              return (
                <React.Fragment key={propKey}>
                  <TableRow hover>
                    <TableCell>
                      <TextField variant="standard" fullWidth label="Property ID" helperText=" " value={re.id}
                                 onChange={(e) => setRealEstate(i, { id: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <TextField variant="standard" type="number" fullWidth label="Value" helperText=" " value={re.value}
                                 InputProps={currencyInputProps()}
                                 onChange={(e) => setRealEstate(i, { value: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <TextField variant="standard" type="number" fullWidth label="Taxes" value={re.taxes || 0}
                                 error={(re.taxes || 0) < 0}
                                 helperText={(re.taxes || 0) < 0 ? 'Must be >= 0' : ' '}
                                 InputProps={currencyInputProps()}
                                 onChange={(e) => setRealEstate(i, { taxes: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <TextField variant="standard" type="number" fullWidth label="Insurance" value={re.insurance || 0}
                                 error={(re.insurance || 0) < 0}
                                 helperText={(re.insurance || 0) < 0 ? 'Must be >= 0' : ' '}
                                 InputProps={currencyInputProps()}
                                 onChange={(e) => setRealEstate(i, { insurance: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <TextField variant="standard" type="number" fullWidth label="Maintenance %" value={maintenancePct.toFixed(2)}
                                 error={maintenanceError}
                                 helperText="Annual %"
                                 InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                 onChange={(e) => setRealEstate(i, { maintenance_pct: Number(e.target.value) / 100 })} />
                    </TableCell>
                    <TableCell>
                      <TextField variant="standard" type="number" fullWidth label="Appreciation %" value={appreciationPct.toFixed(2)}
                                 error={appreciationError}
                                 helperText="Annual %"
                                 InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                 onChange={(e) => setRealEstate(i, { appreciation_pct: Number(e.target.value) / 100 })} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <IconButton size="small" aria-label="Property options" onClick={(e) => openPropertyMenu(propKey, e.currentTarget)}>
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                        <IconButton onClick={() => removeRealEstate(i)} aria-label="Remove property">
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                      <Menu anchorEl={propertyMenuFor === propKey ? propertyMenuAnchor : null} open={propertyMenuOpen} onClose={closePropertyMenu} keepMounted>
                        <MenuItem onClick={() => { estimateRealEstate(i); closePropertyMenu(); }}>Estimate from value</MenuItem>
                      </Menu>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} sx={detailCellSx}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Mortgages</Typography>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Label</TableCell>
                            <TableCell>Balance</TableCell>
                            <TableCell>Rate (APR)</TableCell>
                            <TableCell>Payment</TableCell>
                            <TableCell>ZIP</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mortgages.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} align="center"><Typography color="text.secondary" variant="body2">No mortgages yet.</Typography></TableCell>
                            </TableRow>
                          )}
                          {mortgages.map((mortgage, mi) => (
                            <TableRow key={mortgage.id ?? `${propKey}-mortgage-${mi}`} hover>
                              <TableCell>
                                <TextField variant="standard" fullWidth label="Label" helperText=" " value={mortgage.id}
                                           onChange={(e) => updateMortgageRow(i, mi, { id: e.target.value })} />
                              </TableCell>
                              <TableCell>
                                <TextField variant="standard" type="number" fullWidth label="Balance" helperText=" " value={mortgage.balance}
                                           InputProps={currencyInputProps()}
                                           onChange={(e) => updateMortgageRow(i, mi, { balance: Number(e.target.value) })} />
                              </TableCell>
                              <TableCell>
                                <TextField variant="standard" type="number" fullWidth label="Rate (APR)" helperText=" " value={mortgage.rate ?? ''}
                                           placeholder="0.035"
                                           onChange={(e) => updateMortgageRow(i, mi, { rate: e.target.value === '' ? undefined : Number(e.target.value) })} />
                              </TableCell>
                              <TableCell>
                                <TextField variant="standard" type="number" fullWidth label="Payment" helperText=" " value={mortgage.payment ?? ''}
                                           InputProps={currencyInputProps()}
                                           onChange={(e) => updateMortgageRow(i, mi, { payment: e.target.value === '' ? undefined : Number(e.target.value) })} />
                              </TableCell>
                              <TableCell>
                                <TextField variant="standard" fullWidth label="ZIP" helperText=" " value={mortgage.zip || ''}
                                           onChange={(e) => updateMortgageRow(i, mi, { zip: e.target.value })} />
                              </TableCell>
                              <TableCell align="right">
                                <IconButton onClick={() => removeMortgageRow(i, mi)} aria-label="Remove mortgage">
                                  <DeleteIcon />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={6} align="center">
                              <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('realEstate')} onClick={() => addMortgageRow(i)}>Add Mortgage</Button>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} sx={detailCellSx}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Rentals</Typography>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Label</TableCell>
                            <TableCell>Rent (monthly)</TableCell>
                            <TableCell>Vacancy %</TableCell>
                            <TableCell>Expenses</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rentals.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} align="center"><Typography color="text.secondary" variant="body2">No rentals yet.</Typography></TableCell>
                            </TableRow>
                          )}
                          {rentals.map((rental, ri) => {
                            const rentalVacancyPct = ((rental.vacancy_pct ?? 0) * 100).toFixed(2)
                            const rentalVacancyError = Number(rentalVacancyPct) < 0 || Number(rentalVacancyPct) > 100
                            return (
                              <TableRow key={rental.id ?? `${propKey}-rental-${ri}`} hover>
                                <TableCell>
                                  <TextField variant="standard" fullWidth label="Label" helperText=" " value={rental.id || ''}
                                             onChange={(e) => updateRentalRow(i, ri, { id: e.target.value })} />
                                </TableCell>
                                <TableCell>
                                  <TextField variant="standard" type="number" fullWidth label="Rent" helperText=" " value={rental.rent}
                                             InputProps={currencyInputProps()}
                                             onChange={(e) => updateRentalRow(i, ri, { rent: Number(e.target.value) })} />
                                </TableCell>
                                <TableCell>
                                  <TextField variant="standard" type="number" fullWidth label="Vacancy %" helperText={rentalVacancyError ? '0-100' : ' '}
                                             error={rentalVacancyError}
                                             value={rentalVacancyPct}
                                             InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                             onChange={(e) => updateRentalRow(i, ri, { vacancy_pct: e.target.value === '' ? undefined : Number(e.target.value) / 100 })} />
                                </TableCell>
                                <TableCell>
                                  <TextField variant="standard" type="number" fullWidth label="Expenses" helperText=" " value={rental.expenses ?? 0}
                                             InputProps={currencyInputProps()}
                                             onChange={(e) => updateRentalRow(i, ri, { expenses: Number(e.target.value) })} />
                                </TableCell>
                                <TableCell align="right">
                                  <IconButton onClick={() => removeRentalRow(i, ri)} aria-label="Remove rental">
                                    <DeleteIcon />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                          <TableRow>
                            <TableCell colSpan={5} align="center">
                              <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('realEstate')} onClick={() => addRentalRow(i)}>Add Rental</Button>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              )
            })}
            <TableRow>
              <TableCell colSpan={7} align="center">
                <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('realEstate')} onClick={addRealEstate}>Add Property</Button>
              </TableCell>
            </TableRow>
          </TableBody>
              </Table>
            </TableContainer>
    </CardContent>
  </Card>
</Box>

      <Box ref={contributionsRef} sx={{ mt: 3 }}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={sectionHeadingSx('contributions')}>Contributions</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Amount</TableCell>
                    <TableCell>Frequency</TableCell>
                    <TableCell>Start</TableCell>
                    <TableCell>End</TableCell>
                    <TableCell>Note</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(draft.contributions || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center"><Typography color="text.secondary" variant="body2">No contributions yet.</Typography></TableCell>
                    </TableRow>
                  )}
                  {(draft.contributions || []).map((c, i) => {
                    const contribKey = `${i}-${c.account_id || 'contrib'}`
                    const detailsOpen = !!contributionDetailsOpen[contribKey]
                    return (
                      <React.Fragment key={contribKey}>
                        <TableRow hover>
                          <TableCell>
                            <TextField variant="standard" type="number" fullWidth label="Amount" helperText=" " value={c.amount}
                                       InputProps={currencyInputProps()}
                                       onChange={(e) => setContribution(i, { amount: Number(e.target.value) })} />
                          </TableCell>
                          <TableCell>
                            <TextField variant="standard" select fullWidth label="Frequency" helperText=" " value={c.frequency}
                                       onChange={(e) => setContribution(i, { frequency: e.target.value as any })}>
                              <MenuItem value="once">Once</MenuItem>
                              <MenuItem value="monthly">Monthly</MenuItem>
                              <MenuItem value="annual">Annual</MenuItem>
                            </TextField>
                          </TableCell>
                          <TableCell>
                            <TextField variant="standard" type="date" fullWidth label="Start" helperText=" " InputLabelProps={{ shrink: true }} value={c.start || ''}
                                       InputProps={retirementDateValue ? {
                                         endAdornment: (
                                           <InputAdornment position="end">
                                             <Tooltip title="Start at retirement">
                                               <IconButton size="small" aria-label="Set start to retirement date"
                                                           sx={{ color: SECTION_COLORS.contributions }}
                                                           onClick={() => retirementDateValue && setContribution(i, { start: retirementDateValue })}>
                                                 <PlayCircleOutlineIcon fontSize="small" />
                                               </IconButton>
                                             </Tooltip>
                                           </InputAdornment>
                                         )
                                       } : undefined}
                                       onChange={(e) => setContribution(i, { start: e.target.value || undefined })} />
                          </TableCell>
                          <TableCell>
                            <TextField variant="standard" type="date" fullWidth label="End" helperText=" " InputLabelProps={{ shrink: true }} value={c.end || ''}
                                       InputProps={retirementDateValue ? {
                                         endAdornment: (
                                           <InputAdornment position="end">
                                             <Tooltip title="End at retirement">
                                               <IconButton size="small" aria-label="Set end to retirement date"
                                                           sx={{ color: SECTION_COLORS.contributions }}
                                                           onClick={() => retirementDateValue && setContribution(i, { end: retirementDateValue })}>
                                                 <StopCircleOutlinedIcon fontSize="small" />
                                               </IconButton>
                                             </Tooltip>
                                           </InputAdornment>
                                         )
                                       } : undefined}
                                       onChange={(e) => setContribution(i, { end: e.target.value || undefined })} />
                          </TableCell>
                          <TableCell>
                            <TextField variant="standard" fullWidth label="Note" value={c.note || ''} helperText=" "
                                       onChange={(e) => setContribution(i, { note: e.target.value })} />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <IconButton size="small" onClick={(e) => openContributionMenu(contribKey, e.currentTarget)} aria-label="Contribution options">
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                              <IconButton onClick={() => removeContribution(i)} aria-label="Remove contribution">
                                <DeleteIcon />
                              </IconButton>
                            </Stack>
                            <Menu anchorEl={contributionMenuFor === contribKey ? contributionMenuAnchor : null} open={contributionMenuFor === contribKey && Boolean(contributionMenuAnchor)} onClose={closeContributionMenu} keepMounted>
                              <MenuItem onClick={() => { toggleContributionDetails(contribKey); closeContributionMenu(); }}>
                                {detailsOpen ? 'Hide account ID' : 'Add to account ID'}
                              </MenuItem>
                            </Menu>
                          </TableCell>
                        </TableRow>
                        {detailsOpen && (
                          <TableRow>
                            <TableCell colSpan={6} sx={{ backgroundColor: 'background.default' }}>
                              <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                  <TextField variant="standard" fullWidth label="Account ID" value={c.account_id}
                                             helperText="Link this contribution to an account"
                                             onChange={(e) => setContribution(i, { account_id: e.target.value })} />
                                </Grid>
                              </Grid>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('contributions')} onClick={addContribution}>Add Contribution</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
          </CardContent>
        </Card>
      </Box>

      <Box ref={expensesRef} sx={{ mt: 3 }}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={sectionHeadingSx('expenses')}>Expenses</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Amount</TableCell>
              <TableCell>Frequency</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(draft.expenses || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center"><Typography color="text.secondary" variant="body2">No expenses yet.</Typography></TableCell>
              </TableRow>
            )}
            {(draft.expenses || []).map((e, i) => (
              <TableRow key={i} hover>
                <TableCell>
                  <TextField variant="standard" type="number" fullWidth label="Amount" helperText=" " value={e.amount}
                             InputProps={currencyInputProps()}
                             onChange={(ev) => setExpense(i, { amount: Number(ev.target.value) })} />
                </TableCell>
                <TableCell>
                  <TextField variant="standard" select fullWidth label="Frequency" helperText=" " value={e.frequency}
                             onChange={(ev) => setExpense(i, { frequency: ev.target.value as any })}>
                    <MenuItem value="once">Once</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="annual">Annual</MenuItem>
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField variant="standard" type="date" fullWidth label="Start" helperText=" " InputLabelProps={{ shrink: true }} value={e.start || ''}
                             InputProps={retirementDateValue ? {
                               endAdornment: (
                                 <InputAdornment position="end">
                                   <Tooltip title="Start at retirement">
                                     <IconButton size="small" aria-label="Set start to retirement date"
                                                 sx={{ color: SECTION_COLORS.expenses }}
                                                 onClick={() => retirementDateValue && setExpense(i, { start: retirementDateValue })}>
                                       <PlayCircleOutlineIcon fontSize="small" />
                                     </IconButton>
                                   </Tooltip>
                                 </InputAdornment>
                               )
                             } : undefined}
                             onChange={(ev) => setExpense(i, { start: ev.target.value || undefined })} />
                </TableCell>
                <TableCell>
                  <TextField variant="standard" type="date" fullWidth label="End" helperText=" " InputLabelProps={{ shrink: true }} value={e.end || ''}
                             InputProps={retirementDateValue ? {
                               endAdornment: (
                                 <InputAdornment position="end">
                                   <Tooltip title="End at retirement">
                                     <IconButton size="small" aria-label="Set end to retirement date"
                                                 sx={{ color: SECTION_COLORS.expenses }}
                                                 onClick={() => retirementDateValue && setExpense(i, { end: retirementDateValue })}>
                                       <StopCircleOutlinedIcon fontSize="small" />
                                     </IconButton>
                                   </Tooltip>
                                 </InputAdornment>
                               )
                             } : undefined}
                             onChange={(ev) => setExpense(i, { end: ev.target.value || undefined })} />
                </TableCell>
                <TableCell>
                  <TextField variant="standard" fullWidth label="Category" helperText=" " value={e.category || ''}
                             onChange={(ev) => setExpense(i, { category: ev.target.value || undefined })} />
                </TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => removeExpense(i)}><DeleteIcon /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          <TableRow>
            <TableCell colSpan={6} align="center">
              <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('expenses')} onClick={addExpense}>Add Expense</Button>
            </TableCell>
          </TableRow>
        </TableBody>
        </Table>
      </TableContainer>
          </CardContent>
        </Card>
      </Box>

      <Box ref={socialSecurityRef} sx={{ mt: 3 }}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={sectionHeadingSx('social')}>Social Security</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Claim Age</TableCell>
                    <TableCell>Monthly Amount</TableCell>
                    <TableCell>COLA %</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(draft.social_security || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center"><Typography color="text.secondary" variant="body2">No social security entries yet.</Typography></TableCell>
                    </TableRow>
                  )}
                  {(draft.social_security || []).map((s, i) => (
                    <TableRow key={i} hover>
                      <TableCell>
                        <TextField variant="standard" type="number" fullWidth label="Claim Age" helperText=" " value={s.claim_age} onChange={(e) => setSS(i, { claim_age: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" type="number" fullWidth label="Monthly Amount" value={s.monthly_amount} error={s.monthly_amount < 0}
                                   helperText={s.monthly_amount < 0 ? 'Must be >= 0' : ' '}
                                   InputProps={currencyInputProps()}
                                   onChange={(e) => setSS(i, { monthly_amount: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" type="number" fullWidth label="COLA %" value={((s.COLA ?? 0) * 100).toString()} error={(s.COLA || 0) < 0 || (s.COLA || 0) > 0.1}
                                   helperText={(s.COLA || 0) < 0 || (s.COLA || 0) > 0.1 ? 'Suggested range 0-10%' : ' '}
                                   InputProps={{ endAdornment: <InputAdornment position="end"><Tooltip title="Cost-of-living adjustment annual %"><InfoOutlinedIcon fontSize="small" /></Tooltip></InputAdornment> }}
                                   onChange={(e) => setSS(i, { COLA: Number(e.target.value) / 100 })} />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton onClick={() => removeSS(i)}><DeleteIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Button startIcon={<AddIcon />} variant="outlined" sx={addButtonSx('social')} onClick={addSS}>Add Claim</Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Snapshot JSON</DialogTitle>
        <DialogContent dividers>
          <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12 }}>
            {pretty}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </section>
  )
}
