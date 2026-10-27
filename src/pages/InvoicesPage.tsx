import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FileDropzone } from '../components/FileDropzone'
import { useInvoices, useUploadInvoice } from '../hooks/useInvoices'
import type { InvoiceStatus } from '../types'
import { formatCurrency, formatDate } from '../utils/format'

/** Rough age of a processing invoice, e.g. "~10s" / "~2m" - just enough to tell "just started" from "this looks stuck". */
function roughAge(isoDate: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 1000))
  if (seconds < 60) return `~${seconds}s`
  return `~${Math.round(seconds / 60)}m`
}

type Tab = Extract<InvoiceStatus, 'not_approved' | 'approved'>
type QueuedFile = { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }

// Caps how many invoices upload to storage/OCR at once so a burst of shots
// (e.g. photographing a stack of invoices in a row) doesn't fan out into a
// pile of simultaneous OCR requests. The rest just wait in the local queue.
const MAX_CONCURRENT_UPLOADS = 5

export function InvoicesPage() {
  const [tab, setTab] = useState<Tab>('approved')
  const { data: invoices, isLoading, error } = useInvoices(tab)
  // Fetched regardless of the active tab so the "Not Approved" count badge
  // stays visible and up to date even while viewing Approved invoices.
  const { data: notApprovedInvoices } = useInvoices('not_approved')
  const notApprovedCount = notApprovedInvoices?.length ?? 0
  // "processing" invoices are filtered out of both the Approved and Not
  // Approved queries server-side, so without this they'd be invisible on
  // both tabs between upload and OCR finishing - fetched separately and
  // merged into whichever tab's table is showing (see below), so a
  // processing invoice appears regardless of which tab you're on. Self-
  // refreshes every second (see useInvoices) for as long as anything is
  // still processing.
  const { data: processingInvoices } = useInvoices('processing')
  const uploadInvoice = useUploadInvoice()
  const navigate = useNavigate()
  // Set by the "+ Add Invoice" shortcut (nav button / mobile banner) so it
  // lands straight in the file picker instead of requiring an extra tap.
  const location = useLocation()
  const autoOpen = Boolean((location.state as { autoUpload?: boolean } | null)?.autoUpload)

  const uploadQueueRef = useRef<QueuedFile[]>([])
  const inFlightRef = useRef(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])

  function drainUploadQueue() {
    while (inFlightRef.current < MAX_CONCURRENT_UPLOADS && uploadQueueRef.current.length > 0) {
      const next = uploadQueueRef.current.shift() as QueuedFile
      inFlightRef.current += 1
      uploadInvoice
        .mutateAsync(next)
        .catch((err) => {
          console.error(`Failed to upload invoice "${next.fileName}":`, err)
          const message = err instanceof Error ? err.message : 'Upload failed.'
          setUploadErrors((prev) => [...prev, `${next.fileName} (${message})`])
        })
        .finally(() => {
          inFlightRef.current -= 1
          setPendingCount((count) => count - 1)
          drainUploadQueue()
        })
    }
  }

  // Queues the file and returns immediately - upload/OCR happens in the
  // background so the user can keep snapping pictures without waiting.
  function handleFileSelected(file: QueuedFile) {
    uploadQueueRef.current.push(file)
    setPendingCount((count) => count + 1)
    // Uploads always land under Not Approved (never Approved) - switch there
    // so the user can actually see the invoice they just uploaded, instead
    // of staying on whichever tab they happened to be on.
    setTab('not_approved')
    drainUploadQueue()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="page-header__meta">Upload an invoice to start OCR, matching, and approval.</p>
        </div>
        <FileDropzone onFileSelected={handleFileSelected} autoOpen={autoOpen} />
      </div>

      {pendingCount > 0 && (
        <p className="notice">
          Uploading {pendingCount} invoice{pendingCount === 1 ? '' : 's'}...
        </p>
      )}

      {uploadErrors.length > 0 && (
        <p className="notice notice--error">
          Failed to upload: {uploadErrors.join(', ')}
        </p>
      )}

      <div className="tabs">
        <button type="button" className={`tab${tab === 'approved' ? ' active' : ''}`} onClick={() => setTab('approved')}>
          Approved
        </button>
        <button type="button" className={`tab${tab === 'not_approved' ? ' active' : ''}`} onClick={() => setTab('not_approved')}>
          Not Approved
          {notApprovedCount > 0 && <span className="tab-count-badge">{notApprovedCount}</span>}
        </button>
      </div>

      {error && <p className="notice notice--error">Could not load invoices.</p>}

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && !invoices?.length && !processingInvoices?.length && (
          <p className="empty-state">No invoices here yet.</p>
        )}
        {(!!invoices?.length || !!processingInvoices?.length) && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Date</th>
                <th className="numeric">Total</th>
              </tr>
            </thead>
            <tbody>
              {/* Still being extracted/matched - not yet "approved" or "not_approved", so shown on both tabs
                  until it resolves into one, rather than being invisible until it does. */}
              {processingInvoices?.map((invoice) => (
                <tr key={invoice.id} className="data-table__row--clickable" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                  <td className="truncate-line" title={invoice.fileName}>
                    <Link className="row-link" to={`/invoices/${invoice.id}`} onClick={(e) => e.stopPropagation()}>
                      {invoice.fileName}
                    </Link>
                    <span className="spinner-text"> - Processing...</span>
                  </td>
                  <td>{roughAge(invoice.uploadedAt)} ago</td>
                  <td className="numeric">—</td>
                </tr>
              ))}
              {invoices?.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="data-table__row--clickable"
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <td>
                    <Link className="row-link" to={`/invoices/${invoice.id}`} onClick={(e) => e.stopPropagation()}>
                      {invoice.extracted.vendorMatch.vendorNameRaw}
                    </Link>
                  </td>
                  <td>{formatDate(invoice.extracted.invoiceDate)}</td>
                  <td className="numeric">{formatCurrency(invoice.extracted.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
