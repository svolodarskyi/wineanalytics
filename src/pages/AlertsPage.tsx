import { useIsFetching } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router-dom'
import { useReassessAlerts } from '../hooks/useAlerts'

const ALERTS_TABS = [
  { to: '/alerts/inventory', label: 'Inventory' },
  { to: '/alerts/data-quality', label: 'Data Quality' },
]

/** Parent layout for every Alerts page - one heading with a Reassess action shared by both alert types, tabs to switch between them, the active one rendered via Outlet. */
export function AlertsPage() {
  const reassess = useReassessAlerts()
  const isReassessing = useIsFetching({ queryKey: ['alerts'] }) > 0

  return (
    <div>
      <div className="page-header">
        <h1>Alerts</h1>
        <button type="button" className="btn btn--primary" disabled={isReassessing} onClick={reassess}>
          {isReassessing ? 'Reassessing...' : 'Reassess alerts'}
        </button>
      </div>
      <div className="tabs">
        {ALERTS_TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
