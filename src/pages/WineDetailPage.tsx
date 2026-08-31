import { Link, useParams } from 'react-router-dom'
import { useWine, useWinePurchaseHistory } from '../hooks/useWines'
import { formatCurrency, formatDate } from '../utils/format'

export function WineDetailPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const { data: wine, isLoading: isWineLoading } = useWine(wineId)
  const { data: history, isLoading: isHistoryLoading } = useWinePurchaseHistory(wineId)

  const balanceInBottles = history?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0

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
        <h2>Current balance</h2>
        <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-h)' }}>{balanceInBottles} bottles</p>
      </div>

      <div className="card">
        <h2>Purchase history</h2>
        {isHistoryLoading && <p className="spinner-text">Loading...</p>}
        {!isHistoryLoading && history?.length === 0 && (
          <p className="empty-state">No approved purchases yet for this wine.</p>
        )}
        {!!history?.length && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th className="numeric">Quantity</th>
                <th className="numeric">Unit Price</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, index) => (
                <tr key={`${entry.invoiceId}-${index}`}>
                  <td>{formatDate(entry.date)}</td>
                  <td>{entry.vendorName}</td>
                  <td className="numeric">{entry.quantity}</td>
                  <td className="numeric">{formatCurrency(entry.unitPrice)}</td>
                  <td>
                    <Link className="row-link" to={`/invoices/${entry.invoiceId}`}>
                      View invoice
                    </Link>
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
