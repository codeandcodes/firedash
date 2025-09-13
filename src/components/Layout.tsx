import { NavLink } from 'react-router-dom'
import React from 'react'

const navItems = [
  { to: '/upload', label: 'Upload' },
  { to: '/snapshot', label: 'Snapshot' },
  { to: '/contrib-expenses', label: 'Contrib & Expenses' },
  { to: '/real-estate', label: 'Real Estate' },
  { to: '/social-security', label: 'Social Security' },
  { to: '/assumptions', label: 'Assumptions' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/results', label: 'Results' },
  { to: '/sensitivity', label: 'Sensitivity' }
]

export const Layout: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Firedash</div>
        <nav>
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}

