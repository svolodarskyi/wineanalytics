import type { InvoiceStatus } from '../types'
import type { ListOptions } from '../services'

export const queryKeys = {
  wines: (options?: ListOptions) => ['wines', options ?? {}] as const,
  wine: (id: string) => ['wines', id] as const,
  wineBalances: () => ['wines', 'balances'] as const,
  winePurchaseHistory: (id: string) => ['wines', id, 'purchase-history'] as const,

  vendors: (options?: ListOptions) => ['vendors', options ?? {}] as const,
  vendor: (id: string) => ['vendors', id] as const,

  invoices: (status?: InvoiceStatus | 'all') => ['invoices', status ?? 'all'] as const,
  invoice: (id: string) => ['invoices', id] as const,
}
