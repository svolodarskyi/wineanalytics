import { describe, expect, it } from 'vitest'
import type { PurchaseHistoryEntry } from '../../types'
import { buildPriceHistory } from '../priceHistory'

function entry(daysAgo: number, unitPrice: number, vendorName: string, now: Date): PurchaseHistoryEntry {
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return { invoiceId: `inv_${daysAgo}_${vendorName}`, date: date.toISOString().slice(0, 10), vendorName, quantity: 6, unitPrice, lineTotal: unitPrice * 6 }
}

describe('buildPriceHistory', () => {
  it('computes delta against the full history even when the prior purchase falls outside the selected window', () => {
    const now = new Date(2026, 8, 1)
    const history = [entry(200, 20, 'Vendor A', now), entry(10, 24, 'Vendor A', now)]

    const { points } = buildPriceHistory(history, '3mo', now)

    expect(points).toHaveLength(1)
    expect(points[0].deltaPct).toBeCloseTo(20) // 24 vs 20 = +20%, even though the 20 purchase is outside 3mo
  })

  it('lists every distinct vendor present in the filtered window', () => {
    const now = new Date(2026, 8, 1)
    const history = [entry(5, 20, 'Vendor A', now), entry(4, 18, 'Vendor B', now)]

    const { vendors } = buildPriceHistory(history, '1yr', now)

    expect(vendors).toEqual(['Vendor A', 'Vendor B'])
  })

  it('excludes purchases outside the selected period, and "all" keeps everything', () => {
    const now = new Date(2026, 8, 1)
    const history = [entry(200, 20, 'Vendor A', now), entry(5, 24, 'Vendor A', now)]

    expect(buildPriceHistory(history, '1yr', now).points).toHaveLength(2)
    expect(buildPriceHistory(history, '3mo', now).points).toHaveLength(1)
    expect(buildPriceHistory(history, 'all', now).points).toHaveLength(2)
  })
})
