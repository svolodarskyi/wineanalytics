import type { PourSize } from '../../types'
import type { ListOptions, PourSizeService } from '../types'
import { delay } from './delay'
import { createId } from './ids'
import type { MockStore } from './store'

function comparePourSizes(a: PourSize, b: PourSize): number {
  return a.volumeMl - b.volumeMl
}

export function createMockPourSizeService(store: MockStore, latencyMs: number): PourSizeService {
  return {
    async list(options?: ListOptions): Promise<PourSize[]> {
      await delay(latencyMs)
      let results = store.pourSizes
      if (!options?.includeInactive) {
        results = results.filter((pourSize) => pourSize.active)
      }
      if (options?.query) {
        const query = options.query.trim().toLowerCase()
        if (query) {
          results = results.filter((pourSize) => pourSize.name.toLowerCase().includes(query))
        }
      }
      return [...results].sort(comparePourSizes)
    },

    async get(id: string): Promise<PourSize | null> {
      await delay(latencyMs)
      return store.findPourSize(id) ?? null
    },

    async create(input: { name: string; volumeMl: number }): Promise<PourSize> {
      await delay(latencyMs)
      const name = input.name.trim()
      if (!name) throw new Error('Pour size name is required.')
      if (!Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
        throw new Error('Volume must be a positive number.')
      }
      const duplicate = store.pourSizes.some((pourSize) => pourSize.name.toLowerCase() === name.toLowerCase())
      if (duplicate) throw new Error(`A pour size named "${name}" already exists.`)
      const pourSize: PourSize = {
        id: createId('pour'),
        name,
        volumeMl: Math.round(input.volumeMl),
        active: true,
        createdAt: new Date().toISOString(),
      }
      store.pourSizes.push(pourSize)
      return pourSize
    },

    async update(id: string, input: { name: string; volumeMl: number }): Promise<PourSize> {
      await delay(latencyMs)
      if (!store.findPourSize(id)) throw new Error('Pour size not found.')
      const name = input.name.trim()
      if (!name) throw new Error('Pour size name is required.')
      if (!Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
        throw new Error('Volume must be a positive number.')
      }
      return store.updatePourSize(id, (pourSize) => ({ ...pourSize, name, volumeMl: Math.round(input.volumeMl) }))
    },

    async setActive(id: string, active: boolean): Promise<PourSize> {
      await delay(latencyMs)
      if (!store.findPourSize(id)) throw new Error('Pour size not found.')
      return store.updatePourSize(id, (pourSize) => ({ ...pourSize, active }))
    },

    async delete(id: string): Promise<void> {
      await delay(latencyMs)
      if (!store.findPourSize(id)) throw new Error('Pour size not found.')
      if (store.isPourSizeInUse(id)) {
        throw new Error('This pour size has sale history and cannot be deleted. Deactivate it instead.')
      }
      store.deletePourSize(id)
    },
  }
}
