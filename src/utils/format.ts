export function formatCurrency(amount: number | null): string {
  if (amount === null) return '-'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
