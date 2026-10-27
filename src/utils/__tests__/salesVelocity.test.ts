import { describe, expect, it } from 'vitest'
import type { Wine, WineSale } from '../../types'
import { computeSalesVelocity } from '../salesVelocity'

const wine: Wine = {
  id: 'wine_1',
  name: 'Test Wine',
  invoiceName: null,
  producer: null,
  country: null,
  volumeMl: 750,
  category: 'red',
  imageDataUrls: [],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function sale(daysAgo: number, volumeMl: number, quantity: number, now: Date): WineSale {
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    id: `sale_${daysAgo}_${Math.random()}`,
    wineId: wine.id,
    pourSizeId: null,
    volumeMl,
    quantity,
    amount: null,
    soldAt: date.toISOString(),
    source: 'manual',
    createdAt: date.toISOString(),
  }
}

describe('computeSalesVelocity', () => {
  it('buckets sales into bottle-equivalents per trailing week, over a 3-month window', () => {
    const now = new Date(2026, 8, 1)
    const sales = [sale(2, 750, 1, now), sale(2, 750, 2, now)] // 3 bottles in the most recent week

    const points = computeSalesVelocity(sales, wine, '3mo', 'week', now)

    expect(points.length).toBeGreaterThan(10)
    expect(points[points.length - 1].bottles).toBeCloseTo(3)
    expect(points.slice(0, -1).every((p) => p.bottles === 0)).toBe(true)
  })

  it('returns all-zero buckets for a wine with no volumeMl instead of throwing', () => {
    const now = new Date(2026, 8, 1)
    const noVolumeWine: Wine = { ...wine, volumeMl: null }

    const points = computeSalesVelocity([sale(1, 750, 1, now)], noVolumeWine, '1mo', 'day', now)

    expect(points.every((p) => p.bottles === 0)).toBe(true)
  })

  it('ignores sales outside the selected period', () => {
    const now = new Date(2026, 8, 1)
    const points = computeSalesVelocity([sale(200, 750, 5, now)], wine, '1mo', 'day', now)

    expect(points.every((p) => p.bottles === 0)).toBe(true)
  })

  it('buckets by calendar month for the monthly granularity', () => {
    const now = new Date(2026, 8, 15) // Sep 15
    const sales = [sale(20, 750, 6, now)] // ~Aug 26 - lands in the August bucket

    const points = computeSalesVelocity(sales, wine, '6mo', 'month', now)

    // Exactly one bucket (September, the current partial month) should carry no sale;
    // the August bucket should hold all 6 bottles.
    const augustBucket = points.find((p) => new Date(p.date).getMonth() === 7)
    expect(augustBucket?.bottles).toBeCloseTo(6)
  })

  it('"all" period spans from the earliest sale to now', () => {
    const now = new Date(2026, 8, 1)
    const points = computeSalesVelocity([sale(400, 750, 2, now)], wine, 'all', 'month', now)

    expect(points.length).toBeGreaterThan(10) // ~13-14 months back
    expect(points.reduce((sum, p) => sum + p.bottles, 0)).toBeCloseTo(2)
  })

  it('returns an empty series for "all" with no sales at all', () => {
    const now = new Date(2026, 8, 1)
    expect(computeSalesVelocity([], wine, 'all', 'month', now)).toEqual([])
  })
})
