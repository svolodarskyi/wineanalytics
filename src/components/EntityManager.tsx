import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import type { WineCategory, WineCountry, WineStyle } from '../types'
import { normalizeImagesForSave, readFileAsDataUrl } from '../utils/readFileAsDataUrl'
import { WINE_CATEGORY_OPTIONS, WINE_COUNTRY_OPTIONS, WINE_STYLE_OPTIONS } from '../utils/wineFormOptions'
import { ActiveStatusDot } from './ActiveStatusDot'
import { Modal } from './Modal'

const MAX_PHOTOS = 3

interface Entity {
  id: string
  name: string
  invoiceName?: string | null
  active: boolean
  volumeMl?: number | null
  category?: WineCategory | null
  style?: WineStyle | null
  country?: WineCountry | null
  imageDataUrls?: string[]
}

interface EntityInput {
  name: string
  invoiceName?: string | null
  volumeMl?: number | null
  category?: WineCategory | null
  style?: WineStyle | null
  country?: WineCountry | null
  imageDataUrls?: string[]
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
  /** Shows Volume and Category fields in the create/detail popups. Wines only. */
  showWineDetails?: boolean
  /** Shows a photo upload/thumbnail. Wines only. */
  showImage?: boolean
  /** Opens this item's detail popup automatically once it appears in `items` - for deep links like "fix this wine" from Alerts. Fires at most once per id. */
  autoOpenId?: string
  /** Called right after `autoOpenId` triggers the popup, so the caller can clear it (e.g. from the URL) without re-triggering on the next render. */
  onAutoOpened?: () => void
  /** Called whenever the detail popup closes, however it closes (Close button, overlay/Escape, or a successful Save/Delete) - e.g. to navigate back to wherever a deep link came from. */
  onDetailClosed?: () => void
  /** Sends the currently-added photos to OpenAI and returns suggested field values to pre-fill (never auto-saved - the user still reviews/edits before creating). Wines only, new-item modal only. */
  onScanWine?: (imageDataUrls: string[]) => Promise<{
    name: string | null
    volumeMl: number | null
    category: WineCategory | null
  }>
}

/**
 * Two separate file inputs, not one: a `multiple` input is how "choose
 * several from the library at once" works, but mobile browsers drop the
 * "Take Photo" option from the picker sheet entirely once `multiple` is set
 * (you can't multi-select from a camera). Splitting camera capture and
 * library choice into their own buttons/inputs is the only way to keep both.
 */
function PhotoPickerButtons({
  onFilesSelected,
  primary,
  disabled,
}: {
  onFilesSelected: (files: File[]) => void
  primary?: boolean
  disabled?: boolean
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) onFilesSelected(files)
  }

  const primaryClass = `btn btn--small${primary ? ' btn--primary' : ''}`

  return (
    <div className="picker">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <input ref={libraryInputRef} type="file" accept="image/*" multiple onChange={handleChange} style={{ display: 'none' }} />
      <button type="button" className={primaryClass} disabled={disabled} onClick={() => cameraInputRef.current?.click()}>
        📷 Take Photo
      </button>
      <button type="button" className="btn btn--small" disabled={disabled} onClick={() => libraryInputRef.current?.click()}>
        Choose Photos
      </button>
    </div>
  )
}

