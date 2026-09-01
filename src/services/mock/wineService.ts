import type { PurchaseHistoryEntry, Wine, WineBalance } from '../../types'
import type { WineListOptions, WineService } from '../types'
import { createId } from './ids'
import type { MockStore } from './store'
import { delay } from './delay'

function compareWines(a: Wine, b: Wine): number {
  return a.name.localeCompare(b.name)
}

export function createMockWineService(store: MockStore, latencyMs: number): WineService {
  return {
    async list(options?: WineListOptions): Promise<Wine[]> {
      await delay(latencyMs)
      let results = store.wines
      if (!options?.includeInactive) {
        results = results.filter((wine) => wine.active)
      }
      if (options?.query) {
        const query = options.query.trim().toLowerCase()
        if (query) {
          results = results.filter((wine) => wine.name.toLowerCase().includes(query))
        }
      }
      return [...results].sort(compareWines)
    },

    async get(id: string): Promise<Wine | null> {
      await delay(latencyMs)
      return store.findWine(id) ?? null
    },

    async create(input: {
      name: string
      invoiceName?: string | null
      country?: string | null
      volume?: string | null
      category?: Wine['category']
      imageDataUrl?: string | null
    }): Promise<Wine> {
      await delay(latencyMs)
      const name = input.name.trim()
      if (!name) throw new Error('Wine name is required.')
      const duplicate = store.wines.some((wine) => wine.name.toLowerCase() === name.toLowerCase())
      if (duplicate) throw new Error(`A wine named "${name}" already exists.`)
      const wine: Wine = {
        id: createId('wine'),
        name,
        invoiceName: input.invoiceName?.trim() || null,
        country: input.country?.trim() || null,
        volume: input.volume?.trim() || null,
        category: input.category ?? null,
        imageDataUrl: input.imageDataUrl ?? null,
        active: true,
        createdAt: new Date().toISOString(),
      }
      store.wines.push(wine)
      return wine
    },

    async update(
      id: string,
      input: {
        name: string
        invoiceName?: string | null
        country?: string | null
        volume?: string | null
        category?: Wine['category']
        imageDataUrl?: string | null
      },
    ): Promise<Wine> {
      await delay(latencyMs)
      if (!store.findWine(id)) throw new Error('Wine not found.')
      const name = input.name.trim()
      if (!name) throw new Error('Wine name is required.')
      return store.updateWine(id, (wine) => ({
        ...wine,
        name,
        invoiceName: input.invoiceName?.trim() || null,
        country: input.country?.trim() || null,
        volume: input.volume?.trim() || null,
        category: input.category ?? null,
        imageDataUrl: input.imageDataUrl !== undefined ? input.imageDataUrl : wine.imageDataUrl,
      }))
    },

    async setActive(id: string, active: boolean): Promise<Wine> {
      await delay(latencyMs)
      if (!store.findWine(id)) throw new Error('Wine not found.')
      return store.updateWine(id, (wine) => ({ ...wine, active }))
    },

    async delete(id: string): Promise<void> {
      await delay(latencyMs)
      if (!store.findWine(id)) throw new Error('Wine not found.')
      if (store.isWineInUse(id)) {
        throw new Error('This wine has invoice history and cannot be deleted. Deactivate it instead.')
      }
      store.deleteWine(id)
    },

    async getBalances(): Promise<WineBalance[]> {
      await delay(latencyMs)
      const balances: WineBalance[] = store.wines
        .filter((wine) => wine.active)
        .map((wine) => {
          const balanceInBottles = store.invoices
            .filter((invoice) => invoice.status === 'approved')
            .flatMap((invoice) => invoice.lineItems)
            .filter((line) => line.skuMatch.wineId === wine.id)
            .reduce((sum, line) => sum + line.quantity, 0)
          return { wine, balanceInBottles }
        })
      return balances.sort((a, b) => compareWines(a.wine, b.wine))
    },

    async getPurchaseHistory(id: string): Promise<PurchaseHistoryEntry[]> {
      await delay(latencyMs)
      const entries: PurchaseHistoryEntry[] = []
      for (const invoice of store.invoices) {
        if (invoice.status !== 'approved') continue
        for (const line of invoice.lineItems) {
          if (line.skuMatch.wineId !== id) continue
          const vendor = invoice.extracted.vendorMatch.vendorId
            ? store.findVendor(invoice.extracted.vendorMatch.vendorId)
            : undefined
          entries.push({
            invoiceId: invoice.id,
            date: invoice.extracted.invoiceDate,
            vendorName: vendor?.name ?? invoice.extracted.vendorMatch.vendorNameRaw,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })
        }
      }
      return entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    },
  }
}

