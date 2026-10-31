import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { EntityPicker } from '../components/EntityPicker'
import { Modal } from '../components/Modal'
import { InvoiceStatusBadge } from '../components/StatusBadge'
import { ZoomableImage } from '../components/ZoomableImage'
import {
  useApproveInvoice,
  useConfirmSkuMatch,
  useConfirmVendorMatch,
  useDiscardInvoice,
  useInvoice,
  useSelectSkuMatch,
  useSelectVendorMatch,
  useSetLineItemExcluded,
  useUpdateInvoiceDate,
  useUpdateLineItem,
} from '../hooks/useInvoices'
import { useCreateVendor, useVendors } from '../hooks/useVendors'
import { useCreateWine, useWines } from '../hooks/useWines'
import type { InvoiceLineItem, WineCategory, WineCountry, WineStyle } from '../types'
import { formatCurrency, formatDate } from '../utils/format'
import { WINE_CATEGORY_OPTIONS, WINE_COUNTRY_OPTIONS, WINE_STYLE_OPTIONS } from '../utils/wineFormOptions'

type ActivePicker = 'vendor' | { lineItemId: string } | null

export function InvoiceReviewPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const navigate = useNavigate()
  const { data: invoice, isLoading } = useInvoice(invoiceId)
  const { data: vendors } = useVendors({ includeInactive: true })
  const { data: wines } = useWines({ includeInactive: true })

  const confirmVendorMatch = useConfirmVendorMatch()
  const selectVendorMatch = useSelectVendorMatch()
  const confirmSkuMatch = useConfirmSkuMatch()
  const selectSkuMatch = useSelectSkuMatch()
  const approveInvoice = useApproveInvoice()
  const discardInvoice = useDiscardInvoice()
  const createVendor = useCreateVendor()
  const updateInvoiceDate = useUpdateInvoiceDate()
  const updateLineItem = useUpdateLineItem()
  const setLineItemExcluded = useSetLineItemExcluded()

  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [isEditingDate, setIsEditingDate] = useState(false)
  const [isDocModalOpen, setIsDocModalOpen] = useState(false)
  const [dateDraft, setDateDraft] = useState('')

  const vendorName = useMemo(() => {
    const id = invoice?.extracted.vendorMatch.vendorId
    return id ? (vendors?.find((v) => v.id === id)?.name ?? 'Unknown vendor') : null
  }, [invoice, vendors])

  const wineNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const wine of wines ?? []) map.set(wine.id, wine.name)
    return map
  }, [wines])

  if (isLoading) return <p className="spinner-text">Loading...</p>
  if (!invoice) return <p className="empty-state">Invoice not found.</p>

  const vendorMatch = invoice.extracted.vendorMatch
  const isProcessing = invoice.status === 'processing'
  const isApproved = invoice.status === 'approved'
  const allLinesResolved = invoice.lineItems.every((line) => line.excluded || line.skuMatch.wineId)
  const canApprove = !isProcessing && !isApproved && Boolean(vendorMatch.vendorId) && allLinesResolved

  function handleDiscard() {
    if (!invoiceId) return
    if (!window.confirm(`Discard "${invoice!.fileName}"? This cannot be undone.`)) return
    discardInvoice.mutate(invoiceId, { onSuccess: () => navigate('/invoices') })
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header__title-group">
          <p className="page-header__meta truncate-line">
            <Link to="/invoices">Invoices</Link> / {invoice.fileName}
          </p>
          <h1 className="truncate-line" title={invoice.fileName}>
            {invoice.fileName}
          </h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
      </div>

      {/* Its own sticky bar (not a sticky child inside .page-header's flex row,
          which mixes badly with a non-sticky sibling of different height) - so
          Discard/Approve stay reachable without scrolling back up after making
          a change, and re-approving (see revertApprovalIfEditing) is a click away. */}
      <div className="invoice-actions-bar">
        <button
          type="button"
          className="btn btn--danger"
          disabled={discardInvoice.isPending}
          onClick={handleDiscard}
        >
          {discardInvoice.isPending ? 'Discarding...' : 'Discard'}
        </button>
        {!isApproved && (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canApprove || approveInvoice.isPending}
            onClick={() =>
              invoiceId &&
              approveInvoice.mutate(invoiceId, {
                onSuccess: () => navigate('/invoices'),
              })
            }
            title={!canApprove ? 'Resolve the vendor and every wine SKU match before approving.' : undefined}
          >
            {approveInvoice.isPending ? 'Approving...' : 'Approve'}
          </button>
        )}
      </div>

      {approveInvoice.error && (
        <p className="notice notice--error">
          {approveInvoice.error instanceof Error ? approveInvoice.error.message : 'Could not approve invoice.'}
        </p>
      )}

      {discardInvoice.error && (
        <p className="notice notice--error">
          {discardInvoice.error instanceof Error ? discardInvoice.error.message : 'Could not discard invoice.'}
        </p>
      )}

      {isProcessing && <div className="notice">Extracting invoice data and matching vendor/SKUs...</div>}

      <div className="review-layout">
        <div className="review-layout__content">
          <div className="card">
            <h2>Extracted information</h2>
            <table className="data-table data-table--compact">
              <tbody>
                <tr>
                  <th>Invoice date</th>
                  <td>
                    {isEditingDate ? (
                      <div className="picker">
                        <input
                          type="date"
                          className="search-input"
                          value={dateDraft}
                          onChange={(event) => setDateDraft(event.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn--small btn--primary"
                          disabled={updateInvoiceDate.isPending}
                          onClick={() =>
                            invoiceId &&
                            updateInvoiceDate.mutate(
                              { invoiceId, invoiceDate: dateDraft || null },
                              { onSuccess: () => setIsEditingDate(false) },
                            )
                          }
                        >
                          {updateInvoiceDate.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" className="btn btn--small" onClick={() => setIsEditingDate(false)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="picker">
                        <span>{formatDate(invoice.extracted.invoiceDate)}</span>
                        <button
                          type="button"
                          className="btn btn--small"
                          onClick={() => {
                            setDateDraft(invoice.extracted.invoiceDate?.slice(0, 10) ?? '')
                            setIsEditingDate(true)
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                <tr>
                  <th>Total amount</th>
                  <td>{formatCurrency(invoice.extracted.totalAmount)}</td>
                </tr>
              </tbody>
            </table>

            {!!invoice.extracted.additionalCharges.length && (
              <>
                <h3>Additional items</h3>
                <table className="data-table data-table--compact">
                  <tbody>
                    {invoice.extracted.additionalCharges.map((charge, index) => (
                      <tr key={index}>
                        <th>{charge.description}</th>
                        <td>{formatCurrency(charge.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="card">
            <h2>Vendor match</h2>
            {isProcessing ? (
              <p className="spinner-text">Matching vendor...</p>
            ) : (
              <div className="stack">
                <div className="match-row">
                  <span className="match-row__label">{vendorName ?? 'No match found'}</span>
                  {vendorMatch.vendorNameRaw && (
                    <p className="match-row__raw">Extracted from invoice: "{vendorMatch.vendorNameRaw}"</p>
                  )}
                  <div className="match-row__badges">
                    {vendorMatch.status !== 'changed' && <ConfidenceBadge confidence={vendorMatch.confidence} />}
                    {(vendorMatch.status === 'confirmed' || vendorMatch.status === 'changed') && (
                      <span className="badge badge--confirmed">Resolved</span>
                    )}
                  </div>
                </div>
                <div className="picker">
                  {vendorMatch.status === 'suggested' && (
                    <button
                      type="button"
                      className="btn btn--small btn--primary"
                      disabled={confirmVendorMatch.isPending}
                      onClick={() => invoiceId && confirmVendorMatch.mutate(invoiceId)}
                    >
                      Confirm
                    </button>
                  )}
                  <button type="button" className="btn btn--small" onClick={() => setActivePicker('vendor')}>
                    {vendorMatch.vendorId ? 'Change' : 'Select vendor'}
                  </button>
                </div>
                {activePicker === 'vendor' && (
                  <Modal title="Select vendor" onClose={() => setActivePicker(null)}>
                    <EntityPicker
                      items={vendors ?? []}
                      searchLabel="Search vendors"
                      entityLabel="vendor"
                      initialQuery={vendorMatch.vendorNameRaw}
                      onCreateNew={(name) => createVendor.mutateAsync({ name, invoiceName: name })}
                      onSelect={(vendorId) => {
                        if (!invoiceId) return
                        selectVendorMatch.mutate({ invoiceId, vendorId }, { onSuccess: () => setActivePicker(null) })
                      }}
                    />
                  </Modal>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Wine line items</h2>
            {updateLineItem.error && (
              <p className="notice notice--error">
                {updateLineItem.error instanceof Error ? updateLineItem.error.message : 'Could not save that change.'}
              </p>
            )}
            {isProcessing ? (
              <p className="spinner-text">Matching wine SKUs...</p>
            ) : (
              <table className="data-table line-items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Pricing</th>
                    <th>SKU match</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((line) => (
                    <LineItemRow
                      key={line.id}
                      invoiceId={invoiceId as string}
                      line={line}
                      wineName={line.skuMatch.wineId ? wineNameById.get(line.skuMatch.wineId) : undefined}
                      wines={wines ?? []}
                      isPickerOpen={typeof activePicker === 'object' && activePicker?.lineItemId === line.id}
                      onOpenPicker={() => setActivePicker({ lineItemId: line.id })}
                      onClosePicker={() => setActivePicker(null)}
                      onConfirm={() => confirmSkuMatch.mutate({ invoiceId: invoiceId as string, lineItemId: line.id })}
                      onSelect={(wineId) =>
                        selectSkuMatch.mutate(
                          { invoiceId: invoiceId as string, lineItemId: line.id, wineId },
                          { onSuccess: () => setActivePicker(null) },
                        )
                      }
                      isConfirmPending={confirmSkuMatch.isPending}
                      onSaveLineItem={(fields) =>
                        updateLineItem.mutate({ invoiceId: invoiceId as string, lineItemId: line.id, ...fields })
                      }
                      isSavingLineItem={updateLineItem.isPending && updateLineItem.variables?.lineItemId === line.id}
                      // Approving accepts everything as-is, not "locks it in" - if you
                      // mis-click Approve or need to fix a mistake afterward, every field
                      // (matches, quantity/price/volume/pack size, invoice date) stays editable.
                      isEditingDisabled={false}
                      onToggleExcluded={(excluded) =>
                        setLineItemExcluded.mutate({ invoiceId: invoiceId as string, lineItemId: line.id, excluded })
                      }
                      isTogglingExcluded={setLineItemExcluded.isPending && setLineItemExcluded.variables?.lineItemId === line.id}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="review-layout__image">
          <div className="card">
            <h2>Original document</h2>
            <div className="invoice-doc-preview-wrap">
              <button
                type="button"
                className="invoice-doc-expand-btn"
                onClick={() => setIsDocModalOpen(true)}
                aria-label="Open original document in a larger view"
              >
                ⤢
              </button>
              {invoice.fileType === 'image' ? (
                <img src={invoice.fileDataUrl} alt={invoice.fileName} className="invoice-doc-preview" />
              ) : (
                <iframe title={invoice.fileName} src={invoice.fileDataUrl} className="invoice-doc-preview" />
              )}
            </div>
          </div>
        </div>

        {isDocModalOpen && (
          <Modal title={invoice.fileName} size="large" onClose={() => setIsDocModalOpen(false)}>
            {invoice.fileType === 'image' ? (
              <ZoomableImage src={invoice.fileDataUrl} alt={invoice.fileName} className="invoice-doc-modal-img" />
            ) : (
              <iframe title={invoice.fileName} src={invoice.fileDataUrl} className="invoice-doc-modal-frame" />
            )}
          </Modal>
        )}
      </div>
    </div>
  )
}

function LineItemRow({
  line,
  wineName,
  wines,
  isPickerOpen,
  onOpenPicker,
  onClosePicker,
  onConfirm,
  onSelect,
  isConfirmPending,
  onSaveLineItem,
  isSavingLineItem,
  isEditingDisabled,
  onToggleExcluded,
  isTogglingExcluded,
}: {
  invoiceId: string
  line: InvoiceLineItem
  wineName: string | undefined
  wines: { id: string; name: string }[]
  isPickerOpen: boolean
  onOpenPicker: () => void
  onClosePicker: () => void
  onConfirm: () => void
  onSelect: (wineId: string) => void
  isConfirmPending: boolean
  onSaveLineItem: (fields: { volumeMl: number | null; quantity: number; unitPrice: number; packSize: number }) => void
  isSavingLineItem: boolean
  isEditingDisabled: boolean
  onToggleExcluded: (excluded: boolean) => void
  isTogglingExcluded: boolean
}) {
  return (
    <tr className={line.excluded ? 'line-items-table__row--excluded' : undefined}>
      <td>{line.itemNameRaw}</td>
      <td>
        <LineItemEditForm line={line} disabled={isEditingDisabled} isSaving={isSavingLineItem} onSave={onSaveLineItem} />
      </td>
      <td>
        <div className="stack">
          <label className="picker checkbox-field">
            <input
              type="checkbox"
              checked={line.excluded}
              disabled={isTogglingExcluded || isEditingDisabled}
              onChange={(event) => onToggleExcluded(event.target.checked)}
            />
            Don't post to inventory
          </label>
          <div className="match-row">
            <span className="match-row__label">{wineName ?? 'No match found'}</span>
            <div className="match-row__badges">
              {line.skuMatch.status !== 'changed' && <ConfidenceBadge confidence={line.skuMatch.confidence} />}
              {(line.skuMatch.status === 'confirmed' || line.skuMatch.status === 'changed') && (
                <span className="badge badge--confirmed">Resolved</span>
              )}
            </div>
          </div>
          <div className="picker">
            {line.skuMatch.status === 'suggested' && (
              <button type="button" className="btn btn--small btn--primary" disabled={isConfirmPending} onClick={onConfirm}>
                Confirm
              </button>
            )}
            <button type="button" className="btn btn--small" disabled={isEditingDisabled} onClick={onOpenPicker}>
              {line.skuMatch.wineId ? 'Change' : 'Select wine'}
            </button>
          </div>
          {isPickerOpen && (
            <Modal title="Select wine" onClose={onClosePicker}>
              <EntityPicker
                items={wines}
                searchLabel="Search wines"
                entityLabel="wine"
                initialQuery={line.itemNameRaw}
                renderCreateReview={(name, cancel) => (
                  <NewWineReviewFields name={name} line={line} cancel={cancel} onCreated={onSelect} />
                )}
                onSelect={onSelect}
              />
            </Modal>
          )}
        </div>
      </td>
    </tr>
  )
}

/**
 * Native <input type="number"> spinner arrows aren't shown on mobile
 * browsers at all (and are inconsistent even on desktop), so +/- buttons
 * are the only reliable way to nudge a value by one step on a phone.
 */
function NumberStepper({
  id,
  label,
  value,
  onChange,
  onKeyDown,
  min,
  step,
  placeholder,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  min: number
  step: number
  placeholder?: string
  disabled: boolean
}) {
  function bump(delta: number) {
    const current = Number(value)
    const base = Number.isFinite(current) ? current : min
    const next = Math.max(min, Math.round((base + delta) * 100) / 100)
    onChange(String(next))
  }

  return (
    <div className="number-stepper">
      <button type="button" className="number-stepper__btn" disabled={disabled} aria-label={`Decrease ${label}`} onClick={() => bump(-step)}>
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        className="table-input"
        min={min}
        step={step}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="number-stepper__btn" disabled={disabled} aria-label={`Increase ${label}`} onClick={() => bump(step)}>
        +
      </button>
    </div>
  )
}

/**
 * Volume, Qty, and Unit Price are editable, stacked vertically; Line Total is
 * never typed directly - it's always quantity * unitPrice, recomputed live
 * as any input changes so the user sees the result before it's even saved.
 * Nothing persists until Save is pressed (or Enter, from any field) - no
 * more per-field autosave-on-blur, so a multi-field correction is one write
 * instead of several. Save stays disabled until something actually changed
 * and every field is a valid value.
 */
function LineItemEditForm({
  line,
  disabled,
  isSaving,
  onSave,
}: {
  line: InvoiceLineItem
  disabled: boolean
  isSaving: boolean
  onSave: (fields: { volumeMl: number | null; quantity: number; unitPrice: number; packSize: number }) => void
}) {
  const [volumeInput, setVolumeInput] = useState(line.volumeMlRaw != null ? String(line.volumeMlRaw) : '')
  const [quantityInput, setQuantityInput] = useState(String(line.quantity))
  const [packSizeInput, setPackSizeInput] = useState(String(line.packSize))
  const [unitPriceInput, setUnitPriceInput] = useState(String(line.unitPrice))

  const quantity = Number(quantityInput)
  const packSize = Number(packSizeInput)
  const unitPrice = Number(unitPriceInput)
  const volumeMl = volumeInput.trim() === '' ? null : Number(volumeInput)

  const isValid =
    quantityInput.trim() !== '' &&
    // Negative is valid - a vendor return/credit shows up as a negative
    // quantity line (same unit price, so lineTotal comes out negative too).
    Number.isFinite(quantity) &&
    packSizeInput.trim() !== '' &&
    Number.isInteger(packSize) &&
    packSize >= 1 &&
    unitPriceInput.trim() !== '' &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0 &&
    (volumeMl === null || (Number.isFinite(volumeMl) && volumeMl > 0))

  const liveLineTotal = isValid ? quantity * unitPrice : line.lineTotal
  const totalUnits = isValid ? quantity * packSize : line.quantity * line.packSize
  const savedVolumeInput = line.volumeMlRaw != null ? String(line.volumeMlRaw) : ''
  const isDirty =
    volumeInput !== savedVolumeInput ||
    quantityInput !== String(line.quantity) ||
    packSizeInput !== String(line.packSize) ||
    unitPriceInput !== String(line.unitPrice)
  const hasChanges = isValid && isDirty

  function handleSave() {
    if (!hasChanges || disabled || isSaving) return
    onSave({ volumeMl, quantity, unitPrice, packSize })
  }

  function handleReset() {
    setVolumeInput(savedVolumeInput)
    setQuantityInput(String(line.quantity))
    setPackSizeInput(String(line.packSize))
    setUnitPriceInput(String(line.unitPrice))
  }

  function saveOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') handleSave()
  }

  const idPrefix = `line-item-${line.id}`

  return (
    <div className="line-item-edit">
      <div className="line-item-edit__field">
        <label htmlFor={`${idPrefix}-volume`}>Volume (ml)</label>
        <NumberStepper
          id={`${idPrefix}-volume`}
          label={`volume for ${line.itemNameRaw}`}
          value={volumeInput}
          onChange={setVolumeInput}
          onKeyDown={saveOnEnter}
          min={1}
          step={1}
          placeholder="Not set"
          disabled={disabled || isSaving}
        />
      </div>
      <div className="line-item-edit__field">
        <label htmlFor={`${idPrefix}-qty`}>Qty</label>
        <NumberStepper
          id={`${idPrefix}-qty`}
          label={`quantity for ${line.itemNameRaw}`}
          value={quantityInput}
          onChange={setQuantityInput}
          onKeyDown={saveOnEnter}
          min={-999}
          step={1}
          disabled={disabled || isSaving}
        />
      </div>
      <div className="line-item-edit__field">
        <label htmlFor={`${idPrefix}-pack`}>Pack size</label>
        <NumberStepper
          id={`${idPrefix}-pack`}
          label={`units per pack for ${line.itemNameRaw}`}
          value={packSizeInput}
          onChange={setPackSizeInput}
          onKeyDown={saveOnEnter}
          min={1}
          step={1}
          disabled={disabled || isSaving}
        />
      </div>
      <div className="line-item-edit__field">
        <label htmlFor={`${idPrefix}-price`}>Unit Price</label>
        <NumberStepper
          id={`${idPrefix}-price`}
          label={`unit price for ${line.itemNameRaw}`}
          value={unitPriceInput}
          onChange={setUnitPriceInput}
          onKeyDown={saveOnEnter}
          min={0}
          step={0.01}
          disabled={disabled || isSaving}
        />
      </div>
      {isValid && packSize > 1 && (
        <p className="match-row__raw">
          {quantity} × {packSize}-pack = {totalUnits} unit{totalUnits === 1 ? '' : 's'}, ≈{formatCurrency(unitPrice / packSize)} each
        </p>
      )}
      <div className="line-item-edit__total">
        <span>Line Total</span>
        <strong>{formatCurrency(liveLineTotal)}</strong>
      </div>
      <div className="picker">
        <button type="button" className="btn btn--small btn--primary" disabled={disabled || isSaving || !hasChanges} onClick={handleSave}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn btn--small" disabled={disabled || isSaving || !isDirty} onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  )
}

/**
 * Shown in place of EntityPicker's one-click create button when adding a
 * wine SKU that doesn't exist yet. Volume and category are often
 * OCR-extracted straight from the invoice, so a prefilled value must be
 * explicitly approved (or cleared) before the wine can be created rather
 * than silently accepted - OCR can misread either one. Style and country
 * follow the same pattern but only show up once category is "wine" - they're
 * meaningless for beer/hard liquor/sake/other. Anything left blank shows up
 * under Alerts > Data Quality.
 */
function NewWineReviewFields({
  name,
  line,
  onCreated,
  cancel,
}: {
  name: string
  line: InvoiceLineItem
  onCreated: (wineId: string) => void
  cancel: () => void
}) {
  const createWine = useCreateWine()
  const [volumeInput, setVolumeInput] = useState(line.volumeMlRaw != null ? String(line.volumeMlRaw) : '')
  const [volumeApproved, setVolumeApproved] = useState(line.volumeMlRaw == null)
  const [category, setCategory] = useState<WineCategory | ''>(line.categoryRaw ?? '')
  const [categoryApproved, setCategoryApproved] = useState(line.categoryRaw == null)
  const [style, setStyle] = useState<WineStyle | ''>(line.styleRaw ?? '')
  const [styleApproved, setStyleApproved] = useState(line.styleRaw == null)
  const [country, setCountry] = useState<WineCountry | ''>(line.countryRaw ?? '')
  const [countryApproved, setCountryApproved] = useState(line.countryRaw == null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const volumeNeedsApproval = volumeInput.trim() !== '' && !volumeApproved
  const categoryNeedsApproval = category !== '' && !categoryApproved
  const styleNeedsApproval = category === 'wine' && style !== '' && !styleApproved
  const countryNeedsApproval = category === 'wine' && country !== '' && !countryApproved
  const needsApproval = volumeNeedsApproval || categoryNeedsApproval || styleNeedsApproval || countryNeedsApproval

  async function handleCreate() {
    setError(null)
    setIsCreating(true)
    try {
      const wine = await createWine.mutateAsync({
        name,
        invoiceName: name,
        volumeMl: volumeInput.trim() ? Number(volumeInput) : null,
        category: category || null,
        style: category === 'wine' ? style || null : null,
        country: category === 'wine' ? country || null : null,
      })
      onCreated(wine.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the wine.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="stack">
      <p className="page-header__meta">New wine: {name}</p>

      <div className="field">
        <label htmlFor="new-wine-volume">Volume (ml)</label>
        <div className="picker">
          <input
            id="new-wine-volume"
            type="number"
            min="1"
            step="1"
            value={volumeInput}
            onChange={(event) => {
              setVolumeInput(event.target.value)
              setVolumeApproved(false)
            }}
            placeholder="Fill out later"
          />
          {volumeNeedsApproval && (
            <button type="button" className="btn btn--small btn--primary" onClick={() => setVolumeApproved(true)}>
              Approve
            </button>
          )}
          {volumeInput.trim() !== '' && volumeApproved && <span className="badge badge--confirmed">Approved</span>}
        </div>
        {line.volumeMlRaw != null && <p className="match-row__raw">Extracted from invoice - review before saving.</p>}
      </div>

      <div className="field">
        <label htmlFor="new-wine-category">Category</label>
        <div className="picker">
          <select
            id="new-wine-category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as WineCategory | '')
              setCategoryApproved(false)
            }}
          >
            <option value="">Not set - fill out later</option>
            {WINE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {categoryNeedsApproval && (
            <button type="button" className="btn btn--small btn--primary" onClick={() => setCategoryApproved(true)}>
              Approve
            </button>
          )}
          {category !== '' && categoryApproved && <span className="badge badge--confirmed">Approved</span>}
        </div>
        {line.categoryRaw != null && <p className="match-row__raw">Extracted from invoice - review before saving.</p>}
      </div>

      {category === 'wine' && (
        <div className="field">
          <label htmlFor="new-wine-style">Style</label>
          <div className="picker">
            <select
              id="new-wine-style"
              value={style}
              onChange={(event) => {
                setStyle(event.target.value as WineStyle | '')
                setStyleApproved(false)
              }}
            >
              <option value="">Not set - fill out later</option>
              {WINE_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {styleNeedsApproval && (
              <button type="button" className="btn btn--small btn--primary" onClick={() => setStyleApproved(true)}>
                Approve
              </button>
            )}
            {style !== '' && styleApproved && <span className="badge badge--confirmed">Approved</span>}
          </div>
          {line.styleRaw != null && <p className="match-row__raw">Extracted from invoice - review before saving.</p>}
        </div>
      )}

      {category === 'wine' && (
        <div className="field">
          <label htmlFor="new-wine-country">Country</label>
          <div className="picker">
            <select
              id="new-wine-country"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value as WineCountry | '')
                setCountryApproved(false)
              }}
            >
              <option value="">Not set - fill out later</option>
              {WINE_COUNTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {countryNeedsApproval && (
              <button type="button" className="btn btn--small btn--primary" onClick={() => setCountryApproved(true)}>
                Approve
              </button>
            )}
            {country !== '' && countryApproved && <span className="badge badge--confirmed">Approved</span>}
          </div>
          {line.countryRaw != null && <p className="match-row__raw">Extracted from invoice - review before saving.</p>}
        </div>
      )}

      <p className="page-header__meta">Missing fields show up under Alerts &gt; Data Quality.</p>

      {error && <p className="notice notice--error">{error}</p>}

      <div className="picker" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={cancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" disabled={isCreating || needsApproval} onClick={handleCreate}>
          {isCreating ? 'Creating...' : 'Create wine'}
        </button>
      </div>
    </div>
  )
}
