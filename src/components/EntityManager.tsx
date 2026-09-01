import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import type { WineCategory } from '../types'
import { readFileAsDataUrl } from '../utils/readFileAsDataUrl'
import { Modal } from './Modal'

const WINE_CATEGORY_OPTIONS: { value: WineCategory; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'rose', label: 'Rosé' },
  { value: 'sparkling', label: 'Sparkling' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'fortified', label: 'Fortified' },
  { value: 'other', label: 'Other' },
]

const VOLUME_ML_PRESETS = [187, 375, 500, 750, 1000, 1500, 3000]

interface Entity {
  id: string
  name: string
  invoiceName?: string | null
  active: boolean
  country?: string | null
  volumeMl?: number | null
  category?: WineCategory | null
  imageDataUrl?: string | null
}

interface EntityInput {
  name: string
  invoiceName?: string | null
  country?: string
  volumeMl?: number | null
  category?: WineCategory | null
  imageDataUrl?: string | null
}

interface EntityManagerProps {
  title: string
  singularLabel: string
  items: Entity[]
  isLoading: boolean
  query: string
  onQueryChange: (query: string) => void
  includeInactive: boolean
  onIncludeInactiveChange: (includeInactive: boolean) => void
  onCreate: (input: EntityInput) => Promise<unknown>
  onUpdate: (id: string, input: EntityInput) => Promise<unknown>
  onSetActive: (id: string, active: boolean) => Promise<unknown>
  /** Permanently removes the item. Rejects if it has invoice history - the caller should deactivate instead. */
  onDelete: (id: string) => Promise<unknown>
  /** Shows a Country field in the create/detail popups. Wines only. */
  showCountry?: boolean
  /** Shows Volume and Category fields in the create/detail popups. Wines only. */
  showWineDetails?: boolean
  /** Shows a photo upload/thumbnail. Wines only. */
  showImage?: boolean
}

