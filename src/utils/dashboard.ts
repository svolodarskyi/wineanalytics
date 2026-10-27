import type { Invoice, WineBalance } from '../types'
import { parseFlexibleDate } from './dates'

export interface SpendSummary {
  thisMonth: number
  lastMonth: number
  /** Null when there's no prior-month spend to compare against. */
  deltaPct: number | null
  /** Trailing 6 weeks of spend, oldest first - for a sparkline, not precise accounting. */
  weeklySpend: number[]
}

const WEEKS_IN_TREND = 6
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000
/** OCR-extracted dates are unreviewed - a misread year (e.g. "2015" instead of "2026") shouldn't be trusted just because it parses. Anything further from "now" than this, in either direction, is treated as unreliable. */
const MAX_PLAUSIBLE_INVOICE_AGE_MS = 5 * 365 * DAY_MS

/**
 * Invoice date when OCR/entry captured one and it's a plausible purchase
 * date, else falls back to when it was approved - always present on an
 * approved invoice. OCR can misread a date field entirely (e.g. a scanned
 * "23" becoming a year "2015") - an unreviewed date far outside a normal
 * invoice's age is more likely bad extraction than a genuinely old delivery,
 * so it's discarded in favor of the approval timestamp rather than silently
 * shifting that invoice's spend into some unrelated month or dropping it
 * from every period entirely.
 */
function effectiveDate(invoice: Invoice, now: Date): Date | null {
  const invoiceDate = invoice.extracted.invoiceDate ? parseFlexibleDate(invoice.extracted.invoiceDate) : null
  if (invoiceDate && Math.abs(now.getTime() - invoiceDate.getTime()) <= MAX_PLAUSIBLE_INVOICE_AGE_MS) {
    return invoiceDate
  }
  return invoice.approvedAt ? parseFlexibleDate(invoice.approvedAt) : null
}

/** `approvedInvoices` should already be filtered to status "approved" - unapproved totals aren't real spend yet. */
export function computeSpendSummary(approvedInvoices: Invoice[], now = new Date()): SpendSummary {
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  let thisMonth = 0
  let lastMonth = 0
  for (const invoice of approvedInvoices) {
    const date = effectiveDate(invoice, now)
    if (!date) continue
    const amount = invoice.extracted.totalAmount ?? 0
    if (date >= thisMonthStart) {
      thisMonth += amount
    } else if (date >= lastMonthStart) {
      lastMonth += amount
    }
  }

  const weeklySpend = Array.from({ length: WEEKS_IN_TREND }, () => 0)
  const windowStart = new Date(now.getTime() - WEEKS_IN_TREND * WEEK_MS)
  for (const invoice of approvedInvoices) {
    const date = effectiveDate(invoice, now)
    if (!date || date < windowStart || date > now) continue
    const weekIndex = Math.min(WEEKS_IN_TREND - 1, Math.floor((date.getTime() - windowStart.getTime()) / WEEK_MS))
    weeklySpend[weekIndex] += invoice.extracted.totalAmount ?? 0
  }

  return {
    thisMonth,
    lastMonth,
    deltaPct: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null,
    weeklySpend,
  }
}

/**
 * Rough "cash tied up in stock": each wine's current balance times the unit
 * price it last showed up at on an approved invoice. Wines never bought (or
 * bought but not yet balance-positive) contribute nothing - this is a
 * glance-level estimate, not an accounting figure.
 */
export function computeInventoryValue(balances: WineBalance[], approvedInvoices: Invoice[], now = new Date()): number {
  const lastPriceByWine = new Map<string, { price: number; date: Date }>()

  for (const invoice of approvedInvoices) {
    const date = effectiveDate(invoice, now) ?? new Date(0)
    for (const line of invoice.lineItems) {
      if (line.excluded) continue
      const wineId = line.skuMatch.wineId
      if (!wineId) continue
      // line.unitPrice is a pack's price as printed - divide by packSize to
      // get the per-bottle/can price that balanceInBottles (already in real
      // units, not packs) needs to be multiplied by below.
      const perUnitPrice = line.unitPrice / line.packSize
      const existing = lastPriceByWine.get(wineId)
      if (!existing || date > existing.date) {
        lastPriceByWine.set(wineId, { price: perUnitPrice, date })
      }
    }
  }

  let total = 0
  for (const { wine, balanceInBottles } of balances) {
    if (balanceInBottles <= 0) continue
    const lastPrice = lastPriceByWine.get(wine.id)?.price
    if (lastPrice) total += balanceInBottles * lastPrice
  }
  return total
}
