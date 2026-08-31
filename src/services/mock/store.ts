import type { Invoice, InvoiceLineItem, Vendor, VendorMatch, Wine } from '../../types'
import { createId } from './ids'
import { nextSampleInvoice } from './sampleInvoices'
import { seedVendors, seedWines } from './seedData'
import { confidenceFromScore, findBestMatch } from './similarity'

export interface MockStoreOptions {
  seed?: boolean
}

/**
 * In-memory "database" backing the mock services. Each call to
 * `createMockServices` gets its own instance, so app state and test state
 * never leak into each other.
 */
export class MockStore {
  wines: Wine[]
  vendors: Vendor[]
  invoices: Invoice[] = []

  constructor(options: MockStoreOptions = {}) {
    const seed = options.seed ?? true
    this.wines = seed ? seedWines() : []
    this.vendors = seed ? seedVendors() : []
  }

  findWine(id: string): Wine | undefined {
    return this.wines.find((wine) => wine.id === id)
  }

  findVendor(id: string): Vendor | undefined {
    return this.vendors.find((vendor) => vendor.id === id)
  }

  findInvoice(id: string): Invoice | undefined {
    return this.invoices.find((invoice) => invoice.id === id)
  }

  /**
   * Replaces an invoice with a new object built from `updater`. Consumers
   * (React Query's structural sharing in particular) tell whether data
   * changed by reference, so every write replaces rather than mutates.
   */
  updateInvoice(id: string, updater: (invoice: Invoice) => Invoice): Invoice {
    const index = this.invoices.findIndex((invoice) => invoice.id === id)
    if (index === -1) throw new Error('Invoice not found.')
    const updated = updater(this.invoices[index])
    this.invoices[index] = updated
    return updated
  }

  updateWine(id: string, updater: (wine: Wine) => Wine): Wine {
    const index = this.wines.findIndex((wine) => wine.id === id)
    if (index === -1) throw new Error('Wine not found.')
    const updated = updater(this.wines[index])
    this.wines[index] = updated
    return updated
  }

  updateVendor(id: string, updater: (vendor: Vendor) => Vendor): Vendor {
    const index = this.vendors.findIndex((vendor) => vendor.id === id)
    if (index === -1) throw new Error('Vendor not found.')
    const updated = updater(this.vendors[index])
    this.vendors[index] = updated
    return updated
  }

  /** True if any invoice (any status) has a line item matched to this wine. */
  isWineInUse(id: string): boolean {
    return this.invoices.some((invoice) => invoice.lineItems.some((line) => line.skuMatch.wineId === id))
  }

  /** True if any invoice (any status) has its vendor matched to this vendor. */
  isVendorInUse(id: string): boolean {
    return this.invoices.some((invoice) => invoice.extracted.vendorMatch.vendorId === id)
  }

  deleteWine(id: string): void {
    const index = this.wines.findIndex((wine) => wine.id === id)
    if (index === -1) throw new Error('Wine not found.')
    this.wines.splice(index, 1)
  }

  deleteVendor(id: string): void {
    const index = this.vendors.findIndex((vendor) => vendor.id === id)
    if (index === -1) throw new Error('Vendor not found.')
    this.vendors.splice(index, 1)
  }

  vendorMatchFor(rawName: string): VendorMatch {
    const best = findBestMatch(rawName, this.vendors)
    const confidence = best ? confidenceFromScore(best.score) : null
    return {
      vendorNameRaw: rawName,
      vendorId: confidence ? (best?.id ?? null) : null,
      confidence,
      status: confidence ? 'suggested' : 'unresolved',
    }
  }

  skuMatchFor(rawName: string): InvoiceLineItem['skuMatch'] {
    const best = findBestMatch(rawName, this.wines)
    const confidence = best ? confidenceFromScore(best.score) : null
    return {
      wineId: confidence ? (best?.id ?? null) : null,
      confidence,
      status: confidence ? 'suggested' : 'unresolved',
    }
  }

  /** Creates a new invoice in `processing` status with a canned OCR result queued up. */
  createProcessingInvoice(input: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }): Invoice {
    const sample = nextSampleInvoice()
    const invoiceDate = new Date(Date.now() - sample.daysAgo * 24 * 60 * 60 * 1000).toISOString()

    const invoice: Invoice = {
      id: createId('invoice'),
      fileName: input.fileName,
      fileType: input.fileType,
      fileDataUrl: input.fileDataUrl,
      uploadedAt: new Date().toISOString(),
      status: 'processing',
      approvedAt: null,
      extracted: {
        invoiceDate,
        totalAmount: sample.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
        vendorMatch: {
          vendorNameRaw: sample.vendorNameRaw,
          vendorId: null,
          confidence: null,
          status: 'unresolved',
        },
      },
      lineItems: sample.lines.map((line) => ({
        id: createId('line'),
        itemNameRaw: line.itemNameRaw,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.quantity * line.unitPrice,
        skuMatch: { wineId: null, confidence: null, status: 'unresolved' },
      })),
    }

    this.invoices.unshift(invoice)
    return invoice
  }

  /** Simulates OCR + vendor/SKU matching completing, using the current master data. */
  completeProcessing(invoiceId: string): void {
    const invoice = this.findInvoice(invoiceId)
    if (!invoice || invoice.status !== 'processing') return

    this.updateInvoice(invoiceId, (current) => ({
      ...current,
      status: 'not_approved',
      extracted: {
        ...current.extracted,
        vendorMatch: this.vendorMatchFor(current.extracted.vendorMatch.vendorNameRaw),
      },
      lineItems: current.lineItems.map((line) => ({
        ...line,
        skuMatch: this.skuMatchFor(line.itemNameRaw),
      })),
    }))
  }
}
