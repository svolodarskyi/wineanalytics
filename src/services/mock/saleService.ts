import type { WineSale } from '../../types'
import type { SaleService } from '../types'
import { delay } from './delay'
import { createId } from './ids'
import type { MockStore } from './store'

export function createMockSaleService(store: MockStore, latencyMs: number): SaleService {
  return {
    async list(wineId: string): Promise<WineSale[]> {
      await delay(latencyMs)
      return store.sales
        .filter((sale) => sale.wineId === wineId)
        .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
    },

    async create(input: {
      wineId: string
      soldAt: string
      pourSizeId?: string | null
      volumeMl?: number
      quantity?: number
    }): Promise<WineSale> {
      await delay(latencyMs)
      if (!store.findWine(input.wineId)) throw new Error('Wine not found.')

      const quantity = input.quantity ?? 1
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
        throw new Error('Quantity must be a positive whole number.')
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

      const sale: WineSale = {
        id: createId('sale'),
        wineId: input.wineId,
        pourSizeId,
        volumeMl,
        quantity,
        soldAt: input.soldAt,
        source: 'manual',
        createdAt: new Date().toISOString(),
      }
      store.addSale(sale)
      return sale
    },

    async delete(id: string): Promise<void> {
      await delay(latencyMs)
      store.deleteSale(id)
    },
  }
}
