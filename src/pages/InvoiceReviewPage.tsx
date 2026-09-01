import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { EntityPicker } from '../components/EntityPicker'
import { InvoiceStatusBadge } from '../components/StatusBadge'
import {
  useApproveInvoice,
  useConfirmSkuMatch,
  useConfirmVendorMatch,
  useInvoice,
  useSelectSkuMatch,
  useSelectVendorMatch,
} from '../hooks/useInvoices'
import { useCreateVendor, useVendors } from '../hooks/useVendors'
import { useCreateWine, useWines } from '../hooks/useWines'
import type { InvoiceLineItem } from '../types'
import { formatCurrency, formatDate } from '../utils/format'

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
  const createVendor = useCreateVendor()

  const [activePicker, setActivePicker] = useState<ActivePicker>(null)

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

      {isProcessing && <div className="notice">Extracting invoice data and matching vendor/SKUs...</div>}

      <div className="two-col">
        <div className="card">
          <h2>Original document</h2>
          {invoice.fileType === 'image' ? (
            <img src={invoice.fileDataUrl} alt={invoice.fileName} className="invoice-doc-preview" />
          ) : (
            <iframe title={invoice.fileName} src={invoice.fileDataUrl} className="invoice-doc-preview" />
          )}
        </div>

        <div className="card">
          <h2>Extracted information</h2>
          <table className="data-table data-table--compact">
            <tbody>
              <tr>
                <th>Invoice date</th>
                <td>{formatDate(invoice.extracted.invoiceDate)}</td>
              </tr>
              <tr>
                <th>Total amount</th>
                <td>{formatCurrency(invoice.extracted.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Vendor match</h2>
        {isProcessing ? (
          <p className="spinner-text">Matching vendor...</p>
        ) : (
          <div className="stack">
            <div className="match-row">
              <span className="match-row__label">
                {vendorName ?? `"${vendorMatch.vendorNameRaw}" (no match found)`}
              </span>
              {vendorMatch.status !== 'changed' && <ConfidenceBadge confidence={vendorMatch.confidence} />}
              {(vendorMatch.status === 'confirmed' || vendorMatch.status === 'changed') && (
                <span className="badge badge--confirmed">Resolved</span>
              )}
            </div>
            {activePicker === 'vendor' ? (
              <EntityPicker
                items={vendors ?? []}
                searchLabel="Search vendors"
                entityLabel="vendor"
                onCreateNew={(name) => createVendor.mutateAsync({ name })}
                onCancel={() => setActivePicker(null)}
                onSelect={(vendorId) => {
                  if (!invoiceId) return
                  selectVendorMatch.mutate({ invoiceId, vendorId }, { onSuccess: () => setActivePicker(null) })
                }}
              />
            ) : (
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
  const createWine = useCreateWine()

  return (
    <tr>
      <td>{line.itemNameRaw}</td>
      <td className="numeric">{line.quantity}</td>
      <td className="numeric">{formatCurrency(line.unitPrice)}</td>
      <td className="numeric">{formatCurrency(line.lineTotal)}</td>
      <td>
        <div className="stack">
          <div className="match-row">
            <span className="match-row__label">{wineName ?? `"${line.itemNameRaw}" (no match found)`}</span>
            {line.skuMatch.status !== 'changed' && <ConfidenceBadge confidence={line.skuMatch.confidence} />}
            {(line.skuMatch.status === 'confirmed' || line.skuMatch.status === 'changed') && (
              <span className="badge badge--confirmed">Resolved</span>
            )}
          </div>
          {isPickerOpen ? (
            <EntityPicker
              items={wines}
              searchLabel="Search wines"
              entityLabel="wine"
              onCreateNew={(name) => createWine.mutateAsync({ name })}
              onCancel={onClosePicker}
              onSelect={onSelect}
            />
          ) : (
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
          )}
        </div>
      </td>
    </tr>
  )
}
