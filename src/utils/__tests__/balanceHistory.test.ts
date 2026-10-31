import { describe, expect, it } from 'vitest'
import type { PurchaseHistoryEntry, Wine, WineSale } from '../../types'
import { computeBalanceHistory } from '../balanceHistory'

const wine: Wine = {
  id: 'wine_1',
  name: 'Test Wine',
  invoiceName: null,
  volumeMl: 750,
  category: 'wine',
  imageDataUrls: [],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function purchase(daysAgo: number, quantity: number, now: Date): PurchaseHistoryEntry {
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return { invoiceId: `inv_${daysAgo}`, date: date.toISOString().slice(0, 10), vendorName: 'Vendor', quantity, unitPrice: 20, lineTotal: quantity * 20 }
}

function sale(daysAgo: number, bottleEquivalent: number, now: Date): WineSale {
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    id: `sale_${daysAgo}`,
    wineId: wine.id,
    pourSizeId: null,
    volumeMl: wine.volumeMl!,
    quantity: bottleEquivalent,
    amount: null,
    soldAt: date.toISOString(),
    source: 'manual',
    createdAt: date.toISOString(),
  }
}

describe('computeBalanceHistory', () => {
  it('carries pre-window purchases into the starting baseline and applies in-window events in order', () => {
    const now = new Date(2026, 8, 1, 12, 0, 0)
    const purchases = [purchase(40, 12, now)] // before the 30d window - baseline
    const sales = [sale(10, 6, now)] // inside the 30d window

    const series = computeBalanceHistory(purchases, sales, wine, '30d', now)

    expect(series.length).toBeGreaterThan(0)
    expect(series[0].balanceInBottles).toBe(12) // first bucket, before the sale lands
    expect(series[series.length - 1].balanceInBottles).toBe(6) // after the sale
  })

  it('never sells wines with no volumeMl short - sales are simply excluded from the reconstruction', () => {
    const now = new Date(2026, 8, 1)
    const noVolumeWine: Wine = { ...wine, volumeMl: null }
    const purchases = [purchase(5, 10, now)]
    const sales = [sale(2, 3, now)]

    const series = computeBalanceHistory(purchases, sales, noVolumeWine, '30d', now)

    expect(series[series.length - 1].balanceInBottles).toBe(10)
  })

  it('produces a longer, weekly-bucketed series for a 1-year period', () => {
    const now = new Date(2026, 8, 1)
    const series = computeBalanceHistory([purchase(300, 20, now)], [], wine, '1yr', now)

    expect(series.length).toBeGreaterThan(40) // ~52 weekly buckets
    expect(series[series.length - 1].balanceInBottles).toBe(20)
  })

  it('values the balance at the most recent purchase price known as of each point', () => {
    const now = new Date(2026, 8, 1)
    // Bought 10 @ $20, sold down to 4, then bought 6 more @ $25.
    const purchases = [purchase(40, 10, now), purchase(5, 6, now)]
    purchases[1].unitPrice = 25
    const sales = [sale(20, 6, now)]

    const series = computeBalanceHistory(purchases, sales, wine, '90d', now)

    const lastPoint = series[series.length - 1]
    expect(lastPoint.balanceInBottles).toBe(10) // 10 - 6 + 6
    expect(lastPoint.approxValue).toBe(250) // priced at the latest known $25, not the original $20
  })

  it('has zero approxValue before any purchase price is known', () => {
    const now = new Date(2026, 8, 1)
    const series = computeBalanceHistory([], [], wine, '30d', now)

    expect(series.every((point) => point.approxValue === 0)).toBe(true)
  })
})
