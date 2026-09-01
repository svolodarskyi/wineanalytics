import { useNavigate, useParams } from 'react-router-dom'
import { useWine } from '../hooks/useWines'
import { DATA_QUALITY_FIELDS, isDataQualityFieldMissing } from '../utils/dataQuality'

export function WineDataQualityPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const { data: wine, isLoading } = useWine(wineId)
  const navigate = useNavigate()

  const missingFields = wine
    ? DATA_QUALITY_FIELDS.filter(({ field }) => isDataQualityFieldMissing(wine, field))
    : []

  return (
    <div className="card">
      <div className="page-header">
        <h2>Data Quality</h2>
      </div>

      {isLoading && <p className="spinner-text">Loading...</p>}
      {!isLoading && missingFields.length === 0 && (
        <p className="empty-state">All tracked fields are filled in for this wine.</p>
      )}
      {!!missingFields.length && (
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Missing Field</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {missingFields.map(({ field, label }) => (
              <tr key={field}>
                <td>{label}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => navigate(`/settings/wines?wineId=${wineId}&from=wine-detail`)}
                  >
                    Fix
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
