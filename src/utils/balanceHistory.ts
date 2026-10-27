import type { PurchaseHistoryEntry, Wine, WineSale } from '../types'
import { parseFlexibleDate } from './dates'

export interface BalancePoint {
  /** End of this bucket, ISO. */
  date: string
  balanceInBottles: number
  /** balanceInBottles * the most recent purchase price known as of this point - 0 until a first purchase price is known. */
  approxValue: number
}

export type BalancePeriod = '30d' | '90d' | '6mo' | '1yr'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

const PERIOD_DAYS: Record<BalancePeriod, number> = {
  '30d': 30,
  '90d': 90,
  '6mo': 182,
  '1yr': 365,
}

interface BalanceEvent {
  date: Date
  delta: number
  /** Set on purchase events only - updates the running "last known price" used for approxValue. */
  unitPrice?: number
}

/**
 * Reconstructs a wine's bottle balance - and an approximate dollar value at
 * each point, using the last purchase price known as of that date - over
 * time by replaying every purchase (+quantity, dated by invoice) and sale
 * (-volume-equivalent, dated by sale time) in chronological order. There's
 * no stored balance history, only the current computed total, so this is the
 * only way to draw a depletion trend. Bucketed daily for the 30-day view and
 * weekly for longer ones (daily would be too noisy/expensive to render
 * meaningfully over a year), each bucket taking the balance as of its end.
 */
export function computeBalanceHistory(
  purchases: PurchaseHistoryEntry[],
  sales: WineSale[],
  wine: Wine,
  period: BalancePeriod,
  now = new Date(),
): BalancePoint[] {
  const events: BalanceEvent[] = []

  for (const purchase of purchases) {
    if (!purchase.date) continue
    const date = parseFlexibleDate(purchase.date)
    if (!date) continue
    events.push({ date, delta: purchase.quantity, unitPrice: purchase.unitPrice })
  }

  const wineVolumeMl = wine.volumeMl
  if (wineVolumeMl) {
    for (const sale of sales) {
      const date = new Date(sale.soldAt)
      if (Number.isNaN(date.getTime())) continue
      events.push({ date, delta: -(sale.volumeMl * sale.quantity) / wineVolumeMl })
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())

  const days = PERIOD_DAYS[period]
  const windowStart = new Date(now.getTime() - days * DAY_MS)
  const bucketMs = period === '30d' ? DAY_MS : WEEK_MS

  // Balance and last known price carried in from before the visible window -
  // every event before windowStart still contributed to where the line starts.
  let balance = 0
  let lastPrice: number | null = null
  let cursor = 0
  while (cursor < events.length && events[cursor].date < windowStart) {
    balance += events[cursor].delta
    if (events[cursor].unitPrice !== undefined) lastPrice = events[cursor].unitPrice!
    cursor++
  }

  const series: BalancePoint[] = []
  for (let bucketEnd = windowStart.getTime() + bucketMs; ; bucketEnd += bucketMs) {
    const cappedEnd = Math.min(bucketEnd, now.getTime())
    while (cursor < events.length && events[cursor].date.getTime() <= cappedEnd) {
      balance += events[cursor].delta
      if (events[cursor].unitPrice !== undefined) lastPrice = events[cursor].unitPrice!
      cursor++
    }
    series.push({
      date: new Date(cappedEnd).toISOString(),
      balanceInBottles: balance,
      approxValue: lastPrice !== null ? balance * lastPrice : 0,
    })
    if (cappedEnd >= now.getTime()) break
  }

  return series
}
