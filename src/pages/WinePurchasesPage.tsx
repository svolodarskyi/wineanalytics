import { Link, useParams } from 'react-router-dom'
import { useWinePurchaseHistory } from '../hooks/useWines'
import { formatCurrency, formatDate } from '../utils/format'

export function WinePurchasesPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const { data: history, isLoading } = useWinePurchaseHistory(wineId)

  return (
    <div className="card">
      <h2>Purchases</h2>
      {isLoading && <p className="spinner-text">Loading...</p>}
      {!isLoading && history?.length === 0 && (
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
  )
}
