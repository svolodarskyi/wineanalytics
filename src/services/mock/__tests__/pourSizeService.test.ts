import { beforeEach, describe, expect, it } from 'vitest'
import type { Services } from '../../types'
import { createMockServices } from '../index'

describe('mock pour size service', () => {
  let services: Services

  beforeEach(() => {
    services = createMockServices({ latencyMs: 0, seed: false })
  })

  it('lists only active pour sizes by default, sorted by volume', async () => {
    await services.pourSizes.create({ name: 'Glass', volumeMl: 150 })
    await services.pourSizes.create({ name: 'Taste', volumeMl: 75 })
    const pourSizes = await services.pourSizes.list()
    expect(pourSizes.map((p) => p.name)).toEqual(['Taste', 'Glass'])
  })

  it('creates a pour size and rejects duplicate names case-insensitively', async () => {
    await services.pourSizes.create({ name: 'Glass', volumeMl: 150 })
    await expect(services.pourSizes.create({ name: 'glass', volumeMl: 200 })).rejects.toThrow(/already exists/i)
  })

  it('rejects a non-positive volume on create and update', async () => {
    await expect(services.pourSizes.create({ name: 'Bad', volumeMl: 0 })).rejects.toThrow(/positive/i)
    const pourSize = await services.pourSizes.create({ name: 'Good', volumeMl: 100 })
    await expect(services.pourSizes.update(pourSize.id, { name: 'Good', volumeMl: -5 })).rejects.toThrow(/positive/i)
  })

  it('deactivating hides a pour size from the default list but keeps it with includeInactive', async () => {
    const pourSize = await services.pourSizes.create({ name: 'Fading Pour', volumeMl: 100 })
    await services.pourSizes.setActive(pourSize.id, false)

    const activeOnly = await services.pourSizes.list()
    expect(activeOnly.find((p) => p.id === pourSize.id)).toBeUndefined()

    const withInactive = await services.pourSizes.list({ includeInactive: true })
    expect(withInactive.find((p) => p.id === pourSize.id)?.active).toBe(false)
  })

  it('deletes a pour size that has never been sold', async () => {
    const pourSize = await services.pourSizes.create({ name: 'Deletable', volumeMl: 100 })
    await services.pourSizes.delete(pourSize.id)
    expect(await services.pourSizes.get(pourSize.id)).toBeNull()
  })

  it('blocks deletion of a pour size that has sale history', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    const pourSize = await services.pourSizes.create({ name: 'Used Pour', volumeMl: 100 })
    await services.sales.create({ wineId: wine.id, soldAt: new Date().toISOString(), pourSizeId: pourSize.id })

    await expect(services.pourSizes.delete(pourSize.id)).rejects.toThrow(/sale history/i)
  })
})
