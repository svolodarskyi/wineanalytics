import { NavLink, Outlet } from 'react-router-dom'

const SETTINGS_TABS = [
  { to: '/settings/wines', label: 'Wines' },
  { to: '/settings/vendors', label: 'Vendors' },
  { to: '/settings/ai-requests', label: 'AI Requests' },
]

/** Parent layout for every Settings page - one heading, tabs to switch between them, the active one rendered via Outlet. */
export function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>
      <div className="tabs">
        {SETTINGS_TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
