export function formatCurrency(amount: number | null): string {
  if (amount === null) return '-'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Per-call OpenAI costs are usually well under a cent, so show enough precision to see them. */
export function formatMicroCurrency(amount: number): string {
  if (amount === 0) return '$0.00'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
