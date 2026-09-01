import { useNavigate } from 'react-router-dom'
import { useDataQualityAlerts } from '../hooks/useAlerts'
import { DATA_QUALITY_FIELDS } from '../utils/dataQuality'

export function AlertsDataQualityPage() {
  const { data: dataQualityAlerts, isLoading } = useDataQualityAlerts()
  const navigate = useNavigate()

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Data Quality Alerts</h2>
          <p className="page-header__meta">
            Tracked fields: {DATA_QUALITY_FIELDS.map((f) => f.label).join(', ')}. Update the list in
            src/utils/dataQuality.ts if this needs to change.
          </p>
        </div>
      </div>
      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && dataQualityAlerts?.length === 0 && (
          <p className="empty-state">Every wine has all tracked fields filled in.</p>
        )}
        {!!dataQualityAlerts?.length && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Wine</th>
                <th>Missing Field</th>
              </tr>
            </thead>
            <tbody>
              {dataQualityAlerts.map((alert, index) => {
                const fieldLabel = DATA_QUALITY_FIELDS.find((f) => f.field === alert.field)?.label ?? alert.field
                return (
                  <tr
                    key={`${alert.wine.id}-${alert.field}-${index}`}
                    className="data-table__row--clickable"
                    onClick={() => navigate(`/settings/wines?wineId=${alert.wine.id}&from=alerts`)}
                  >
                    <td>
                      <span className="row-link">{alert.wine.name}</span>
                    </td>
                    <td>{fieldLabel}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
