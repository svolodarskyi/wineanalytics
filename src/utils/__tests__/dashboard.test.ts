import { describe, expect, it } from 'vitest'
import type { Invoice, Wine, WineBalance } from '../../types'
import { computeInventoryValue, computeSpendSummary } from '../dashboard'

function approvedInvoice(overrides: { invoiceDate: string | null; approvedAt: string; totalAmount: number }): Invoice {
  return {
    id: `invoice_${Math.random()}`,
    fileName: 'invoice.pdf',
    fileType: 'pdf',
    fileDataUrl: '',
    uploadedAt: overrides.approvedAt,
    status: 'approved',
    approvedAt: overrides.approvedAt,
    extracted: {
      invoiceDate: overrides.invoiceDate,
      totalAmount: overrides.totalAmount,
      vendorMatch: { vendorNameRaw: 'Vendor', vendorId: 'vendor_1', confidence: 'high', status: 'confirmed' },
      additionalCharges: [],
    },
    lineItems: [],
  }
}

describe('computeSpendSummary', () => {
  it('counts an invoice dated the 1st of the month as this month, regardless of local timezone', () => {
    // A Postgres `date` column comes back as a bare "YYYY-MM-DD" string with
    // no time/zone - naively parsed with `new Date(...)` that's UTC midnight,
    // which lands on the *previous* local day west of UTC and would wrongly
    // exclude a same-day invoice from "this month".
    const now = new Date(2026, 8, 1, 15, 0, 0) // Sep 1, 2026, 3pm local
    const invoice = approvedInvoice({ invoiceDate: '2026-09-01', approvedAt: '2026-09-01T21:00:00.000Z', totalAmount: 100 })

    const summary = computeSpendSummary([invoice], now)

    expect(summary.thisMonth).toBe(100)
    expect(summary.lastMonth).toBe(0)
  })

  it('falls back to approvedAt when the OCR-extracted invoice date is implausible', () => {
    // Real-world case: OCR misread an invoice date as the year 2015 instead
    // of 2026. Trusting it outright drops the invoice out of every period
    // ("this month" AND "last month" both show nothing) even though it was
    // approved today.
    const now = new Date(2026, 8, 1, 16, 30, 0)
    const invoice = approvedInvoice({ invoiceDate: '2015-09-23', approvedAt: '2026-09-01T21:40:49.008Z', totalAmount: 343.98 })

    const summary = computeSpendSummary([invoice], now)

    expect(summary.thisMonth).toBe(343.98)
  })

  it('still uses a plausible OCR-extracted date over the approval date', () => {
    // A wine bought weeks before it was approved should count toward the
    // month it was actually purchased in, not the month it was reviewed.
    const now = new Date(2026, 8, 15)
    const invoice = approvedInvoice({ invoiceDate: '2026-08-05', approvedAt: '2026-09-10T12:00:00.000Z', totalAmount: 50 })

    const summary = computeSpendSummary([invoice], now)

    expect(summary.thisMonth).toBe(0)
    expect(summary.lastMonth).toBe(50)
  })
})

describe('computeInventoryValue', () => {
  const wine: Wine = {
    id: 'w1',
    name: 'Corona',
    invoiceName: null,
    volumeMl: 355,
    category: 'beer',
    style: null,
    country: null,
    imageDataUrls: [],
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  function invoiceWithLine(overrides: { quantity: number; unitPrice: number; packSize: number; excluded?: boolean }): Invoice {
    return {
      id: 'inv1',
      fileName: 'invoice.pdf',
      fileType: 'pdf',
      fileDataUrl: '',
      uploadedAt: '2026-09-01T00:00:00.000Z',
      status: 'approved',
      approvedAt: '2026-09-01T00:00:00.000Z',
      extracted: {
        invoiceDate: '2026-09-01',
        totalAmount: overrides.quantity * overrides.unitPrice,
        vendorMatch: { vendorNameRaw: 'Vendor', vendorId: 'vendor_1', confidence: 'high', status: 'confirmed' },
        additionalCharges: [],
      },
      lineItems: [
        {
          id: 'li1',
          itemNameRaw: 'Corona 6-pack',
          volumeMlRaw: 355,
          categoryRaw: 'beer',
          quantity: overrides.quantity,
          unitPrice: overrides.unitPrice,
          lineTotal: overrides.quantity * overrides.unitPrice,
          packSize: overrides.packSize,
          skuMatch: { wineId: wine.id, confidence: 'high', status: 'confirmed' },
          excluded: overrides.excluded ?? false,
        },
      ],
    }
  }

  it("divides a pack line's price by pack size, so value reflects per-bottle cost, not per-pack cost", () => {
    // 2 six-packs at $12/pack on the invoice = 12 bottles received at $2 each.
    const invoice = invoiceWithLine({ quantity: 2, unitPrice: 12, packSize: 6 })
    const balances: WineBalance[] = [{ wine, balanceInBottles: 12 }]

    // 12 bottles on hand at $2/bottle, not $12/bottle.
    expect(computeInventoryValue(balances, [invoice])).toBe(24)
  })

  it('ignores an excluded line item when picking up the last known unit price', () => {
    const invoice = invoiceWithLine({ quantity: 2, unitPrice: 12, packSize: 6, excluded: true })
    const balances: WineBalance[] = [{ wine, balanceInBottles: 12 }]

    // No non-excluded purchase to price it from - contributes nothing rather than using the excluded line's price.
    expect(computeInventoryValue(balances, [invoice])).toBe(0)
  })
})