function ImageField({
  label,
  imageDataUrl,
  onChange,
}: {
  label: string
  imageDataUrl: string | null
  onChange: (dataUrl: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    onChange(dataUrl)
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="picker">
        {imageDataUrl ? (
          <img src={imageDataUrl} alt="" className="entity-thumb entity-thumb--large" />
        ) : (
          <div className="entity-thumb entity-thumb--large entity-thumb--empty" />
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
        <button type="button" className="btn btn--small" onClick={() => inputRef.current?.click()}>
          {imageDataUrl ? 'Change photo' : 'Upload photo'}
        </button>
        {imageDataUrl && (
          <button type="button" className="btn btn--small" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

/** Shared search/create/view-edit/activate-deactivate/delete UI for Wine SKUs and Vendors. */
export function EntityManager({
  title,
  singularLabel,
  items,
  isLoading,
  query,
  onQueryChange,
  includeInactive,
  onIncludeInactiveChange,
  onCreate,
  onUpdate,
  onSetActive,
  onDelete,
  showCountry,
  showWineDetails,
  showImage,
}: EntityManagerProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newInvoiceName, setNewInvoiceName] = useState('')
  const [newCountry, setNewCountry] = useState('')
  const [newVolume, setNewVolume] = useState('')
  const [newCategory, setNewCategory] = useState<WineCategory | ''>('')
  const [newImage, setNewImage] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [detailItem, setDetailItem] = useState<Entity | null>(null)
  const [detailName, setDetailName] = useState('')
  const [detailInvoiceName, setDetailInvoiceName] = useState('')
  const [detailCountry, setDetailCountry] = useState('')
  const [detailVolume, setDetailVolume] = useState('')
  const [detailCategory, setDetailCategory] = useState<WineCategory | ''>('')
  const [detailImage, setDetailImage] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  function openCreateModal() {
    setNewName('')
    setNewInvoiceName('')
    setNewCountry('')
    setNewVolume('')
    setNewCategory('')
    setNewImage(null)
    setCreateError(null)
    setIsCreateOpen(true)
  }

  async function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setIsCreating(true)
    try {
      await onCreate({
        name: newName,
        invoiceName: newInvoiceName,
        country: newCountry,
        volumeMl: newVolume ? Number(newVolume) : null,
        category: newCategory || null,
        imageDataUrl: newImage,
      })
      setIsCreateOpen(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create.')
    } finally {
      setIsCreating(false)
    }
  }

  function openDetail(entity: Entity) {
    setDetailItem(entity)
    setDetailName(entity.name)
    setDetailInvoiceName(entity.invoiceName ?? '')
    setDetailCountry(entity.country ?? '')
    setDetailVolume(entity.volumeMl != null ? String(entity.volumeMl) : '')
    setDetailCategory(entity.category ?? '')
    setDetailImage(entity.imageDataUrl ?? null)
    setDetailError(null)
  }

  async function handleSaveDetail() {
    if (!detailItem) return
    setDetailError(null)
    setIsSaving(true)
    try {
      await onUpdate(detailItem.id, {
        name: detailName,
        invoiceName: detailInvoiceName,
        country: detailCountry,
        volumeMl: detailVolume ? Number(detailVolume) : null,
        category: detailCategory || null,
        imageDataUrl: detailImage,
      })
      setDetailItem(null)
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
      await onSetActive(detailItem.id, !detailItem.active)
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
      await onDelete(detailItem.id)
      setDetailItem(null)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not delete.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      {showWineDetails && (
        <datalist id="wine-volume-ml-presets">
          {VOLUME_ML_PRESETS.map((ml) => (
            <option key={ml} value={ml} />
          ))}
        </datalist>
      )}
      <div className="page-header">
        <h2>{title}</h2>
        <button type="button" className="btn btn--primary" onClick={openCreateModal}>
          + New {singularLabel}
        </button>
      </div>

      {isCreateOpen && (
        <Modal title={`New ${singularLabel}`} onClose={() => setIsCreateOpen(false)}>
          <form className="stack" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="new-entity-name">Name</label>
              <input
                id="new-entity-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="new-entity-invoice-name">Invoice name</label>
              <input
                id="new-entity-invoice-name"
                value={newInvoiceName}
                onChange={(event) => setNewInvoiceName(event.target.value)}
                placeholder="Name as it appears on invoices, if different"
              />
            </div>
            {showCountry && (
              <div className="field">
                <label htmlFor="new-entity-country">Country</label>
                <input
                  id="new-entity-country"
                  value={newCountry}
                  onChange={(event) => setNewCountry(event.target.value)}
                />
              </div>
            )}
            {showWineDetails && (
              <div className="field">
                <label htmlFor="new-entity-volume">Volume (ml)</label>
                <input
                  id="new-entity-volume"
                  type="number"
                  min="1"
                  step="1"
                  list="wine-volume-ml-presets"
                  value={newVolume}
                  onChange={(event) => setNewVolume(event.target.value)}
                  placeholder="e.g. 750"
                />
              </div>
            )}
            {showWineDetails && (
              <div className="field">
                <label htmlFor="new-entity-category">Category</label>
                <select
                  id="new-entity-category"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value as WineCategory | '')}
                >
                  <option value="">Not set</option>
                  {WINE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showImage && <ImageField label="Photo" imageDataUrl={newImage} onChange={setNewImage} />}
            {createError && <p className="notice notice--error">{createError}</p>}
            <div className="picker" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={isCreating || !newName.trim()}>
                {isCreating ? 'Creating...' : `Create ${singularLabel}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detailItem && (
        <Modal title={detailItem.name} onClose={() => setDetailItem(null)}>
          <div className="stack">
            <div className="field">
              <label htmlFor="detail-entity-name">Name</label>
              <input
                id="detail-entity-name"
                value={detailName}
                onChange={(event) => setDetailName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="detail-entity-invoice-name">Invoice name</label>
              <input
                id="detail-entity-invoice-name"
                value={detailInvoiceName}
                onChange={(event) => setDetailInvoiceName(event.target.value)}
                placeholder="Name as it appears on invoices, if different"
              />
            </div>
            {showCountry && (
              <div className="field">
                <label htmlFor="detail-entity-country">Country</label>
                <input
                  id="detail-entity-country"
                  value={detailCountry}
                  onChange={(event) => setDetailCountry(event.target.value)}
                />
              </div>
            )}
            {showWineDetails && (
              <div className="field">
                <label htmlFor="detail-entity-volume">Volume (ml)</label>
                <input
                  id="detail-entity-volume"
                  type="number"
                  min="1"
                  step="1"
                  list="wine-volume-ml-presets"
                  value={detailVolume}
                  onChange={(event) => setDetailVolume(event.target.value)}
                  placeholder="e.g. 750"
                />
              </div>
            )}
            {showWineDetails && (
              <div className="field">
                <label htmlFor="detail-entity-category">Category</label>
                <select
                  id="detail-entity-category"
                  value={detailCategory}
                  onChange={(event) => setDetailCategory(event.target.value as WineCategory | '')}
                >
                  <option value="">Not set</option>
                  {WINE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showImage && <ImageField label="Photo" imageDataUrl={detailImage} onChange={setDetailImage} />}

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
                <button type="button" className="btn" onClick={() => setDetailItem(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={isSaving || !detailName.trim()}
                  onClick={handleSaveDetail}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      <div className="inline-form">
        <input
          type="search"
          className="search-input"
          placeholder={`Search ${singularLabel}s`}
          aria-label={`Search ${singularLabel}s`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => onIncludeInactiveChange(event.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <p className="page-header__meta" style={{ marginBottom: 8 }}>
        Click a {singularLabel} to view, edit, deactivate, or delete it.
      </p>

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && items.length === 0 && <p className="empty-state">No {singularLabel}s found.</p>}
        {items.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="data-table__row--clickable" onClick={() => openDetail(item)}>
                  <td>
                    <span className="row-link">{item.name}</span>
                  </td>
                  <td>
                    <span className={`badge ${item.active ? 'badge--confirmed' : 'badge--neutral'}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
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
