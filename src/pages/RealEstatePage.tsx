import { useApp } from '@state/AppContext'

export function RealEstatePage() {
  const { snapshot } = useApp()
  return (
    <section>
      <h1>Real Estate</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Value</th>
              <th>Mortgage</th>
            </tr>
          </thead>
          <tbody>
            {(snapshot.real_estate || []).map((re) => (
              <tr key={re.id}>
                <td>{re.id}</td>
                <td>${re.value.toLocaleString()}</td>
                <td>${(re.mortgage_balance || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

