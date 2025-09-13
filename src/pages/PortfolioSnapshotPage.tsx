import { useApp } from '@state/AppContext'

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

  const totalCash = snapshot.accounts.reduce((s, a) => s + (a.cash_balance || 0), 0)
  const totalHoldings = snapshot.accounts.reduce((s, a) =>
    s + (a.holdings || []).reduce((h, lot) => h + lot.units * lot.price, 0), 0)
  const total = totalCash + totalHoldings

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
      <h2>Accounts</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.accounts.map((a) => {
            const val = (a.holdings || []).reduce((h, lot) => h + lot.units * lot.price, 0) + (a.cash_balance || 0)
            return (
              <tr key={a.id}>
                <td>{a.name || a.id}</td>
                <td>{a.type}</td>
                <td>${val.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

