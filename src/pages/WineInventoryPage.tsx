import { Link } from 'react-router-dom'
import { useInvoices } from '../hooks/useInvoices'
import { useWineBalances } from '../hooks/useWines'

export function WineInventoryPage() {
  const { data: balances, isLoading, error } = useWineBalances()
  const { data: pendingInvoices } = useInvoices('not_approved')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Wine Inventory</h1>
          <p className="page-header__meta">Balance in bottles, from approved invoices only.</p>
        </div>
      </div>

      {!!pendingInvoices?.length && (
        <div className="notice">
          {pendingInvoices.length} invoice{pendingInvoices.length === 1 ? '' : 's'} waiting for approval.{' '}
          <Link to="/invoices">Review invoices</Link>
        </div>
      )}

      {error && <p className="notice notice--error">Could not load wine balances.</p>}

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && balances?.length === 0 && (
          <p className="empty-state">No wines yet. Add wines from Settings to get started.</p>
        )}
        {!!balances?.length && (
          <table className="data-table data-table--fit">
            <thead>
              <tr>
                <th>Wine</th>
                <th className="numeric">Balance in Bottles</th>
              </tr>
            </thead>
            <tbody>
              {balances.map(({ wine, balanceInBottles }) => (
                <tr key={wine.id}>
                  <td>
                    <Link className="row-link" to={`/wines/${wine.id}`}>
                      {wine.name}
                    </Link>
                  </td>
                  <td className="numeric">{balanceInBottles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
