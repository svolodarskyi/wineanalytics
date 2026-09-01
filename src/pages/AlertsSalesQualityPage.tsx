import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSalesAlertThreshold, useSalesQualityAlerts, useSetSalesAlertThreshold } from '../hooks/useAlerts'
import type { SalesAlertThreshold, SalesQualityReason } from '../types'
import { formatDateTime, formatVolumeMl } from '../utils/format'

const REASON_LABELS: Record<SalesQualityReason, string> = {
  below_minimum: 'Below minimum',
  above_maximum: 'Above maximum',
}

/**
 * Mounted only once `threshold` has loaded, so its local edit state can be
 * initialized directly from the loaded value instead of syncing it in via
 * an effect - a fresh mount per loaded value is exactly what's needed here.
 */
function SalesThresholdForm({
  threshold,
  onSave,
}: {
  threshold: SalesAlertThreshold
  onSave: (input: SalesAlertThreshold) => Promise<unknown>
}) {
  const [minVolume, setMinVolume] = useState(threshold.minVolumeMl != null ? String(threshold.minVolumeMl) : '')
  const [maxVolume, setMaxVolume] = useState(threshold.maxVolumeMl != null ? String(threshold.maxVolumeMl) : '')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setIsSaving(true)
    try {
      await onSave({
        minVolumeMl: minVolume.trim() === '' ? null : Number(minVolume),
        maxVolumeMl: maxVolume.trim() === '' ? null : Number(maxVolume),
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the threshold.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <form className="inline-form" onSubmit={handleSave}>
        <div className="field">
          <label htmlFor="sales-alert-min">Min volume (ml)</label>
          <input
            id="sales-alert-min"
            type="number"
            min="0"
            step="1"
            value={minVolume}
            onChange={(event) => setMinVolume(event.target.value)}
            placeholder="No minimum"
          />
        </div>
        <div className="field">
          <label htmlFor="sales-alert-max">Max volume (ml)</label>
          <input
            id="sales-alert-max"
            type="number"
            min="0"
            step="1"
            value={maxVolume}
            onChange={(event) => setMaxVolume(event.target.value)}
            placeholder="No maximum"
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </form>
      {formError && <p className="notice notice--error">{formError}</p>}
    </>
  )
}

export function AlertsSalesQualityPage() {
  const { data: threshold, isLoading: thresholdLoading } = useSalesAlertThreshold()
  const { data: salesQualityAlerts, isLoading: alertsLoading } = useSalesQualityAlerts()
  const setThreshold = useSetSalesAlertThreshold()

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Sales Quality Alerts</h2>
          <p className="page-header__meta">
            Flags any recorded sale whose volume falls outside this range - useful for catching bad POS data.
          </p>
        </div>
      </div>

      <div className="card">
        {thresholdLoading || !threshold ? (
          <p className="spinner-text">Loading...</p>
        ) : (
          <SalesThresholdForm threshold={threshold} onSave={(input) => setThreshold.mutateAsync(input)} />
        )}
      </div>

      <h2>Flagged Sales</h2>
      <div className="card">
        {alertsLoading && <p className="spinner-text">Loading...</p>}
        {!alertsLoading && salesQualityAlerts?.length === 0 && (
          <p className="empty-state">No sales fall outside the configured range.</p>
        )}
        {!!salesQualityAlerts?.length && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Wine</th>
                <th>Sold At</th>
                <th className="numeric">Volume</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {salesQualityAlerts.map((alert) => (
                <tr key={alert.sale.id}>
                  <td>
                    <Link className="row-link" to={`/wines/${alert.wine.id}`}>
                      {alert.wine.name}
                    </Link>
                  </td>
                  <td>{formatDateTime(alert.sale.soldAt)}</td>
                  <td className="numeric">{formatVolumeMl(alert.sale.volumeMl)}</td>
                  <td>
                    <span className="badge badge--low">{REASON_LABELS[alert.reason]}</span>
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
