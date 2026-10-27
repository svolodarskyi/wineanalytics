import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from '../components/Sparkline'
import { StatTile } from '../components/StatTile'
import { useInventoryAlerts } from '../hooks/useAlerts'
import { useInvoices } from '../hooks/useInvoices'
import { useWineBalances } from '../hooks/useWines'
import { computeInventoryValue, computeSpendSummary } from '../utils/dashboard'
import { formatBottles, formatCurrency, formatDeltaPct } from '../utils/format'

type SortDir = 'asc' | 'desc' | null

export function WineInventoryPage() {
  const { data: balances, isLoading, error } = useWineBalances()
  const { data: pendingInvoices } = useInvoices('not_approved')
  const { data: approvedInvoices } = useInvoices('approved')
  const { data: inventoryAlerts } = useInventoryAlerts()
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const lowStockWineIds = useMemo(() => new Set((inventoryAlerts ?? []).map((alert) => alert.wine.id)), [inventoryAlerts])

  const spendSummary = useMemo(() => (approvedInvoices ? computeSpendSummary(approvedInvoices) : null), [approvedInvoices])

  const inventoryValue = useMemo(
    () => (balances && approvedInvoices ? computeInventoryValue(balances, approvedInvoices) : null),
    [balances, approvedInvoices],
  )

  const sortedBalances = useMemo(() => {
    if (!balances || !sortDir) return balances
    const sign = sortDir === 'asc' ? 1 : -1
    return [...balances].sort((a, b) => sign * (a.balanceInBottles - b.balanceInBottles))
  }, [balances, sortDir])

  function toggleSort() {
    setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
  }

  return (
    <div>
      <div className="stat-grid">
        <StatTile
          label="Low Stock"
          value={inventoryAlerts ? inventoryAlerts.length : '-'}
          tone={inventoryAlerts && inventoryAlerts.length > 0 ? 'danger' : 'success'}
          to="/alerts/inventory"
        />
        <StatTile
          label="Invoices Pending Review"
          value={pendingInvoices ? pendingInvoices.length : '-'}
          tone={pendingInvoices && pendingInvoices.length > 0 ? 'warning' : 'neutral'}
          to="/invoices"
        />
        <StatTile
          label="Spend this month"
          value={spendSummary ? formatCurrency(spendSummary.thisMonth) : '-'}
          detail={
            spendSummary && (
              <>
                <span>
                  {formatCurrency(spendSummary.lastMonth)} last month
                  {spendSummary.deltaPct !== null && ` (${formatDeltaPct(spendSummary.deltaPct)})`}
                </span>
                <Sparkline values={spendSummary.weeklySpend} width={56} height={18} />
              </>
            )
          }
        />
        <StatTile label="Inventory Value" value={inventoryValue !== null ? formatCurrency(inventoryValue) : '-'} />
      </div>

      <div className="page-header">
        <div>
          <h1>Wine Inventory</h1>
          <p className="page-header__meta">Ending bottles: purchased from approved invoices, minus sold.</p>
        </div>
      </div>

      {error && <p className="notice notice--error">Could not load wine balances.</p>}

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && balances?.length === 0 && (
          <p className="empty-state">No wines yet. Add wines from Settings to get started.</p>
        )}
        {!!sortedBalances?.length && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Wine</th>
                <th className="numeric">
                  <button type="button" className="sortable-header" onClick={toggleSort}>
                    Ending Bottles
                    <span className="sortable-header__arrow">{sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : ''}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedBalances.map(({ wine, balanceInBottles }) => (
                <tr key={wine.id}>
                  <td>
                    <Link className="row-link" to={`/wines/${wine.id}`}>
                      {wine.name}
                    </Link>
                  </td>
                  <td className={`numeric${lowStockWineIds.has(wine.id) ? ' numeric--low' : ''}`}>
                    {formatBottles(balanceInBottles)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
