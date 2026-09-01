import { beforeEach, describe, expect, it } from 'vitest'
import type { Services } from '../../types'
import { createMockServices } from '../index'

describe('mock wine service', () => {
  let services: Services

  beforeEach(() => {
    services = createMockServices({ latencyMs: 0, processingDelayMs: 10 })
  })

  it('lists only active wines by default, seeded from the demo master data', async () => {
    const wines = await services.wines.list()
    expect(wines.length).toBeGreaterThan(0)
    expect(wines.every((wine) => wine.active)).toBe(true)
  })

  it('creates a wine and rejects duplicate names case-insensitively', async () => {
    const wine = await services.wines.create({ name: 'Opus One' })
    expect(wine.name).toBe('Opus One')
    expect(wine.active).toBe(true)

    await expect(services.wines.create({ name: 'opus one' })).rejects.toThrow(/already exists/i)
  })

  it('rejects blank names', async () => {
    await expect(services.wines.create({ name: '   ' })).rejects.toThrow(/required/i)
  })

  it('updates a wine name', async () => {
    const wine = await services.wines.create({ name: 'Original Name' })
    const updated = await services.wines.update(wine.id, { name: 'Renamed' })
    expect(updated.name).toBe('Renamed')
    expect(updated.id).toBe(wine.id)
  })

  it('stores an invoice name distinct from the display name, defaulting to null', async () => {
    const withoutInvoiceName = await services.wines.create({ name: 'Plain Wine' })
    expect(withoutInvoiceName.invoiceName).toBeNull()

    const withInvoiceName = await services.wines.create({ name: 'Caymus Cabernet', invoiceName: 'CAYMUS CAB 750ML' })
    expect(withInvoiceName.invoiceName).toBe('CAYMUS CAB 750ML')

    const updated = await services.wines.update(withInvoiceName.id, {
      name: 'Caymus Cabernet',
      invoiceName: 'CAYMUS CS 750',
    })
    expect(updated.invoiceName).toBe('CAYMUS CS 750')
  })

  it('stores volume and category, defaulting to null', async () => {
    const bare = await services.wines.create({ name: 'Bare Wine' })
    expect(bare.volume).toBeNull()
    expect(bare.category).toBeNull()

    const detailed = await services.wines.create({ name: 'Detailed Wine', volume: '750ml', category: 'red' })
    expect(detailed.volume).toBe('750ml')
    expect(detailed.category).toBe('red')

    const updated = await services.wines.update(detailed.id, { name: 'Detailed Wine', volume: '1.5L', category: 'white' })
    expect(updated.volume).toBe('1.5L')
    expect(updated.category).toBe('white')
  })

  it('deactivating a wine hides it from the default list but keeps it with includeInactive', async () => {
    const wine = await services.wines.create({ name: 'Soon Retired' })
    await services.wines.setActive(wine.id, false)

    const activeOnly = await services.wines.list()
    expect(activeOnly.find((w) => w.id === wine.id)).toBeUndefined()

    const withInactive = await services.wines.list({ includeInactive: true })
    const found = withInactive.find((w) => w.id === wine.id)
    expect(found?.active).toBe(false)
  })

  it('filters by search query', async () => {
    await services.wines.create({ name: 'Zinfandel Reserve' })
    const results = await services.wines.list({ query: 'zinfandel' })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Zinfandel Reserve')
  })

  it('stores and updates a country, defaulting to null when omitted', async () => {
    const wine = await services.wines.create({ name: 'No Country Wine' })
    expect(wine.country).toBeNull()

    const withCountry = await services.wines.create({ name: 'French Wine', country: 'France' })
    expect(withCountry.country).toBe('France')

    const updated = await services.wines.update(withCountry.id, { name: 'French Wine', country: 'Italy' })
    expect(updated.country).toBe('Italy')
  })

  it('always lists wines sorted alphabetically by name', async () => {
    await services.wines.create({ name: 'Zeta Wine', country: 'Argentina' })
    await services.wines.create({ name: 'Alpha Wine', country: 'Chile' })

    const wines = await services.wines.list()
    const names = wines.map((w) => w.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('every write returns a new object reference, never the mutated original', async () => {
    // Regression test: earlier the mock store mutated wine objects in place,
    // which meant React Query's structural sharing saw "no change" and the
    // UI silently never re-rendered after an edit or activate/deactivate.
    const wine = await services.wines.create({ name: 'Reference Check' })
    const afterUpdate = await services.wines.update(wine.id, { name: 'Reference Check 2' })
    expect(afterUpdate).not.toBe(wine)

    const afterDeactivate = await services.wines.setActive(wine.id, false)
    expect(afterDeactivate).not.toBe(afterUpdate)
  })

  describe('getBalances / getPurchaseHistory', () => {
    it('only counts quantities from approved invoices, and only for the matching wine', async () => {
      const wine = await services.wines.create({ name: 'Tracked Wine' });
      const otherWine = await services.wines.create({ name: 'Other Wine' });
      const vendor = await services.vendors.create({ name: 'Tracked Vendor' })

      const invoice = await services.invoices.upload({
        fileName: 'inv.pdf',
        fileType: 'pdf',
        fileDataUrl: 'data:application/pdf;base64,AA==',
      })
      // Wait for the simulated OCR/matching background step to complete.
      await new Promise((resolve) => setTimeout(resolve, 50))

      const processed = await services.invoices.get(invoice.id)
      expect(processed?.status).toBe('not_approved')

      // Force deterministic line items regardless of which sample template was used:
      // point the first line at our tracked wine, the rest at the other wine.
      await services.invoices.selectVendorMatch(invoice.id, vendor.id)
      const withLines = await services.invoices.get(invoice.id)
      const [first, ...rest] = withLines!.lineItems
      await services.invoices.selectSkuMatch(invoice.id, first.id, wine.id)
      for (const line of rest) {
        await services.invoices.selectSkuMatch(invoice.id, line.id, otherWine.id)
      }

      // Balances are 0 before approval.
      const balancesBefore = await services.wines.getBalances()
      expect(balancesBefore.find((b) => b.wine.id === wine.id)?.balanceInBottles).toBe(0)

      const approved = await services.invoices.approve(invoice.id)
      expect(approved.status).toBe('approved')

      const balancesAfter = await services.wines.getBalances()
      const trackedBalance = balancesAfter.find((b) => b.wine.id === wine.id)
      expect(trackedBalance?.balanceInBottles).toBe(first.quantity)

      const history = await services.wines.getPurchaseHistory(wine.id)
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        invoiceId: invoice.id,
        vendorName: 'Tracked Vendor',
        quantity: first.quantity,
        unitPrice: first.unitPrice,
      })
    })
  })
})
