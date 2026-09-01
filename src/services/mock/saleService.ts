import type { WineSale } from '../../types'
import type { SaleService } from '../types'
import { delay } from './delay'
import { createId } from './ids'
import type { MockStore } from './store'

interface SaleInput {
  soldAt: string
  pourSizeId?: string | null
  volumeMl?: number
  quantity?: number
  amount?: number | null
}

interface ResolvedSaleFields {
  pourSizeId: string | null
  volumeMl: number
  quantity: number
  amount: number | null
}

/** Shared by create and update: resolves pourSizeId-or-volumeMl to a canonical ml, and validates quantity/amount. */
function resolveSaleFields(store: MockStore, input: SaleInput): ResolvedSaleFields {
  const quantity = input.quantity ?? 1
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error('Quantity must be a positive whole number.')
  }

  const amount = input.amount ?? null
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('Amount must be a non-negative number.')
  }

  let volumeMl: number
  let pourSizeId: string | null
  if (input.pourSizeId) {
    const pourSize = store.findPourSize(input.pourSizeId)
    if (!pourSize) throw new Error('Pour size not found.')
    volumeMl = pourSize.volumeMl
    pourSizeId = pourSize.id
  } else {
    if (!input.volumeMl || !Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
      throw new Error('Volume must be a positive number.')
    }
    volumeMl = Math.round(input.volumeMl)
    pourSizeId = null
  }

  return { pourSizeId, volumeMl, quantity, amount }
}

export function createMockSaleService(store: MockStore, latencyMs: number): SaleService {
  return {
    async list(wineId: string): Promise<WineSale[]> {
      await delay(latencyMs)
      return store.sales
        .filter((sale) => sale.wineId === wineId)
        .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
    },

    async create(input: SaleInput & { wineId: string }): Promise<WineSale> {
      await delay(latencyMs)
      if (!store.findWine(input.wineId)) throw new Error('Wine not found.')
      const resolved = resolveSaleFields(store, input)

      const sale: WineSale = {
        id: createId('sale'),
        wineId: input.wineId,
        ...resolved,
        soldAt: input.soldAt,
        source: 'manual',
        createdAt: new Date().toISOString(),
      }
      store.addSale(sale)
      return sale
    },

    async update(id: string, input: SaleInput): Promise<WineSale> {
      await delay(latencyMs)
      const resolved = resolveSaleFields(store, input)
      return store.updateSale(id, (current) => ({
        ...current,
        ...resolved,
        soldAt: input.soldAt,
      }))
    },

    async delete(id: string): Promise<void> {
      await delay(latencyMs)
      store.deleteSale(id)
    },
  }
}
