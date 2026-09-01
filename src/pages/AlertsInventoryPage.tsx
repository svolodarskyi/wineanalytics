import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EntityPicker } from '../components/EntityPicker'
import { Modal } from '../components/Modal'
import { useAlertThresholds, useDeleteAlertThreshold, useInventoryAlerts, useSetAlertThreshold } from '../hooks/useAlerts'
import { useWines } from '../hooks/useWines'
import type { Wine } from '../types'

type ThresholdModalState = { wine: Wine; minBottles: string } | { wine: null } | null

export function AlertsInventoryPage() {
  const { data: inventoryAlerts, isLoading: inventoryLoading } = useInventoryAlerts()
  const { data: thresholds, isLoading: thresholdsLoading } = useAlertThresholds()
  const { data: wines } = useWines()

  const setThreshold = useSetAlertThreshold()
  const deleteThreshold = useDeleteAlertThreshold()

  const [modalState, setModalState] = useState<ThresholdModalState>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const winesById = new Map((wines ?? []).map((wine) => [wine.id, wine]))
  const existingThreshold = modalState?.wine ? (thresholds ?? []).find((t) => t.wineId === modalState.wine!.id) : undefined

  function openAddModal() {
    setModalError(null)
    setModalState({ wine: null })
  }

  function openEditModal(wineId: string, minBottles: number) {
    const wine = winesById.get(wineId)
    if (!wine) return
    setModalError(null)
    setModalState({ wine, minBottles: String(minBottles) })
  }

  function selectWineForThreshold(wineId: string) {
    const wine = winesById.get(wineId)
    if (!wine) return
    const existing = (thresholds ?? []).find((t) => t.wineId === wineId)
    setModalState({ wine, minBottles: existing ? String(existing.minBottles) : '' })
  }

  async function handleSaveThreshold() {
    if (!modalState || !modalState.wine) return
    const minBottles = Number(modalState.minBottles)
    if (modalState.minBottles.trim() === '' || !Number.isFinite(minBottles) || minBottles < 0) {
      setModalError('Enter a non-negative number of bottles.')
      return
    }
    setModalError(null)
    setIsSaving(true)
    try {
      await setThreshold.mutateAsync({ wineId: modalState.wine.id, minBottles })
      setModalState(null)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not save the alert level.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemoveThreshold() {
    if (!modalState || !modalState.wine) return
    if (!window.confirm('Remove this alert level?')) return
    setModalError(null)
    setIsRemoving(true)
    try {
      await deleteThreshold.mutateAsync(modalState.wine.id)
      setModalState(null)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not remove the alert level.')
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Inventory Alerts</h2>
        <button type="button" className="btn btn--small btn--primary" onClick={openAddModal}>
          + Set alert level
        </button>
      </div>
      <div className="card">
        {inventoryLoading && <p className="spinner-text">Loading...</p>}
        {!inventoryLoading && inventoryAlerts?.length === 0 && (
          <p className="empty-state">No wines are currently below their alert level.</p>
        )}
        {!!inventoryAlerts?.length && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Wine</th>
                <th className="numeric">Current Balance</th>
                <th className="numeric">Alert Level</th>
              </tr>
            </thead>
            <tbody>
              {inventoryAlerts.map((alert) => (
                <tr key={alert.wine.id}>
                  <td>
                    <div className="match-row">
                      <Link className="row-link" to={`/wines/${alert.wine.id}`}>
                        {alert.wine.name}
                      </Link>
                      <span className="badge badge--low">Low stock</span>
                    </div>
                  </td>
                  <td className="numeric">{alert.balanceInBottles}</td>
                  <td className="numeric">{alert.minBottles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Alert Levels</h2>
      <p className="page-header__meta" style={{ marginBottom: 8 }}>
        Click a wine to edit or remove its alert level.
      </p>
      <div className="card">
        {thresholdsLoading && <p className="spinner-text">Loading...</p>}
        {!thresholdsLoading && thresholds?.length === 0 && (
          <p className="empty-state">No alert levels configured yet.</p>
        )}
        {!!thresholds?.length && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Wine</th>
                <th className="numeric">Alert Level (bottles)</th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map((threshold) => {
                const wine = winesById.get(threshold.wineId)
                return (
                  <tr
                    key={threshold.id}
                    className="data-table__row--clickable"
                    onClick={() => openEditModal(threshold.wineId, threshold.minBottles)}
                  >
                    <td>
                      <span className="row-link">{wine?.name ?? 'Unknown wine'}</span>
                    </td>
                    <td className="numeric">{threshold.minBottles}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalState && (
        <Modal
          title={modalState.wine ? `Alert level: ${modalState.wine.name}` : 'Set alert level'}
          onClose={() => setModalState(null)}
        >
          {!modalState.wine ? (
            <EntityPicker
              items={wines ?? []}
              searchLabel="Search wines"
              entityLabel="wine"
              onSelect={selectWineForThreshold}
            />
          ) : (
            <div className="stack">
              <div className="field">
                <label htmlFor="alert-min-bottles">Alert when balance falls below (bottles)</label>
                <input
                  id="alert-min-bottles"
                  type="number"
                  min="0"
                  step="1"
                  value={modalState.minBottles}
                  onChange={(event) =>
                    setModalState((current) =>
                      current && current.wine ? { ...current, minBottles: event.target.value } : current,
                    )
                  }
                  autoFocus
                />
              </div>
              {modalError && <p className="notice notice--error">{modalError}</p>}
              <div className="picker" style={{ justifyContent: existingThreshold ? 'space-between' : 'flex-end' }}>
                {existingThreshold && (
                  <button
                    type="button"
                    className="btn btn--small btn--danger"
                    disabled={isRemoving}
                    onClick={handleRemoveThreshold}
                  >
                    {isRemoving ? 'Removing...' : 'Remove'}
                  </button>
                )}
                <div className="picker">
                  <button type="button" className="btn" onClick={() => setModalState(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn--primary" disabled={isSaving} onClick={handleSaveThreshold}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
