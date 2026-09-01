import { beforeEach, describe, expect, it } from 'vitest'
import type { Services } from '../../types'
import { createMockServices } from '../index'

describe('mock sale service', () => {
  let services: Services

  beforeEach(() => {
    services = createMockServices({ latencyMs: 0, seed: false })
  })

  it('records a sale via a pour size, resolving its own volume', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    const pourSize = await services.pourSizes.create({ name: 'Glass', volumeMl: 150 })

    const sale = await services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', pourSizeId: pourSize.id })
    expect(sale.volumeMl).toBe(150)
    expect(sale.pourSizeId).toBe(pourSize.id)
    expect(sale.quantity).toBe(1)
    expect(sale.source).toBe('manual')
  })

  it('records a sale via a raw custom ml, with pourSizeId null', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    const sale = await services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 100 })
    expect(sale.volumeMl).toBe(100)
    expect(sale.pourSizeId).toBeNull()
  })

  it('defaults quantity to 1 and accepts a larger quantity', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    const single = await services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 750 })
    expect(single.quantity).toBe(1)

    const multiple = await services.sales.create({
      wineId: wine.id,
      soldAt: '2026-01-01T00:00:00.000Z',
      volumeMl: 150,
      quantity: 3,
    })
    expect(multiple.quantity).toBe(3)
  })

  it('defaults amount to null and accepts a given amount', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    const withoutAmount = await services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 750 })
    expect(withoutAmount.amount).toBeNull()

    const withAmount = await services.sales.create({
      wineId: wine.id,
      soldAt: '2026-01-01T00:00:00.000Z',
      volumeMl: 750,
      amount: 42.5,
    })
    expect(withAmount.amount).toBe(42.5)
  })

  it('rejects a negative amount', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    await expect(
      services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 100, amount: -5 }),
    ).rejects.toThrow(/non-negative/i)
  })

  it('rejects a non-positive or non-integer quantity', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    await expect(
      services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 100, quantity: 0 }),
    ).rejects.toThrow(/positive whole number/i)
    await expect(
      services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 100, quantity: 1.5 }),
    ).rejects.toThrow(/positive whole number/i)
  })

  it('rejects an unknown wine', async () => {
    await expect(
      services.sales.create({ wineId: 'missing-wine', soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 100 }),
    ).rejects.toThrow(/wine not found/i)
  })

  it('rejects an unknown pour size', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    await expect(
      services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', pourSizeId: 'missing-pour' }),
    ).rejects.toThrow(/pour size not found/i)
  })

  it('rejects a non-positive custom volume', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    await expect(
      services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 0 }),
    ).rejects.toThrow(/positive number/i)
  })

  it('lists a wine\'s sales sorted by soldAt descending, scoped to that wine', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    const otherWine = await services.wines.create({ name: 'Other Wine' })
    await services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 100 })
    await services.sales.create({ wineId: wine.id, soldAt: '2026-03-01T00:00:00.000Z', volumeMl: 100 })
    await services.sales.create({ wineId: otherWine.id, soldAt: '2026-02-01T00:00:00.000Z', volumeMl: 100 })

    const sales = await services.sales.list(wine.id)
    expect(sales).toHaveLength(2)
    expect(sales.map((s) => s.soldAt)).toEqual(['2026-03-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'])
  })

  it('deletes a sale', async () => {
    const wine = await services.wines.create({ name: 'Wine' })
    const sale = await services.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 100 })
    await services.sales.delete(sale.id)
    expect(await services.sales.list(wine.id)).toEqual([])
  })
})
