import { useApp } from '@state/AppContext'

export function SocialSecurityPage() {
  const { snapshot } = useApp()
  return (
    <section>
      <h1>Social Security</h1>
      {!snapshot && <p>No snapshot loaded.</p>}
      {snapshot && (
        <ul>
          {(snapshot.social_security || []).map((s, i) => (
            <li key={i}>
              Claim at {s.claim_age}: ${s.monthly_amount}/mo {s.COLA ? `(COLA ${Math.round(s.COLA * 100)}%)` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

