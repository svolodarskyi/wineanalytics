import type { Wine, WineSale } from '../types'

export interface VelocityPoint {
  /** Start of this bucket, ISO. */
  date: string
  bottles: number
}

export type SalesPeriod = '1mo' | '3mo' | '6mo' | 'all'
export type SalesGranularity = 'day' | 'week' | 'month'

export const SALES_PERIODS: { value: SalesPeriod; label: string }[] = [
  { value: '1mo', label: '1mo' },
  { value: '3mo', label: '3mo' },
  { value: '6mo', label: '6mo' },
  { value: 'all', label: 'All' },
]

export const SALES_GRANULARITIES: { value: SalesGranularity; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const PERIOD_DAYS: Record<Exclude<SalesPeriod, 'all'>, number> = { '1mo': 30, '3mo': 91, '6mo': 182 }

function fixedBuckets(windowStart: Date, now: Date, bucketMs: number): { start: Date; end: Date }[] {
  const buckets: { start: Date; end: Date }[] = []
  let start = windowStart
  while (start < now) {
    const end = new Date(Math.min(start.getTime() + bucketMs, now.getTime()))
    buckets.push({ start, end })
    start = end
  }
  return buckets
}

function monthBuckets(windowStart: Date, now: Date): { start: Date; end: Date }[] {
  const buckets: { start: Date; end: Date }[] = []
  let start = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1)
  while (start < now) {
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    buckets.push({ start, end })
    start = end
  }
  return buckets
}

/** Bottle-equivalent sales volume bucketed by day/week/month over the chosen period - "how fast is this actually moving." */
export function computeSalesVelocity(
  sales: WineSale[],
  wine: Wine,
  period: SalesPeriod,
  granularity: SalesGranularity,
  now = new Date(),
): VelocityPoint[] {
  const wineVolumeMl = wine.volumeMl

  let windowStart: Date
  if (period === 'all') {
    const earliestSaleMs = sales.reduce((min, sale) => Math.min(min, new Date(sale.soldAt).getTime()), now.getTime())
    windowStart = new Date(Number.isFinite(earliestSaleMs) ? earliestSaleMs : now.getTime())
  } else {
    windowStart = new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS)
  }

  const buckets =
    granularity === 'month' ? monthBuckets(windowStart, now) : fixedBuckets(windowStart, now, granularity === 'day' ? DAY_MS : WEEK_MS)

  if (buckets.length === 0) return []

  const totals = buckets.map(() => 0)
  if (wineVolumeMl) {
    for (const sale of sales) {
      const soldAt = new Date(sale.soldAt).getTime()
      if (Number.isNaN(soldAt) || soldAt < windowStart.getTime() || soldAt > now.getTime()) continue
      const index = buckets.findIndex((bucket) => soldAt >= bucket.start.getTime() && soldAt < bucket.end.getTime())
      if (index === -1) continue
      totals[index] += (sale.volumeMl * sale.quantity) / wineVolumeMl
    }
  }

  return buckets.map((bucket, index) => ({ date: bucket.start.toISOString(), bottles: totals[index] }))
}
