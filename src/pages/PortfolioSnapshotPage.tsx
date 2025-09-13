import { useApp } from '@state/AppContext'
import { computeAllocation, classifyHolding } from '@engine/alloc'
import { PieChart } from '@components/charts/PieChart'

export function PortfolioSnapshotPage() {
  const { snapshot } = useApp()

  if (!snapshot) {
    return (
      <section>
        <h1>Portfolio Snapshot</h1>
        <p>No snapshot loaded. Go to Upload.</p>
      </section>
    )
  }

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  const totalCash = snapshot.accounts.reduce((s, a) => s + (a.cash_balance || 0), 0)
  const totalHoldings = snapshot.accounts.reduce((s, a) =>
    s + (a.holdings || []).reduce((h, lot) => h + lot.units * lot.price, 0), 0)
  const total = totalCash + totalHoldings
  const alloc = computeAllocation(snapshot)
  const COLORS: Record<string, string> = { US_STOCK: '#7aa2f7', INTL_STOCK: '#91d7e3', BONDS: '#a6da95', REIT: '#f5a97f', CASH: '#eed49f', REAL_ESTATE: '#c6a0f6', CRYPTO: '#f28fad' }
  // Use absolute dollars for global pie to avoid tiny slices rounding away
  const globalSums: Record<string, number> = { US_STOCK: 0, INTL_STOCK: 0, BONDS: 0, REIT: 0, CASH: 0, REAL_ESTATE: 0 }
  for (const a of snapshot.accounts) {
    if (a.cash_balance) globalSums.CASH += a.cash_balance
    for (const h of a.holdings || []) {
      const v = h.units * h.price
      const k = classifyHolding(h)
      globalSums[k] += v
    }
  }
  for (const re of snapshot.real_estate || []) globalSums.REAL_ESTATE += re.value || 0
  const pieData = Object.entries(globalSums).filter(([, v]) => v > 0).map(([k, v]) => ({ label: k, value: v, color: COLORS[k] || '#888' }))

  return (
    <section>
      <h1>Portfolio Snapshot</h1>
      <p>
        Timestamp: <code>{snapshot.timestamp}</code>
      </p>
      <div className="cards">
        <div className="card">
          <div className="card-title">Estimated Net Invested</div>
          <div className="card-metric">${total.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="card-title">Accounts</div>
          <div className="card-metric">{snapshot.accounts.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Real Estate</div>
          <div className="card-metric">{snapshot.real_estate?.length || 0}</div>
        </div>
      </div>
      <h2>Asset Class Breakdown</h2>
      <PieChart data={pieData} title={`Allocation (Total $${Math.round(alloc.total).toLocaleString()})`} />

      <h2>Accounts</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.accounts.map((a) => {
            const val = (a.holdings || []).reduce((h, lot) => h + lot.units * lot.price, 0) + (a.cash_balance || 0)
            return (
              <tr key={a.id}>
                <td>{a.name || a.id}</td>
                <td>{a.type}</td>
                <td className="num">{fmt(val)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {snapshot.accounts.map((a) => {
        // Build slices by actual holdings (ticker), not asset class
        const palette = ['#7aa2f7','#91d7e3','#a6da95','#f5a97f','#eed49f','#c6a0f6','#8bd5ca','#f28fad','#f0c6c6','#b8c0e0']
        const items: { label: string; value: number }[] = []
        for (const h of a.holdings || []) {
          const v = h.units * h.price
          const label = h.ticker || h.asset_class || 'Holding'
          if (v > 0) items.push({ label, value: v })
        }
        if (a.cash_balance && a.cash_balance > 0) items.push({ label: 'Cash', value: a.cash_balance })
        // Aggregate same-label holdings (rare per account but safe)
        const agg = new Map<string, number>()
        for (const it of items) agg.set(it.label, (agg.get(it.label) || 0) + it.value)
        const slices = Array.from(agg.entries()).map(([label, value]) => ({ label, value }))
        const totalA = slices.reduce((s, x) => s + x.value, 0)
        const data = slices.map((s, i) => ({ ...s, color: palette[i % palette.length] }))
        return (
          <div key={a.id} className="card" style={{ marginTop: 12 }}>
            <div className="card-title">{a.name || a.id}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
              <PieChart data={data} title={`$${Math.round(totalA).toLocaleString()}`} />
              <div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th className="num">Units</th>
                      <th className="num">Price</th>
                      <th className="num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(a.holdings || []).map((h, i) => (
                      <tr key={i}>
                        <td>{h.ticker || h.asset_class || '-'}</td>
                        <td className="num">{h.units}</td>
                        <td className="num">{fmt(h.price)}</td>
                        <td className="num">{fmt(h.units * h.price)}</td>
                      </tr>
                    ))}
                    {a.cash_balance ? (
                      <tr>
                        <td>Cash</td>
                        <td className="num">-</td>
                        <td className="num">-</td>
                        <td className="num">{fmt(a.cash_balance || 0)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
