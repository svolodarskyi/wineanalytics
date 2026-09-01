import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { EntityPicker } from '../components/EntityPicker'
import { Modal } from '../components/Modal'
import { InvoiceStatusBadge } from '../components/StatusBadge'
import {
  useApproveInvoice,
  useConfirmSkuMatch,
  useConfirmVendorMatch,
  useDiscardInvoice,
  useInvoice,
  useSelectSkuMatch,
  useSelectVendorMatch,
  useUpdateInvoiceDate,
} from '../hooks/useInvoices'
import { useCreateVendor, useVendors } from '../hooks/useVendors'
import { useCreateWine, useWines } from '../hooks/useWines'
import type { InvoiceLineItem, WineCategory } from '../types'
import { formatCurrency, formatDate, formatVolumeMl } from '../utils/format'
import { VOLUME_ML_PRESETS, WINE_CATEGORY_OPTIONS } from '../utils/wineFormOptions'

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

  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [isDocOpen, setIsDocOpen] = useState(false)
  const [isImageZoomed, setIsImageZoomed] = useState(false)
  const [isEditingDate, setIsEditingDate] = useState(false)
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
  const allLinesResolved = invoice.lineItems.every((line) => line.skuMatch.wineId)
  const canApprove = !isProcessing && !isApproved && Boolean(vendorMatch.vendorId) && allLinesResolved

  function handleDiscard() {
    if (!invoiceId) return
    if (!window.confirm(`Discard "${invoice!.fileName}"? This cannot be undone.`)) return
    discardInvoice.mutate(invoiceId, { onSuccess: () => navigate('/invoices') })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-header__meta">
            <Link to="/invoices">Invoices</Link> / {invoice.fileName}
          </p>
          <h1>{invoice.fileName}</h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        {!isApproved && (
          <div className="picker">
            <button
              type="button"
              className="btn btn--danger"
              disabled={discardInvoice.isPending}
              onClick={handleDiscard}
            >
              {discardInvoice.isPending ? 'Discarding...' : 'Discard'}
            </button>
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
          </div>
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

      <div className="two-col">
        <div className="card">
          <h2>Original document</h2>
          <div className="invoice-doc-preview-wrap">
            {invoice.fileType === 'image' ? (
              <img src={invoice.fileDataUrl} alt={invoice.fileName} className="invoice-doc-preview" />
            ) : (
              <iframe title={invoice.fileName} src={invoice.fileDataUrl} className="invoice-doc-preview" />
            )}
            <button
              type="button"
              className="invoice-doc-preview-overlay"
              onClick={() => setIsDocOpen(true)}
              aria-label="Zoom original document"
            >
              Click to zoom
            </button>
          </div>
        </div>

        {isDocOpen && (
          <Modal
            title={invoice.fileName}
            size="large"
            onClose={() => {
              setIsDocOpen(false)
              setIsImageZoomed(false)
            }}
          >
            {invoice.fileType === 'image' ? (
              <div className="doc-zoom">
                <img
                  src={invoice.fileDataUrl}
                  alt={invoice.fileName}
                  className={isImageZoomed ? 'doc-zoom__img doc-zoom__img--zoomed' : 'doc-zoom__img'}
                  onClick={() => setIsImageZoomed((z) => !z)}
                />
              </div>
            ) : (
              <iframe title={invoice.fileName} src={invoice.fileDataUrl} className="doc-modal-frame" />
            )}
          </Modal>
        )}

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
                        autoFocus
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
        {isProcessing ? (
          <p className="spinner-text">Matching wine SKUs...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Volume</th>
                <th className="numeric">Qty</th>
                <th className="numeric">Unit Price</th>
                <th className="numeric">Line Total</th>
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
                />
              ))}
            </tbody>
          </table>
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
}) {
  return (
    <tr>
      <td>{line.itemNameRaw}</td>
      <td>{formatVolumeMl(line.volumeMlRaw)}</td>
      <td className="numeric">{line.quantity}</td>
      <td className="numeric">{formatCurrency(line.unitPrice)}</td>
      <td className="numeric">{formatCurrency(line.lineTotal)}</td>
      <td>
        <div className="stack">
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
            <button type="button" className="btn btn--small" onClick={onOpenPicker}>
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
 * Shown in place of EntityPicker's one-click create button when adding a
 * wine SKU that doesn't exist yet. Volume and category are often
 * OCR-extracted straight from the invoice, so a prefilled value must be
 * explicitly approved (or cleared) before the wine can be created rather
 * than silently accepted - OCR can misread either one. Country is never
 * extracted here and is always optional. Anything left blank shows up
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
  const [country, setCountry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const volumeNeedsApproval = volumeInput.trim() !== '' && !volumeApproved
  const categoryNeedsApproval = category !== '' && !categoryApproved
  const needsApproval = volumeNeedsApproval || categoryNeedsApproval

  async function handleCreate() {
    setError(null)
    setIsCreating(true)
    try {
      const wine = await createWine.mutateAsync({
        name,
        invoiceName: name,
        volumeMl: volumeInput.trim() ? Number(volumeInput) : null,
        category: category || null,
        country: country.trim() || null,
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

      <datalist id="new-wine-volume-presets">
        {VOLUME_ML_PRESETS.map((ml) => (
          <option key={ml} value={ml} />
        ))}
      </datalist>

      <div className="field">
        <label htmlFor="new-wine-volume">Volume (ml)</label>
        <div className="picker">
          <input
            id="new-wine-volume"
            type="number"
            min="1"
            step="1"
            list="new-wine-volume-presets"
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

      <div className="field">
        <label htmlFor="new-wine-country">Country</label>
        <input
          id="new-wine-country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          placeholder="Fill out later"
        />
      </div>

      <p className="page-header__meta">Country can be filled out later - missing fields show up under Alerts &gt; Data Quality.</p>

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
