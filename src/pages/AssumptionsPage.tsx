import { useApp } from '@state/AppContext'

export function AssumptionsPage() {
  const { snapshot } = useApp()
  return (
    <section>
      <h1>Assumptions</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <pre className="code-block">{JSON.stringify(snapshot.assumptions || {}, null, 2)}</pre>
      )}
    </section>
  )
}

