import { useMemo } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { StatTile } from '../components/StatTile'
import { useAlertThresholds } from '../hooks/useAlerts'
import { useSales } from '../hooks/useSales'
import { useWine, useWineBalances, useWinePurchaseHistory } from '../hooks/useWines'
import { computeBalanceHistory } from '../utils/balanceHistory'
import { formatBottles, formatCurrency } from '../utils/format'

const WINE_DETAIL_TABS = [
  { to: 'purchases', label: 'Purchases' },
  { to: 'sales', label: 'Sales' },
  { to: 'data-quality', label: 'Data Quality' },
]

export function WineDetailPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const { data: wine, isLoading: isWineLoading } = useWine(wineId)
  const { data: balances } = useWineBalances()
  const { data: purchaseHistory } = useWinePurchaseHistory(wineId)
  const { data: sales } = useSales(wineId)
  const { data: thresholds } = useAlertThresholds()

  const balanceInBottles = balances?.find((b) => b.wine.id === wineId)?.balanceInBottles
  const threshold = thresholds?.find((t) => t.wineId === wineId && t.active)
  const isBelowThreshold = threshold && balanceInBottles !== undefined && balanceInBottles < threshold.minBottles

  // Only the current (last) point is used here - period choice doesn't matter since every period's series ends "now".
  const approxValue = useMemo(() => {
    if (!wine || !purchaseHistory || !sales) return null
    const history = computeBalanceHistory(purchaseHistory, sales, wine, '30d')
    return history.length ? history[history.length - 1].approxValue : null
  }, [wine, purchaseHistory, sales])

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

      <div className="stat-grid stat-grid--fixed-2">
        <StatTile
          label="Ending Bottles"
          value={balanceInBottles !== undefined ? formatBottles(balanceInBottles) : '-'}
          tone={isBelowThreshold ? 'danger' : 'neutral'}
        />
        <StatTile label="Approx Value" value={approxValue !== null ? formatCurrency(approxValue) : '-'} />
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
