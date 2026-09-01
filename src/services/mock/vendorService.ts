import type { Vendor } from '../../types'
import type { ListOptions, VendorService } from '../types'
import { delay } from './delay'
import { createId } from './ids'
import type { MockStore } from './store'

export function createMockVendorService(store: MockStore, latencyMs: number): VendorService {
  return {
    async list(options?: ListOptions): Promise<Vendor[]> {
      await delay(latencyMs)
      let results = store.vendors
      if (!options?.includeInactive) {
        results = results.filter((vendor) => vendor.active)
      }
      if (options?.query) {
        const query = options.query.trim().toLowerCase()
        if (query) {
          results = results.filter((vendor) => vendor.name.toLowerCase().includes(query))
        }
      }
      return [...results].sort((a, b) => a.name.localeCompare(b.name))
    },

    async get(id: string): Promise<Vendor | null> {
      await delay(latencyMs)
      return store.findVendor(id) ?? null
    },

    async create(input: { name: string; invoiceName?: string | null }): Promise<Vendor> {
      await delay(latencyMs)
      const name = input.name.trim()
      if (!name) throw new Error('Vendor name is required.')
      const duplicate = store.vendors.some((vendor) => vendor.name.toLowerCase() === name.toLowerCase())
      if (duplicate) throw new Error(`A vendor named "${name}" already exists.`)
      const vendor: Vendor = {
        id: createId('vendor'),
        name,
        invoiceName: input.invoiceName?.trim() || null,
        active: true,
        createdAt: new Date().toISOString(),
      }
      store.vendors.push(vendor)
      return vendor
    },

    async update(id: string, input: { name: string; invoiceName?: string | null }): Promise<Vendor> {
      await delay(latencyMs)
      if (!store.findVendor(id)) throw new Error('Vendor not found.')
      const name = input.name.trim()
      if (!name) throw new Error('Vendor name is required.')
      return store.updateVendor(id, (vendor) => ({ ...vendor, name, invoiceName: input.invoiceName?.trim() || null }))
    },

    async setActive(id: string, active: boolean): Promise<Vendor> {
      await delay(latencyMs)
      if (!store.findVendor(id)) throw new Error('Vendor not found.')
      return store.updateVendor(id, (vendor) => ({ ...vendor, active }))
    },

    async delete(id: string): Promise<void> {
      await delay(latencyMs)
      if (!store.findVendor(id)) throw new Error('Vendor not found.')
      if (store.isVendorInUse(id)) {
        throw new Error('This vendor has invoice history and cannot be deleted. Deactivate it instead.')
      }
      store.deleteVendor(id)
    },
  }
}
