import { useState, type SubmitEvent } from 'react'
import { ActiveStatusDot } from '../components/ActiveStatusDot'
import { Modal } from '../components/Modal'
import {
  useCreatePourSize,
  useDeletePourSize,
  usePourSizes,
  useSetPourSizeActive,
  useUpdatePourSize,
} from '../hooks/usePourSizes'
import type { PourSize } from '../types'
import { formatVolumeMl } from '../utils/format'

export function SettingsPourSizesPage() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const { data: pourSizes, isLoading } = usePourSizes({ includeInactive })

  const createPourSize = useCreatePourSize()
  const updatePourSize = useUpdatePourSize()
  const setPourSizeActive = useSetPourSizeActive()
  const deletePourSize = useDeletePourSize()

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newVolume, setNewVolume] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [detailItem, setDetailItem] = useState<PourSize | null>(null)
  const [detailName, setDetailName] = useState('')
  const [detailVolume, setDetailVolume] = useState('')
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  function openCreateModal() {
    setNewName('')
    setNewVolume('')
    setCreateError(null)
    setIsCreateOpen(true)
  }

  async function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setIsCreating(true)
    try {
      await createPourSize.mutateAsync({ name: newName, volumeMl: Number(newVolume) })
      setIsCreateOpen(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create.')
    } finally {
      setIsCreating(false)
    }
  }

  function openDetail(pourSize: PourSize) {
    setDetailItem(pourSize)
    setDetailName(pourSize.name)
    setDetailVolume(String(pourSize.volumeMl))
    setDetailError(null)
  }

  function closeDetail() {
    setDetailItem(null)
  }

  async function handleSaveDetail() {
    if (!detailItem) return
    setDetailError(null)
    setIsSaving(true)
    try {
      await updatePourSize.mutateAsync({ id: detailItem.id, name: detailName, volumeMl: Number(detailVolume) })
      closeDetail()
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!detailItem) return
    setDetailError(null)
    try {
      await setPourSizeActive.mutateAsync({ id: detailItem.id, active: !detailItem.active })
      setDetailItem({ ...detailItem, active: !detailItem.active })
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not update status.')
    }
  }

  async function handleDelete() {
    if (!detailItem) return
    if (!window.confirm(`Delete "${detailItem.name}"? This cannot be undone.`)) return
    setDetailError(null)
    setIsDeleting(true)
    try {
      await deletePourSize.mutateAsync(detailItem.id)
      closeDetail()
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not delete.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Pour Sizes</h2>
        <button type="button" className="btn btn--primary" onClick={openCreateModal}>
          + New pour size
        </button>
      </div>
      <p className="page-header__meta" style={{ marginBottom: 8 }}>
        Shared across every wine - used when recording a by-the-glass sale.
      </p>

      <div className="inline-form">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && pourSizes?.length === 0 && <p className="empty-state">No pour sizes yet.</p>}
        {!!pourSizes?.length && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="numeric">Volume</th>
              </tr>
            </thead>
            <tbody>
              {pourSizes.map((pourSize) => (
                <tr key={pourSize.id} className="data-table__row--clickable" onClick={() => openDetail(pourSize)}>
                  <td>
                    <div className="name-row">
                      <ActiveStatusDot active={pourSize.active} />
                      <span className="row-link">{pourSize.name}</span>
                    </div>
                  </td>
                  <td className="numeric">{formatVolumeMl(pourSize.volumeMl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isCreateOpen && (
        <Modal title="New pour size" onClose={() => setIsCreateOpen(false)}>
          <form className="stack" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="new-pour-size-name">Name</label>
              <input
                id="new-pour-size-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Glass"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="new-pour-size-volume">Volume (ml)</label>
              <input
                id="new-pour-size-volume"
                type="number"
                min="1"
                step="1"
                value={newVolume}
                onChange={(event) => setNewVolume(event.target.value)}
                placeholder="e.g. 150"
              />
            </div>
            {createError && <p className="notice notice--error">{createError}</p>}
            <div className="picker" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={isCreating || !newName.trim() || !newVolume}
              >
                {isCreating ? 'Creating...' : 'Create pour size'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detailItem && (
        <Modal title={detailItem.name} onClose={closeDetail}>
          <div className="stack">
            <div className="field">
              <label htmlFor="detail-pour-size-name">Name</label>
              <input
                id="detail-pour-size-name"
                value={detailName}
                onChange={(event) => setDetailName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="detail-pour-size-volume">Volume (ml)</label>
              <input
                id="detail-pour-size-volume"
                type="number"
                min="1"
                step="1"
                value={detailVolume}
                onChange={(event) => setDetailVolume(event.target.value)}
              />
            </div>

            <div className="match-row">
              <span className={`badge ${detailItem.active ? 'badge--confirmed' : 'badge--neutral'}`}>
                {detailItem.active ? 'Active' : 'Inactive'}
              </span>
              <button type="button" className="btn btn--small" onClick={handleToggleActive}>
                {detailItem.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>

            {detailError && <p className="notice notice--error">{detailError}</p>}

            <div className="picker" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn--small btn--danger"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                Delete
              </button>
              <div className="picker">
                <button type="button" className="btn" onClick={closeDetail}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={isSaving || !detailName.trim() || !detailVolume}
                  onClick={handleSaveDetail}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
