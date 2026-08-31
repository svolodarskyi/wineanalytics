import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInvoices } from '../hooks/useInvoices'
import { useWineBalances } from '../hooks/useWines'
import type { WineSortBy } from '../services'

export function WineInventoryPage() {
  const [sortBy, setSortBy] = useState<WineSortBy>('name')
  const { data: balances, isLoading, error } = useWineBalances(sortBy)
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

      <div className="inline-form">
        <select aria-label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as WineSortBy)}>
          <option value="name">Sort by name</option>
          <option value="country">Sort by country</option>
        </select>
      </div>

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
              {balances.map(({ wine, balanceInBottles }, index) => {
                const previousCountry = index > 0 ? balances[index - 1].wine.country : undefined
                const showGroupHeading = sortBy === 'country' && wine.country !== previousCountry
                return (
                  <Fragment key={wine.id}>
                    {showGroupHeading && (
                      <tr className="data-table__group-row">
                        <td colSpan={2}>{wine.country ?? 'Unknown country'}</td>
                      </tr>
                    )}
                    <tr>
                      <td>
                        <Link className="row-link" to={`/wines/${wine.id}`}>
                          {wine.name}
                        </Link>
                      </td>
                      <td className="numeric">{balanceInBottles}</td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
