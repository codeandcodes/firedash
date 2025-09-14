import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@state/AppContext'
import type { Snapshot, Account, HoldingLot, RealEstate, Contribution, Expense, SocialSecurity, Assumptions } from '@types/schema'
import { validateSnapshot } from '@types/schema'
import { importMonarchFromString } from '@importers/monarch'
import { Accordion, AccordionDetails, AccordionSummary, Button, Card, CardContent, Grid, IconButton, InputLabel, MenuItem, Select, TextField, Typography, FormControl, Tooltip, InputAdornment, Stack } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

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

export function BuilderPage() {
  const [draft, setDraft] = useState<Snapshot>({ ...emptySnapshot })
  const [errors, setErrors] = useState<string[]>([])
  const { setSnapshot, snapshot } = useApp()
  const nav = useNavigate()

  const pretty = useMemo(() => JSON.stringify(draft, null, 2), [draft])

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

  // Accounts
  function addAccount() {
    const a: Account = { id: `acct-${(draft.accounts.length + 1).toString().padStart(2, '0')}`, type: 'taxable-brokerage', name: '', holdings: [], cash_balance: 0 }
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

  // Real estate
  function addRealEstate() {
    const re: RealEstate = { id: `prop-${(draft.real_estate?.length || 0) + 1}`, value: 0, appreciation_pct: 0.035 }
    update('real_estate', [ ...(draft.real_estate || []), re ])
  }
  function setRealEstate(idx: number, patch: Partial<RealEstate>) {
    const next = (draft.real_estate || []).slice(); next[idx] = { ...next[idx], ...patch }; update('real_estate', next)
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
    setRealEstate(idx, est)
  }
  function removeRealEstate(idx: number) {
    const next = (draft.real_estate || []).slice(); next.splice(idx, 1); update('real_estate', next)
  }

  // Contributions / Expenses
  function addContribution() {
    const c: Contribution = { account_id: draft.accounts[0]?.id || '', amount: 0, frequency: 'monthly' }
    update('contributions', [ ...(draft.contributions || []), c ])
  }
  function setContribution(i: number, patch: Partial<Contribution>) {
    const next = (draft.contributions || []).slice(); next[i] = { ...next[i], ...patch }; update('contributions', next)
  }
  function removeContribution(i: number) {
    const next = (draft.contributions || []).slice(); next.splice(i, 1); update('contributions', next)
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

  // Monarch JSON Paste
  const [monarchRaw, setMonarchRaw] = useState('')
  const [importInfo, setImportInfo] = useState<string>('')
  function importMonarch() {
    try {
      const res = importMonarchFromString(monarchRaw)
      setImportInfo(`Imported ${res.meta.positions} positions into ${res.meta.accounts} accounts${res.meta.lastSyncedAt ? ` (last sync ${res.meta.lastSyncedAt})` : ''}`)
      setDraft((d) => ({
        ...d,
        timestamp: res.meta.lastSyncedAt || d.timestamp,
        accounts: res.accounts
      }))
      setErrors([])
    } catch (e: any) {
      setErrors([`Monarch import failed: ${e.message}`])
      setImportInfo('')
    }
  }

  return (
    <section>
      <Typography variant="h4" gutterBottom>Snapshot Builder</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Compose a point-in-time snapshot, then download or load it into the dashboard.</Typography>

      {errors.length > 0 && (
        <div className="errors">
          <strong>Validation errors</strong>
          <ul>{errors.map((e, i) => (<li key={i}>{e}</li>))}</ul>
        </div>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="overline">Import from Monarch JSON</Typography>
              <TextField multiline fullWidth minRows={6} placeholder="Paste Monarch investments JSON here" value={monarchRaw} onChange={(e) => setMonarchRaw(e.target.value)} sx={{ mt: 1 }} />
              <Grid container spacing={1} mt={1} alignItems="center">
                <Grid item><Button variant="contained" onClick={importMonarch}>Import Investments</Button></Grid>
                <Grid item>{importInfo && <Typography color="text.secondary">{importInfo}</Typography>}</Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>General</Typography></AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}><TextField fullWidth label="Timestamp" value={draft.timestamp} onChange={(e) => update('timestamp', e.target.value)} /></Grid>
                <Grid item xs={12} md={3}><TextField fullWidth label="Currency" value={draft.currency} onChange={(e) => update('currency', e.target.value as any)} /></Grid>
                <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Current Age" value={draft.person?.current_age || ''} onChange={(e) => update('person', { ...(draft.person || {}), current_age: Number(e.target.value) })} /></Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>
        <Grid item xs={12} md={6}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Retirement</Typography></AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}><TextField type="number" fullWidth label="Retirement Age" value={draft.retirement.target_age || ''} onChange={(e) => update('retirement', { ...draft.retirement, target_age: Number(e.target.value) || undefined })} /></Grid>
                <Grid item xs={12} md={4}><TextField type="date" fullWidth label="Target Date" InputLabelProps={{ shrink: true }} value={draft.retirement.target_date || ''} onChange={(e) => update('retirement', { ...draft.retirement, target_date: e.target.value || undefined })} /></Grid>
                <Grid item xs={12} md={4}><TextField type="number" fullWidth label="Expected Spend (mo)" value={draft.retirement.expected_spend_monthly} onChange={(e) => update('retirement', { ...draft.retirement, expected_spend_monthly: Number(e.target.value) })} /></Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mt: 3 }}>Accounts</Typography>
      <Button startIcon={<AddIcon />} sx={{ mt: 1, mb: 1 }} onClick={addAccount}>Add Account</Button>
      {draft.accounts.map((a, i) => (
        <Accordion key={i} defaultExpanded sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ flexGrow: 1 }}>Account #{i + 1}: {a.name || a.id}</Typography>
            <IconButton onClick={(e) => { e.stopPropagation(); removeAccount(i) }}><DeleteIcon /></IconButton>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField fullWidth label="ID" value={a.id} onChange={(e) => setAccount(i, { id: e.target.value })} /></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth label="Name" value={a.name || ''} onChange={(e) => setAccount(i, { name: e.target.value })} /></Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel id={`type-${i}`}>Type</InputLabel>
                  <Select labelId={`type-${i}`} label="Type" value={a.type} onChange={(e) => setAccount(i, { type: e.target.value as Account['type'] })}>
                    <MenuItem value="taxable-brokerage">Taxable</MenuItem>
                    <MenuItem value="401k">401k</MenuItem>
                    <MenuItem value="ira">IRA</MenuItem>
                    <MenuItem value="roth">Roth</MenuItem>
                    <MenuItem value="hsa">HSA</MenuItem>
                    <MenuItem value="cash">Cash</MenuItem>
                    <MenuItem value="crypto">Crypto</MenuItem>
                    <MenuItem value="other">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Cash Balance" value={a.cash_balance || 0} onChange={(e) => setAccount(i, { cash_balance: Number(e.target.value) })} /></Grid>
            </Grid>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Holdings</Typography>
            <Button startIcon={<AddIcon />} size="small" sx={{ mb: 1 }} onClick={() => addHolding(i)}>Add Holding</Button>
            {(a.holdings || []).map((h, hi) => (
              <Grid key={hi} container spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Grid item xs={12} md={3}><TextField fullWidth label="Ticker" value={h.ticker || ''} onChange={(e) => setHolding(i, hi, { ticker: e.target.value })} /></Grid>
                <Grid item xs={12} md={3}><TextField fullWidth label="Name" value={h.name || ''} onChange={(e) => setHolding(i, hi, { name: e.target.value })} /></Grid>
                <Grid item xs={12} md={2}><TextField type="number" fullWidth label="Units" value={h.units} onChange={(e) => setHolding(i, hi, { units: Number(e.target.value) })} /></Grid>
                <Grid item xs={12} md={2}><TextField type="number" fullWidth label="Price" value={h.price} onChange={(e) => setHolding(i, hi, { price: Number(e.target.value) })} /></Grid>
                <Grid item xs={12} md={2}><IconButton onClick={() => removeHolding(i, hi)}><DeleteIcon /></IconButton></Grid>
              </Grid>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}

      <Typography variant="h6" sx={{ mt: 3 }}>Real Estate</Typography>
      <Button startIcon={<AddIcon />} sx={{ mt: 1, mb: 1 }} onClick={addRealEstate}>Add Property</Button>
      {(draft.real_estate || []).map((re, i) => (
        <Accordion key={i} defaultExpanded sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ flexGrow: 1 }}>Property #{i + 1}: {re.id}</Typography>
            <IconButton onClick={(e) => { e.stopPropagation(); removeRealEstate(i) }}><DeleteIcon /></IconButton>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField fullWidth label="ID" value={re.id} onChange={(e) => setRealEstate(i, { id: e.target.value })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Value" value={re.value} onChange={(e) => setRealEstate(i, { value: Number(e.target.value) })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Mortgage Balance" value={re.mortgage_balance || 0} error={(re.mortgage_balance||0) < 0} helperText={(re.mortgage_balance||0) < 0 ? 'Must be >= 0' : ' '} onChange={(e) => setRealEstate(i, { mortgage_balance: Number(e.target.value) })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Rate (APR)" value={re.rate || 0} helperText="e.g., 0.035 = 3.5%" error={(re.rate||0) < 0} onChange={(e) => setRealEstate(i, { rate: Number(e.target.value) })} /></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth label="Zip" value={re.zip || ''} onChange={(e) => setRealEstate(i, { zip: e.target.value })} placeholder="e.g., 94087" /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Payment" value={re.payment || 0} onChange={(e) => setRealEstate(i, { payment: Number(e.target.value) })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Taxes (annual)" value={re.taxes || 0} error={(re.taxes||0)<0} helperText={(re.taxes||0)<0?'Must be >= 0':' '} onChange={(e) => setRealEstate(i, { taxes: Number(e.target.value) })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Insurance (annual)" value={re.insurance || 0} error={(re.insurance||0)<0} helperText={(re.insurance||0)<0?'Must be >= 0':' '} onChange={(e) => setRealEstate(i, { insurance: Number(e.target.value) })} /></Grid>
              <Grid item xs={12} md={3}>
                <TextField type="number" fullWidth label="Maintenance %" value={((re.maintenance_pct || 0) * 100).toString()}
                           error={(re.maintenance_pct||0) < 0 || (re.maintenance_pct||0) > 1}
                           helperText="Annual % of value"
                           InputProps={{ endAdornment: <InputAdornment position="end"><Tooltip title="Typical rule of thumb is ~1% annually"><InfoOutlinedIcon fontSize="small" /></Tooltip></InputAdornment> }}
                           onChange={(e) => setRealEstate(i, { maintenance_pct: Number(e.target.value) / 100 })} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField type="number" fullWidth label="Appreciation %" value={((re.appreciation_pct || 0) * 100).toString()}
                           error={(re.appreciation_pct||0) < 0 || (re.appreciation_pct||0) > 1}
                           helperText="Long-run expected annual %"
                           InputProps={{ endAdornment: <InputAdornment position="end"><Tooltip title="Edit if you have a better local estimate"><InfoOutlinedIcon fontSize="small" /></Tooltip></InputAdornment> }}
                           onChange={(e) => setRealEstate(i, { appreciation_pct: Number(e.target.value) / 100 })} />
              </Grid>
              <Grid item xs={12}><Button size="small" onClick={() => estimateRealEstate(i)}>Estimate fields</Button></Grid>
            </Grid>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Rental (optional)</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Rent (monthly)" value={re.rental?.rent || 0} error={(re.rental?.rent||0)<0} helperText={(re.rental?.rent||0)<0?'Must be >= 0':' '}
                           InputProps={{ endAdornment: <InputAdornment position="end"><Tooltip title="Quick estimate uses ~0.5% of value per month"><InfoOutlinedIcon fontSize="small" /></Tooltip></InputAdornment> }}
                           onChange={(e) => setRealEstate(i, { rental: { ...(re.rental || {}), rent: Number(e.target.value) } as any })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Vacancy %" value={((re.rental?.vacancy_pct || 0) * 100).toString()} error={(re.rental?.vacancy_pct||0) < 0 || (re.rental?.vacancy_pct||0) > 1} helperText="Percent of time vacant"
                           onChange={(e) => setRealEstate(i, { rental: { ...(re.rental || {}), vacancy_pct: Number(e.target.value) / 100 } as any })} /></Grid>
              <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Expenses (monthly)" value={re.rental?.expenses || 0} error={(re.rental?.expenses||0)<0} helperText={(re.rental?.expenses||0)<0?'Must be >= 0':' '} onChange={(e) => setRealEstate(i, { rental: { ...(re.rental || {}), expenses: Number(e.target.value) } as any })} /></Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}

      <Typography variant="h6" sx={{ mt: 3 }}>Contributions</Typography>
      <Button startIcon={<AddIcon />} sx={{ mt: 1, mb: 1 }} onClick={addContribution}>Add Contribution</Button>
      {(draft.contributions || []).map((c, i) => (
        <Grid key={i} container spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Grid item xs={12} md={3}><TextField fullWidth label="Account ID" value={c.account_id} onChange={(e) => setContribution(i, { account_id: e.target.value })} /></Grid>
          <Grid item xs={12} md={2}><TextField type="number" fullWidth label="Amount" value={c.amount} onChange={(e) => setContribution(i, { amount: Number(e.target.value) })} /></Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel id={`freq-c-${i}`}>Frequency</InputLabel>
              <Select labelId={`freq-c-${i}`} label="Frequency" value={c.frequency} onChange={(e) => setContribution(i, { frequency: e.target.value as any })}>
                <MenuItem value="once">Once</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}><TextField type="date" fullWidth label="Start" InputLabelProps={{ shrink: true }} value={c.start || ''} onChange={(e) => setContribution(i, { start: e.target.value || undefined })} /></Grid>
          <Grid item xs={12} md={2}><TextField type="date" fullWidth label="End" InputLabelProps={{ shrink: true }} value={c.end || ''} onChange={(e) => setContribution(i, { end: e.target.value || undefined })} /></Grid>
          <Grid item xs={12} md={1}><IconButton onClick={() => removeContribution(i)}><DeleteIcon /></IconButton></Grid>
        </Grid>
      ))}

      <Typography variant="h6" sx={{ mt: 3 }}>Expenses</Typography>
      <Button startIcon={<AddIcon />} sx={{ mt: 1, mb: 1 }} onClick={addExpense}>Add Expense</Button>
      {(draft.expenses || []).map((e, i) => (
        <Grid key={i} container spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Grid item xs={12} md={2}><TextField type="number" fullWidth label="Amount" value={e.amount} onChange={(ev) => setExpense(i, { amount: Number(ev.target.value) })} /></Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel id={`freq-e-${i}`}>Frequency</InputLabel>
              <Select labelId={`freq-e-${i}`} label="Frequency" value={e.frequency} onChange={(ev) => setExpense(i, { frequency: ev.target.value as any })}>
                <MenuItem value="once">Once</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}><TextField type="date" fullWidth label="Start" InputLabelProps={{ shrink: true }} value={e.start || ''} onChange={(ev) => setExpense(i, { start: ev.target.value || undefined })} /></Grid>
          <Grid item xs={12} md={2}><TextField type="date" fullWidth label="End" InputLabelProps={{ shrink: true }} value={e.end || ''} onChange={(ev) => setExpense(i, { end: ev.target.value || undefined })} /></Grid>
          <Grid item xs={12} md={3}><TextField fullWidth label="Category" value={e.category || ''} onChange={(ev) => setExpense(i, { category: ev.target.value || undefined })} /></Grid>
          <Grid item xs={12} md={1}><IconButton onClick={() => removeExpense(i)}><DeleteIcon /></IconButton></Grid>
        </Grid>
      ))}

      <Typography variant="h6" sx={{ mt: 3 }}>Social Security</Typography>
      <Button startIcon={<AddIcon />} sx={{ mt: 1, mb: 1 }} onClick={addSS}>Add Claim</Button>
      {(draft.social_security || []).map((s, i) => (
        <Grid key={i} container spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Grid item xs={12} md={2}><TextField type="number" fullWidth label="Claim Age" value={s.claim_age} onChange={(e) => setSS(i, { claim_age: Number(e.target.value) })} /></Grid>
          <Grid item xs={12} md={3}><TextField type="number" fullWidth label="Monthly Amount" value={s.monthly_amount} error={s.monthly_amount<0} helperText={s.monthly_amount<0?'Must be >= 0':' '}
                                               onChange={(e) => setSS(i, { monthly_amount: Number(e.target.value) })} /></Grid>
          <Grid item xs={12} md={2}><TextField type="number" fullWidth label="COLA %" value={((s.COLA ?? 0) * 100).toString()} error={(s.COLA||0) < 0 || (s.COLA||0) > 0.1}
                                               InputProps={{ endAdornment: <InputAdornment position="end"><Tooltip title="Cost-of-living adjustment annual %"><InfoOutlinedIcon fontSize="small" /></Tooltip></InputAdornment> }}
                                               onChange={(e) => setSS(i, { COLA: Number(e.target.value) / 100 })} /></Grid>
          <Grid item xs={12} md={1}><IconButton onClick={() => removeSS(i)}><DeleteIcon /></IconButton></Grid>
        </Grid>
      ))}

      <Grid container spacing={1} sx={{ mt: 2 }}>
        <Grid item><Button onClick={() => setDraft({ ...emptySnapshot, timestamp: nowIso() })}>Reset</Button></Grid>
        {snapshot && <Grid item><Button onClick={() => setDraft(snapshot)}>Load From Current</Button></Grid>}
        <Grid item><Button onClick={prefillSample}>Prefill Sample</Button></Grid>
        <Grid item><Button variant="contained" onClick={loadIntoApp}>Load Into App</Button></Grid>
        <Grid item><Button variant="outlined" onClick={download}>Download JSON</Button></Grid>
      </Grid>

      <h2 style={{ marginTop: 16 }}>Preview JSON</h2>
      <pre className="code-block" style={{ maxHeight: 320, overflow: 'auto' }}>{pretty}</pre>
    </section>
  )
}
/*
Snapshot Builder page.
- Import Monarch JSON; edit General/Retirement; manage Accounts/Holdings; Real Estate (with estimate helper), Contributions, Expenses, Social Security.
- Inline validation and tooltips for clarity; actions to load/download snapshot.
*/
