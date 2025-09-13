import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@state/AppContext'
import type { Snapshot, Account, HoldingLot, RealEstate, Contribution, Expense, SocialSecurity, Assumptions } from '@types/schema'
import { validateSnapshot } from '@types/schema'
import { importMonarchFromString } from '@importers/monarch'

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
  const { setSnapshot } = useApp()
  const nav = useNavigate()

  const pretty = useMemo(() => JSON.stringify(draft, null, 2), [draft])

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
    const lot: HoldingLot = { ticker: '', units: 0, price: 0 }
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
    const re: RealEstate = { id: `prop-${(draft.real_estate?.length || 0) + 1}`, value: 0 }
    update('real_estate', [ ...(draft.real_estate || []), re ])
  }
  function setRealEstate(idx: number, patch: Partial<RealEstate>) {
    const next = (draft.real_estate || []).slice(); next[idx] = { ...next[idx], ...patch }; update('real_estate', next)
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
      <h1>Snapshot Builder</h1>
      <p>Use this form to compose a point-in-time snapshot, then download or load it into the dashboard.</p>

      {errors.length > 0 && (
        <div className="errors">
          <strong>Validation errors</strong>
          <ul>{errors.map((e, i) => (<li key={i}>{e}</li>))}</ul>
        </div>
      )}

      <div className="cards">
        <div className="card">
          <div className="card-title">Import from Monarch JSON</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <textarea placeholder="Paste Monarch investments JSON here" value={monarchRaw} onChange={(e) => setMonarchRaw(e.target.value)} style={{ width: '100%', height: 180 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={importMonarch}>Import Investments</button>
              {importInfo && <span style={{ color: 'var(--muted)' }}>{importInfo}</span>}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">General</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Timestamp <input value={draft.timestamp} onChange={(e) => update('timestamp', e.target.value)} /></label>
            <label>Currency <input value={draft.currency} onChange={(e) => update('currency', e.target.value as any)} /></label>
            <label>Current Age <input type="number" value={draft.person?.current_age || ''} onChange={(e) => update('person', { ...(draft.person || {}), current_age: Number(e.target.value) })} /></label>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Retirement</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Retirement Age <input type="number" value={draft.retirement.target_age || ''} onChange={(e) => update('retirement', { ...draft.retirement, target_age: Number(e.target.value) || undefined })} /></label>
            <label>Target Date <input type="date" value={draft.retirement.target_date || ''} onChange={(e) => update('retirement', { ...draft.retirement, target_date: e.target.value || undefined })} /></label>
            <label>Expected Spend (mo) <input type="number" value={draft.retirement.expected_spend_monthly} onChange={(e) => update('retirement', { ...draft.retirement, expected_spend_monthly: Number(e.target.value) })} /></label>
            <label>Withdrawal Strategy
              <select value={draft.retirement.withdrawal_strategy || 'fixed-real'} onChange={(e) => update('retirement', { ...draft.retirement, withdrawal_strategy: e.target.value as any })}>
                <option value="fixed-real">Fixed Real</option>
                <option value="guardrails">Guardrails</option>
                <option value="vpw">VPW</option>
                <option value="floor-upside">Floor & Upside</option>
              </select>
            </label>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Assumptions</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Inflation Mode
              <select value={draft.assumptions?.inflation_mode || 'fixed'} onChange={(e) => setAssumptions({ inflation_mode: e.target.value as any })}>
                <option value="fixed">Fixed</option>
                <option value="historical_CPI">Historical CPI</option>
              </select>
            </label>
            <label>Inflation % <input type="number" step="0.01" value={(draft.assumptions?.inflation_pct ?? 0.02) * 100} onChange={(e) => setAssumptions({ inflation_pct: Number(e.target.value) / 100 })} /></label>
            <label>Rebalancing
              <select value={draft.assumptions?.rebalancing?.frequency || 'annual'} onChange={(e) => setAssumptions({ rebalancing: { ...(draft.assumptions?.rebalancing || {}), frequency: e.target.value as any } })}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <h2>Accounts</h2>
      <button onClick={addAccount}>Add Account</button>
      {draft.accounts.map((a, i) => (
        <div key={i} className="card" style={{ marginTop: 12 }}>
          <div className="card-title">Account #{i + 1}</div>
          <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <label>ID <input value={a.id} onChange={(e) => setAccount(i, { id: e.target.value })} /></label>
            <label>Name <input value={a.name || ''} onChange={(e) => setAccount(i, { name: e.target.value })} /></label>
            <label>Type
              <select value={a.type} onChange={(e) => setAccount(i, { type: e.target.value as Account['type'] })}>
                <option>taxable-brokerage</option>
                <option>401k</option>
                <option>ira</option>
                <option>roth</option>
                <option>hsa</option>
                <option>cash</option>
              </select>
            </label>
            <label>Cash Balance <input type="number" value={a.cash_balance || 0} onChange={(e) => setAccount(i, { cash_balance: Number(e.target.value) })} /></label>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Holdings</strong> <button onClick={() => addHolding(i)}>Add Holding</button>
            {(a.holdings || []).map((h, hi) => (
              <div key={hi} className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
                <label>Ticker <input value={h.ticker || ''} onChange={(e) => setHolding(i, hi, { ticker: e.target.value })} /></label>
                <label>Units <input type="number" value={h.units} onChange={(e) => setHolding(i, hi, { units: Number(e.target.value) })} /></label>
                <label>Price <input type="number" value={h.price} onChange={(e) => setHolding(i, hi, { price: Number(e.target.value) })} /></label>
                <div><button onClick={() => removeHolding(i, hi)}>Remove</button></div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}><button onClick={() => removeAccount(i)}>Remove Account</button></div>
        </div>
      ))}

      <h2 style={{ marginTop: 16 }}>Real Estate</h2>
      <button onClick={addRealEstate}>Add Property</button>
      {(draft.real_estate || []).map((re, i) => (
        <div key={i} className="card" style={{ marginTop: 12 }}>
          <div className="card-title">Property #{i + 1}</div>
          <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <label>ID <input value={re.id} onChange={(e) => setRealEstate(i, { id: e.target.value })} /></label>
            <label>Value <input type="number" value={re.value} onChange={(e) => setRealEstate(i, { value: Number(e.target.value) })} /></label>
            <label>Mortgage Balance <input type="number" value={re.mortgage_balance || 0} onChange={(e) => setRealEstate(i, { mortgage_balance: Number(e.target.value) })} /></label>
            <label>Rate <input type="number" step="0.001" value={re.rate || 0} onChange={(e) => setRealEstate(i, { rate: Number(e.target.value) })} /></label>
          </div>
          <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
            <label>Payment <input type="number" value={re.payment || 0} onChange={(e) => setRealEstate(i, { payment: Number(e.target.value) })} /></label>
            <label>Taxes <input type="number" value={re.taxes || 0} onChange={(e) => setRealEstate(i, { taxes: Number(e.target.value) })} /></label>
            <label>Insurance <input type="number" value={re.insurance || 0} onChange={(e) => setRealEstate(i, { insurance: Number(e.target.value) })} /></label>
            <label>Maintenance % <input type="number" step="0.01" value={(re.maintenance_pct || 0) * 100} onChange={(e) => setRealEstate(i, { maintenance_pct: Number(e.target.value) / 100 })} /></label>
          </div>
          <div style={{ marginTop: 8 }}><button onClick={() => removeRealEstate(i)}>Remove Property</button></div>
        </div>
      ))}

      <h2 style={{ marginTop: 16 }}>Contributions</h2>
      <button onClick={addContribution}>Add Contribution</button>
      {(draft.contributions || []).map((c, i) => (
        <div key={i} className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 6 }}>
          <label>Account ID <input value={c.account_id} onChange={(e) => setContribution(i, { account_id: e.target.value })} /></label>
          <label>Amount <input type="number" value={c.amount} onChange={(e) => setContribution(i, { amount: Number(e.target.value) })} /></label>
          <label>Frequency
            <select value={c.frequency} onChange={(e) => setContribution(i, { frequency: e.target.value as any })}>
              <option value="once">Once</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label>Start <input type="date" value={c.start || ''} onChange={(e) => setContribution(i, { start: e.target.value || undefined })} /></label>
          <label>End <input type="date" value={c.end || ''} onChange={(e) => setContribution(i, { end: e.target.value || undefined })} /></label>
          <div><button onClick={() => removeContribution(i)}>Remove</button></div>
        </div>
      ))}

      <h2 style={{ marginTop: 16 }}>Expenses</h2>
      <button onClick={addExpense}>Add Expense</button>
      {(draft.expenses || []).map((e, i) => (
        <div key={i} className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 6 }}>
          <label>Amount <input type="number" value={e.amount} onChange={(ev) => setExpense(i, { amount: Number(ev.target.value) })} /></label>
          <label>Frequency
            <select value={e.frequency} onChange={(ev) => setExpense(i, { frequency: ev.target.value as any })}>
              <option value="once">Once</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label>Start <input type="date" value={e.start || ''} onChange={(ev) => setExpense(i, { start: ev.target.value || undefined })} /></label>
          <label>End <input type="date" value={e.end || ''} onChange={(ev) => setExpense(i, { end: ev.target.value || undefined })} /></label>
          <label>Category <input value={e.category || ''} onChange={(ev) => setExpense(i, { category: ev.target.value || undefined })} /></label>
          <div><button onClick={() => removeExpense(i)}>Remove</button></div>
        </div>
      ))}

      <h2 style={{ marginTop: 16 }}>Social Security</h2>
      <button onClick={addSS}>Add Claim</button>
      {(draft.social_security || []).map((s, i) => (
        <div key={i} className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
          <label>Claim Age <input type="number" value={s.claim_age} onChange={(e) => setSS(i, { claim_age: Number(e.target.value) })} /></label>
          <label>Monthly Amount <input type="number" value={s.monthly_amount} onChange={(e) => setSS(i, { monthly_amount: Number(e.target.value) })} /></label>
          <label>COLA % <input type="number" step="0.01" value={(s.COLA ?? 0) * 100} onChange={(e) => setSS(i, { COLA: Number(e.target.value) / 100 })} /></label>
          <div><button onClick={() => removeSS(i)}>Remove</button></div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => setDraft({ ...emptySnapshot, timestamp: nowIso() })}>Reset</button>
        <button onClick={prefillSample}>Prefill Sample</button>
        <button onClick={loadIntoApp}>Load Into App</button>
        <button onClick={download}>Download JSON</button>
      </div>

      <h2 style={{ marginTop: 16 }}>Preview JSON</h2>
      <pre className="code-block" style={{ maxHeight: 320, overflow: 'auto' }}>{pretty}</pre>
    </section>
  )
}
