import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PeriodToggle } from '../components/PeriodToggle'
import { PriceHistoryChart } from '../components/PriceHistoryChart'
import { useWinePurchaseHistory } from '../hooks/useWines'
import { buildPriceHistory, PRICE_PERIODS, type PricePeriod, type PricePoint } from '../utils/priceHistory'
import { formatCurrency, formatDate } from '../utils/format'

type SortColumn = 'date' | 'unitPrice'
type SortDir = 'asc' | 'desc'

function sortHeader(
  label: string,
  column: SortColumn,
  sort: { column: SortColumn; dir: SortDir },
  onSort: (column: SortColumn) => void,
) {
  return (
    <button type="button" className="sortable-header" onClick={() => onSort(column)}>
      {label}
      <span className="sortable-header__arrow">{sort.column === column ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )
}

export function WinePurchasesPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const navigate = useNavigate()
  const { data: history, isLoading } = useWinePurchaseHistory(wineId)
  const [period, setPeriod] = useState<PricePeriod>('all')
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({ column: 'date', dir: 'desc' })

  const priceHistory = useMemo(() => (history ? buildPriceHistory(history, period) : null), [history, period])

  const sortedPoints: PricePoint[] = useMemo(() => {
    if (!priceHistory) return []
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...priceHistory.points].sort((a, b) => {
      if (sort.column === 'date') return sign * a.date.localeCompare(b.date)
      return sign * (a.unitPrice - b.unitPrice)
    })
  }, [priceHistory, sort])

  function handleSort(column: SortColumn) {
    setSort((current) =>
      current.column === column ? { column, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { column, dir: 'asc' },
    )
  }

  return (
    <div>
      {!!history?.length && (
        <div className="card">
          <div className="detail-card__header">
            <h2>Purchase price</h2>
            <PeriodToggle options={PRICE_PERIODS} value={period} onChange={setPeriod} />
          </div>
          {priceHistory && priceHistory.points.length > 0 ? (
            <PriceHistoryChart points={priceHistory.points} vendors={priceHistory.vendors} />
          ) : (
            <p className="empty-state">No purchases in this period.</p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Purchases</h2>
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && history?.length === 0 && (
          <p className="empty-state">No approved purchases yet for this wine.</p>
        )}
        {!!history?.length && sortedPoints.length === 0 && (
          <p className="empty-state">No purchases in this period.</p>
        )}
        {sortedPoints.length > 0 && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>{sortHeader('Date', 'date', sort, handleSort)}</th>
                <th>Vendor</th>
                <th className="numeric">Qty</th>
                <th className="numeric">{sortHeader('Unit Price', 'unitPrice', sort, handleSort)}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPoints.map((point) => (
                <tr
                  key={`${point.invoiceId}-${point.date}`}
                  className="data-table__row--clickable"
                  onClick={() => navigate(`/invoices/${point.invoiceId}`)}
                >
                  <td>{formatDate(point.date)}</td>
                  <td className="cell-truncate" title={point.vendorName}>
                    {point.vendorName}
                  </td>
                  <td className="numeric">{point.quantity}</td>
                  <td className="numeric">{formatCurrency(point.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
