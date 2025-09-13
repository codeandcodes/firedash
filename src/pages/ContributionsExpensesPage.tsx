import { useApp } from '@state/AppContext'

export function ContributionsExpensesPage() {
  const { snapshot } = useApp()
  return (
    <section>
      <h1>Contributions & Expenses</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <>
          <h2>Contributions</h2>
          <ul>
            {(snapshot.contributions || []).map((c, i) => (
              <li key={i}>
                {c.frequency} {c.amount} → {c.account_id}
              </li>
            ))}
          </ul>
          <h2>Expenses</h2>
          <ul>
            {(snapshot.expenses || []).map((e, i) => (
              <li key={i}>
                {e.frequency} {e.amount} {e.category ? `(${e.category})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

