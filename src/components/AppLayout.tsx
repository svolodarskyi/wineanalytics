import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext'

const NAV_LINKS = [
  { to: '/', label: 'Wine Inventory', end: true },
  { to: '/invoices', label: 'Invoices', end: false },
  { to: '/settings/wines', label: 'Settings: Wines', end: false },
  { to: '/settings/vendors', label: 'Settings: Vendors', end: false },
  { to: '/settings/ai-requests', label: 'Settings: AI Requests', end: false },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu automatically after navigating. Derived during
  // render (rather than in an effect) to avoid an extra render pass.
  const [lastPathname, setLastPathname] = useState(location.pathname)
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/" className="app-nav__brand">
          Wine Analytics
        </Link>
        <button
          type="button"
          className="app-nav__menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
        <div className={`app-nav__panel${menuOpen ? ' open' : ''}`}>
          <div className="app-nav__links">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `app-nav__link${isActive ? ' active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
          {user && (
            <div className="app-nav__user">
              <span>{user.email}</span>
              <button type="button" className="btn btn--small" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
