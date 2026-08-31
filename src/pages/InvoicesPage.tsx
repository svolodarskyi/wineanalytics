import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileDropzone } from '../components/FileDropzone'
import { useInvoices, useUploadInvoice } from '../hooks/useInvoices'
import type { InvoiceSortBy } from '../services'
import type { InvoiceStatus } from '../types'
import { formatCurrency, formatDate } from '../utils/format'

type Tab = Extract<InvoiceStatus, 'not_approved' | 'approved'>

export function InvoicesPage() {
  const [tab, setTab] = useState<Tab>('approved')
  const [sortBy, setSortBy] = useState<InvoiceSortBy>('date')
  const { data: invoices, isLoading, error } = useInvoices(tab, sortBy)
  // Fetched regardless of the active tab so the "Not Approved" count badge
  // stays visible and up to date even while viewing Approved invoices.
  const { data: notApprovedInvoices } = useInvoices('not_approved')
  const notApprovedCount = notApprovedInvoices?.length ?? 0
  const uploadInvoice = useUploadInvoice()
  const navigate = useNavigate()

  async function handleFileSelected(file: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }) {
    const invoice = await uploadInvoice.mutateAsync(file)
    navigate(`/invoices/${invoice.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="page-header__meta">Upload an invoice to start OCR, matching, and approval.</p>
        </div>
        <FileDropzone onFileSelected={handleFileSelected} disabled={uploadInvoice.isPending} />
      </div>

      {uploadInvoice.error && (
        <p className="notice notice--error">
          {uploadInvoice.error instanceof Error ? uploadInvoice.error.message : 'Upload failed.'}
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

      <div className="inline-form">
        <select aria-label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as InvoiceSortBy)}>
          <option value="date">Sort by date</option>
          <option value="vendor">Sort by vendor</option>
        </select>
      </div>

      {error && <p className="notice notice--error">Could not load invoices.</p>}

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && invoices?.length === 0 && <p className="empty-state">No invoices here yet.</p>}
        {!!invoices?.length && (
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Date</th>
                <th className="numeric">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
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
