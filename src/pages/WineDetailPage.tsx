import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useWine, useWineBalances } from '../hooks/useWines'
import { formatBottles } from '../utils/format'

const WINE_DETAIL_TABS = [
  { to: 'purchases', label: 'Purchases' },
  { to: 'sales', label: 'Sales' },
  { to: 'data-quality', label: 'Data Quality' },
]

export function WineDetailPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const { data: wine, isLoading: isWineLoading } = useWine(wineId)
  const { data: balances } = useWineBalances()

  const balanceInBottles = balances?.find((b) => b.wine.id === wineId)?.balanceInBottles

  if (isWineLoading) {
    return <p className="spinner-text">Loading...</p>
  }

  if (!wine) {
    return <p className="empty-state">Wine not found.</p>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-header__meta">
            <Link to="/">Wine Inventory</Link> / {wine.name}
          </p>
          <h1>{wine.name}</h1>
          {!wine.active && <span className="badge badge--neutral">Inactive</span>}
        </div>
      </div>

      <div className="card">
        <h2>Ending bottles</h2>
        <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-h)' }}>
          {balanceInBottles !== undefined ? formatBottles(balanceInBottles) : '-'} bottles
        </p>
      </div>

      <div className="tabs">
        {WINE_DETAIL_TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