function ImagesField({
  label,
  imageDataUrls,
  onChange,
}: {
  label: string
  imageDataUrls: string[]
  onChange: (dataUrls: string[]) => void
}) {
  async function handleFiles(files: File[]) {
    const dataUrls = await Promise.all(files.map(readFileAsDataUrl))
    onChange([...imageDataUrls, ...dataUrls].slice(0, MAX_PHOTOS))
  }

  function removeAt(index: number) {
    onChange(imageDataUrls.filter((_, i) => i !== index))
  }

  return (
    <div className="field">
      <label>
        {label} ({imageDataUrls.length}/{MAX_PHOTOS})
      </label>
      <div className="entity-thumb-row">
        {imageDataUrls.map((url, index) => (
          <div key={index} className="entity-thumb-slot">
            <img src={url} alt="" className="entity-thumb entity-thumb--large" />
            <button type="button" className="btn btn--small" onClick={() => removeAt(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      {imageDataUrls.length < MAX_PHOTOS && (
        <div style={{ marginTop: 8 }}>
          <PhotoPickerButtons onFilesSelected={handleFiles} />
        </div>
      )}
    </div>
  )
}

/** Top-of-modal shortcut so scanning is the first thing a user sees, before any manual fields - separate from the Photos field further down, which stays focused on reviewing/managing the saved set. */
function ScanBottleButton({
  isScanning,
  error,
  onFilesSelected,
}: {
  isScanning: boolean
  error: string | null
  onFilesSelected: (files: File[]) => void
}) {
  return (
    <div className="scan-bottle-cta">
      <p className="page-header__meta" style={{ marginTop: 0, marginBottom: 8 }}>
        Scan a bottle: Name, Volume, and Category below get filled in for review.
      </p>
      <PhotoPickerButtons onFilesSelected={onFilesSelected} primary disabled={isScanning} />
      {isScanning && <p className="page-header__meta" style={{ marginTop: 6 }}>Scanning bottle...</p>}
      {error && <p className="notice notice--error">{error}</p>}
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
  showWineDetails,
  showImage,
  autoOpenId,
  onAutoOpened,
  onDetailClosed,
  onScanWine,
}: EntityManagerProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newInvoiceName, setNewInvoiceName] = useState('')
  const [newVolume, setNewVolume] = useState('')
  const [newCategory, setNewCategory] = useState<WineCategory | ''>('')
  const [newStyle, setNewStyle] = useState<WineStyle | ''>('')
  const [newCountry, setNewCountry] = useState<WineCountry | ''>('')
  const [newImages, setNewImages] = useState<string[]>([])
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const [detailItem, setDetailItem] = useState<Entity | null>(null)
  const [detailName, setDetailName] = useState('')
  const [detailInvoiceName, setDetailInvoiceName] = useState('')
  const [detailVolume, setDetailVolume] = useState('')
  const [detailCategory, setDetailCategory] = useState<WineCategory | ''>('')
  const [detailStyle, setDetailStyle] = useState<WineStyle | ''>('')
  const [detailCountry, setDetailCountry] = useState<WineCountry | ''>('')
  const [detailImages, setDetailImages] = useState<string[]>([])
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  function openCreateModal() {
    setNewName('')
    setNewInvoiceName('')
    setNewVolume('')
    setNewCategory('')
    setNewStyle('')
    setNewCountry('')
    setNewImages([])
    setCreateError(null)
    setScanError(null)
    setIsCreateOpen(true)
  }

  async function runScan(images: string[]) {
    if (!onScanWine || images.length === 0) return
    setScanError(null)
    setIsScanning(true)
    try {
      const result = await onScanWine(images)
      if (result.name) setNewName(result.name)
      if (result.volumeMl) setNewVolume(String(result.volumeMl))
      if (result.category) setNewCategory(result.category)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not scan the bottle.')
    } finally {
      setIsScanning(false)
    }
  }

  /** The top-of-modal shortcut: picking photo(s) here both adds them to the Photos field below and scans them immediately, so a user can go straight from empty modal to filled-in fields. */
  async function handleTopScan(files: File[]) {
    const dataUrls = await Promise.all(files.map(readFileAsDataUrl))
    const updatedImages = [...newImages, ...dataUrls].slice(0, MAX_PHOTOS)
    setNewImages(updatedImages)
    await runScan(updatedImages)
  }

  async function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setIsCreating(true)
    try {
      await onCreate({
        name: newName,
        invoiceName: newInvoiceName,
        volumeMl: newVolume ? Number(newVolume) : null,
        category: newCategory || null,
        style: newCategory === 'wine' ? newStyle || null : null,
        country: newCategory === 'wine' ? newCountry || null : null,
        imageDataUrls: await normalizeImagesForSave(newImages),
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
    setDetailVolume(entity.volumeMl != null ? String(entity.volumeMl) : '')
    setDetailCategory(entity.category ?? '')
    setDetailStyle(entity.style ?? '')
    setDetailCountry(entity.country ?? '')
    setDetailImages(entity.imageDataUrls ?? [])
    setDetailError(null)
  }

  function closeDetail() {
    setDetailItem(null)
    onDetailClosed?.()
  }

  const autoOpenedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoOpenId || autoOpenedIdRef.current === autoOpenId) return
    const match = items.find((item) => item.id === autoOpenId)
    if (!match) return
    autoOpenedIdRef.current = autoOpenId
    openDetail(match)
    onAutoOpened?.()
  }, [autoOpenId, items, onAutoOpened])

  async function handleSaveDetail() {
    if (!detailItem) return
    setDetailError(null)
    setIsSaving(true)
    try {
      await onUpdate(detailItem.id, {
        name: detailName,
        invoiceName: detailInvoiceName,
        volumeMl: detailVolume ? Number(detailVolume) : null,
        category: detailCategory || null,
        style: detailCategory === 'wine' ? detailStyle || null : null,
        country: detailCategory === 'wine' ? detailCountry || null : null,
        imageDataUrls: await normalizeImagesForSave(detailImages),
      })
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
        <h2>{title}</h2>
        <button type="button" className="btn btn--primary" onClick={openCreateModal}>
          + New {singularLabel}
        </button>
      </div>

      {isCreateOpen && (
        <Modal title={`New ${singularLabel}`} onClose={() => setIsCreateOpen(false)} size="large">
          <form className="stack" onSubmit={handleCreate}>
            {showImage && onScanWine && <ScanBottleButton isScanning={isScanning} error={scanError} onFilesSelected={handleTopScan} />}
            <div className="field">
              <label htmlFor="new-entity-name">Name</label>
              <input
                id="new-entity-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
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
            {showWineDetails && (
              <div className="field">
                <label htmlFor="new-entity-volume">Volume (ml)</label>
                <input
                  id="new-entity-volume"
                  type="number"
                  min="1"
                  step="1"
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
            {showWineDetails && newCategory === 'wine' && (
              <div className="field">
                <label htmlFor="new-entity-style">Style</label>
                <select
                  id="new-entity-style"
                  value={newStyle}
                  onChange={(event) => setNewStyle(event.target.value as WineStyle | '')}
                >
                  <option value="">Not set</option>
                  {WINE_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showWineDetails && newCategory === 'wine' && (
              <div className="field">
                <label htmlFor="new-entity-country">Country</label>
                <select
                  id="new-entity-country"
                  value={newCountry}
                  onChange={(event) => setNewCountry(event.target.value as WineCountry | '')}
                >
                  <option value="">Not set</option>
                  {WINE_COUNTRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showImage && <ImagesField label="Photos" imageDataUrls={newImages} onChange={setNewImages} />}
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
        <Modal title={detailItem.name} onClose={closeDetail} size="large">
          <div className="stack">
            <div className="field">
              <label htmlFor="detail-entity-name">Name</label>
              <input
                id="detail-entity-name"
                value={detailName}
                onChange={(event) => setDetailName(event.target.value)}
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
            {showWineDetails && (
              <div className="field">
                <label htmlFor="detail-entity-volume">Volume (ml)</label>
                <input
                  id="detail-entity-volume"
                  type="number"
                  min="1"
                  step="1"
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
            {showWineDetails && detailCategory === 'wine' && (
              <div className="field">
                <label htmlFor="detail-entity-style">Style</label>
                <select
                  id="detail-entity-style"
                  value={detailStyle}
                  onChange={(event) => setDetailStyle(event.target.value as WineStyle | '')}
                >
                  <option value="">Not set</option>
                  {WINE_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showWineDetails && detailCategory === 'wine' && (
              <div className="field">
                <label htmlFor="detail-entity-country">Country</label>
                <select
                  id="detail-entity-country"
                  value={detailCountry}
                  onChange={(event) => setDetailCountry(event.target.value as WineCountry | '')}
                >
                  <option value="">Not set</option>
                  {WINE_COUNTRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showImage && <ImagesField label="Photos" imageDataUrls={detailImages} onChange={setDetailImages} />}

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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16 }}>
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
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="data-table__row--clickable" onClick={() => openDetail(item)}>
                  <td>
                    <div className="name-row">
                      <ActiveStatusDot active={item.active} />
                      <span className="row-link">{item.name}</span>
                    </div>
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
