import type { PurchaseHistoryEntry } from '../types'
import { parseFlexibleDate } from './dates'

export type PricePeriod = '3mo' | '6mo' | '1yr' | 'all'

export const PRICE_PERIODS: { value: PricePeriod; label: string }[] = [
  { value: '3mo', label: '3mo' },
  { value: '6mo', label: '6mo' },
  { value: '1yr', label: '1yr' },
  { value: 'all', label: 'All' },
]

export interface PricePoint {
  date: string
  invoiceId: string
  vendorName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  /** Percent change vs the immediately preceding purchase (any vendor), null for the first purchase on record. */
  deltaPct: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const PERIOD_DAYS: Record<Exclude<PricePeriod, 'all'>, number> = { '3mo': 91, '6mo': 182, '1yr': 365 }

/**
 * `deltaPct` is always computed against the immediately preceding purchase
 * in the *full* history, not the period-filtered window - "12% more than
 * last time" should stay true even if "last time" happened to fall just
 * outside the selected 3-month view. Points come back sorted oldest-first
 * (the natural order for a trend line); sort again for table display if a
 * newest-first view is wanted.
 */
export function buildPriceHistory(
  history: PurchaseHistoryEntry[],
  period: PricePeriod,
  now = new Date(),
): { points: PricePoint[]; vendors: string[] } {
  const dated = history
    .map((entry) => ({ entry, date: entry.date ? parseFlexibleDate(entry.date) : null }))
    .filter((x): x is { entry: PurchaseHistoryEntry; date: Date } => x.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  let previousPrice: number | null = null
  const withDeltas = dated.map(({ entry, date }) => {
    const deltaPct = previousPrice !== null ? ((entry.unitPrice - previousPrice) / previousPrice) * 100 : null
    previousPrice = entry.unitPrice
    return { entry, date, deltaPct }
  })

  const cutoff = period === 'all' ? null : new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS)
  const inWindow = cutoff ? withDeltas.filter((x) => x.date >= cutoff) : withDeltas

  const vendors = Array.from(new Set(inWindow.map((x) => x.entry.vendorName))).sort()

  const points: PricePoint[] = inWindow.map(({ entry, date, deltaPct }) => ({
    date: date.toISOString(),
    invoiceId: entry.invoiceId,
    vendorName: entry.vendorName,
    quantity: entry.quantity,
    unitPrice: entry.unitPrice,
    lineTotal: entry.lineTotal,
    deltaPct,
  }))

  return { points, vendors }
}
