import { beforeEach, describe, expect, it } from 'vitest'
import type { Services } from '../../types'
import { createMockServices } from '../index'
import { resetSampleInvoiceCursor } from '../sampleInvoices'

const PROCESSING_DELAY = 10
const SAMPLE_FILE = {
  fileName: 'invoice.pdf',
  fileType: 'pdf' as const,
  fileDataUrl: 'data:application/pdf;base64,AA==',
}

async function waitForProcessing(services: Services, invoiceId: string) {
  await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY * 3))
  return (await services.invoices.get(invoiceId))!
}

describe('mock invoice service', () => {
  let services: Services

  beforeEach(() => {
    services = createMockServices({ latencyMs: 0, processingDelayMs: PROCESSING_DELAY })
  })

  it('starts a new upload in "processing" status with unresolved matches', async () => {
    const invoice = await services.invoices.upload(SAMPLE_FILE)

    expect(invoice.status).toBe('processing')
    expect(invoice.extracted.vendorMatch.status).toBe('unresolved')
    expect(invoice.lineItems.length).toBeGreaterThan(0)
    expect(invoice.lineItems.every((line) => line.skuMatch.status === 'unresolved')).toBe(true)
  })

  it('completes OCR/matching in the background and moves to "not_approved"', async () => {
    const invoice = await services.invoices.upload(SAMPLE_FILE)
    const processed = await waitForProcessing(services, invoice.id)
    expect(processed.status).toBe('not_approved')
    // The seeded master data is designed so at least one sample line matches.
    expect(processed.extracted.vendorMatch.status === 'suggested' || processed.lineItems.some((l) => l.skuMatch.status === 'suggested')).toBe(true)
  })

  it('sorts by vendor name (resolved, not raw extracted text) when requested', async () => {
    services = createMockServices({ latencyMs: 0, processingDelayMs: PROCESSING_DELAY, seed: false })
    const zetaVendor = await services.vendors.create({ name: 'Zeta Vendor' })
    const alphaVendor = await services.vendors.create({ name: 'Alpha Vendor' })

    const first = await services.invoices.upload(SAMPLE_FILE)
    await waitForProcessing(services, first.id)
    await services.invoices.selectVendorMatch(first.id, zetaVendor.id)

    const second = await services.invoices.upload(SAMPLE_FILE)
    await waitForProcessing(services, second.id)
    await services.invoices.selectVendorMatch(second.id, alphaVendor.id)

    const sorted = await services.invoices.list({ sortBy: 'vendor' })
    expect(sorted.map((invoice) => invoice.id)).toEqual([second.id, first.id])
  })

  describe('with no master data to match against (deterministic unresolved matches)', () => {
    beforeEach(() => {
      services = createMockServices({ latencyMs: 0, processingDelayMs: PROCESSING_DELAY, seed: false })
    })

    it('leaves the vendor and every line item unresolved after processing', async () => {
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      const processed = await waitForProcessing(services, invoice.id)
      expect(processed.extracted.vendorMatch).toMatchObject({ vendorId: null, status: 'unresolved' })
      expect(processed.lineItems.every((line) => line.skuMatch.status === 'unresolved')).toBe(true)
    })

    it('confirmVendorMatch rejects when there is no suggestion', async () => {
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      await waitForProcessing(services, invoice.id)
      await expect(services.invoices.confirmVendorMatch(invoice.id)).rejects.toThrow(/no suggested vendor/i)
    })

    it('confirmSkuMatch rejects when there is no suggestion', async () => {
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      const processed = await waitForProcessing(services, invoice.id)
      await expect(services.invoices.confirmSkuMatch(invoice.id, processed.lineItems[0].id)).rejects.toThrow(
        /no suggested wine sku/i,
      )
    })

    it('approve rejects when the vendor is unresolved', async () => {
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      await waitForProcessing(services, invoice.id)
      await expect(services.invoices.approve(invoice.id)).rejects.toThrow(/vendor/i)
    })

    it('approve rejects when a line item is unresolved even once the vendor is set', async () => {
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      await waitForProcessing(services, invoice.id)
      const vendor = await services.vendors.create({ name: 'Manually Chosen Vendor' })
      await services.invoices.selectVendorMatch(invoice.id, vendor.id)
      await expect(services.invoices.approve(invoice.id)).rejects.toThrow(/wine sku/i)
    })
  })

  it('selectVendorMatch overrides the match with status "changed" and null confidence', async () => {
    const invoice = await services.invoices.upload(SAMPLE_FILE)
    await waitForProcessing(services, invoice.id)

    const vendor = await services.vendors.create({ name: 'Manually Chosen Vendor' })
    const updated = await services.invoices.selectVendorMatch(invoice.id, vendor.id)

    expect(updated.extracted.vendorMatch).toMatchObject({
      vendorId: vendor.id,
      confidence: null,
      status: 'changed',
    })
  })

  it('selectSkuMatch overrides a single line item without touching the others', async () => {
    const invoice = await services.invoices.upload(SAMPLE_FILE)
    const processed = await waitForProcessing(services, invoice.id)
    const [first, second] = processed.lineItems
    const wine = await services.wines.create({ name: 'Manually Chosen Wine' })

    const updated = await services.invoices.selectSkuMatch(invoice.id, first.id, wine.id)
    const updatedFirst = updated.lineItems.find((l) => l.id === first.id)
    const updatedSecond = updated.lineItems.find((l) => l.id === second.id)

    expect(updatedFirst?.skuMatch).toMatchObject({ wineId: wine.id, confidence: null, status: 'changed' })
    expect(updatedSecond?.skuMatch).toEqual(second.skuMatch)
  })

  describe('approve (happy path)', () => {
    it('rejects approval while still processing', async () => {
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      await expect(services.invoices.approve(invoice.id)).rejects.toThrow(/still processing/i)
    })

    it('succeeds once the vendor and every line item are resolved, and is idempotent', async () => {
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      const processed = await waitForProcessing(services, invoice.id)

      const vendor = await services.vendors.create({ name: 'Approve Test Vendor' })
      await services.invoices.selectVendorMatch(invoice.id, vendor.id)

      const wine = await services.wines.create({ name: 'Approve Test Wine' })
      for (const line of processed.lineItems) {
        await services.invoices.selectSkuMatch(invoice.id, line.id, wine.id)
      }

      const approvedOnce = await services.invoices.approve(invoice.id)
      expect(approvedOnce.status).toBe('approved')
      expect(approvedOnce.approvedAt).not.toBeNull()

      const approvedAgain = await services.invoices.approve(invoice.id)
      expect(approvedAgain.approvedAt).toBe(approvedOnce.approvedAt)
    })

    it('auto-confirms any AI-suggested matches the user never explicitly clicked Confirm on', async () => {
      // The user should only have to touch matches they want to correct;
      // approving accepts every remaining suggestion as-is. Pin the sample
      // template so every line resolves against the seeded master data.
      resetSampleInvoiceCursor()
      const invoice = await services.invoices.upload(SAMPLE_FILE)
      const processed = await waitForProcessing(services, invoice.id)
      expect(processed.extracted.vendorMatch.status).toBe('suggested')
      expect(processed.lineItems.every((line) => line.skuMatch.status === 'suggested')).toBe(true)

      const approved = await services.invoices.approve(invoice.id)
      expect(approved.extracted.vendorMatch.status).toBe('confirmed')
      expect(approved.lineItems.every((line) => line.skuMatch.status === 'confirmed')).toBe(true)
    })
  })

  it('every mutating call returns a new object, never the previous reference', async () => {
    // Regression test: the store used to mutate invoices in place, which made
    // React Query think nothing had changed and the UI never re-rendered.
    const invoice = await services.invoices.upload(SAMPLE_FILE)
    const processed = await waitForProcessing(services, invoice.id)
    expect(processed).not.toBe(invoice)

    const vendor = await services.vendors.create({ name: 'Ref Check Vendor' })
    const afterVendorSelect = await services.invoices.selectVendorMatch(invoice.id, vendor.id)
    expect(afterVendorSelect).not.toBe(processed)

    const wine = await services.wines.create({ name: 'Ref Check Wine' })
    const afterSkuSelect = await services.invoices.selectSkuMatch(invoice.id, processed.lineItems[0].id, wine.id)
    expect(afterSkuSelect).not.toBe(afterVendorSelect)
  })
})
