import { useApp } from '@state/AppContext'
import { computeAllocation, classifyHolding } from '@engine/alloc'
import { PieChart } from '@components/charts/PieChart'
import { Card, CardContent, Grid, Typography } from '@mui/material'

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
  const COLORS: Record<string, string> = { US_STOCK: '#7aa2f7', INTL_STOCK: '#91d7e3', BONDS: '#a6da95', REIT: '#f5a97f', CASH: '#eed49f', REAL_ESTATE: '#c6a0f6', CRYPTO: '#f28fad', GOLD: '#e5c07b' }
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
      <Typography variant="h4" gutterBottom>Portfolio Snapshot</Typography>
      <Typography sx={{ mb: 2 }} color="text.secondary">Timestamp: <code>{snapshot.timestamp}</code></Typography>

      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography variant="overline">Estimated Net Invested</Typography><Typography variant="h5">${total.toLocaleString()}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography variant="overline">Accounts</Typography><Typography variant="h5">{snapshot.accounts.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography variant="overline">Real Estate</Typography><Typography variant="h5">{snapshot.real_estate?.length || 0}</Typography></CardContent></Card></Grid>
      </Grid>

      <Typography variant="h6" gutterBottom>Asset Class Breakdown</Typography>
      <Card sx={{ mb: 3 }}><CardContent><PieChart data={pieData} title={`Allocation (Total $${Math.round(alloc.total).toLocaleString()})`} /></CardContent></Card>

      <Typography variant="h6" gutterBottom>Accounts</Typography>
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
          <Card key={a.id} sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>{a.name || a.id}</Typography>
              <Grid container spacing={2} alignItems="stretch">
                <Grid item xs={12} md={4}><PieChart data={data} title={`$${Math.round(totalA).toLocaleString()}`} /></Grid>
                <Grid item xs={12} md={8}>
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
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}
