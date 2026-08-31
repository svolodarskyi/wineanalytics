import type { InvoiceStatus } from '../types'

const LABELS: Record<InvoiceStatus, string> = {
  processing: 'Processing',
  not_approved: 'Not Approved',
  approved: 'Approved',
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`badge badge--${status}`}>{LABELS[status]}</span>
}
