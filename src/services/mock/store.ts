import type {
  AdditionalCharge,
  Invoice,
  InvoiceLineItem,
  OpenAiRequestLog,
  PourSize,
  SalesAlertThreshold,
  Vendor,
  VendorMatch,
  Wine,
  WineAlertThreshold,
  WineSale,
} from '../../types'
import { createId } from './ids'
import { nextSampleInvoice } from './sampleInvoices'
import { seedInvoicesAndSales } from './seedActivity'
import { seedPourSizes, seedVendors, seedWines } from './seedData'
import { confidenceFromScore, findBestMatch } from './similarity'

export interface MockStoreOptions {
  seed?: boolean
  /**
   * Also populates a few months of approved invoices and manual sales
   * against the seeded master data, so there's something to build inventory
   * and sales analytics against. Off by default - several tests rely on a
   * freshly-seeded store having empty invoices/sales, and this is purely a
   * demo/dev-server enhancement (see src/services/index.ts).
   */
  seedActivity?: boolean
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
  openAiLogs: OpenAiRequestLog[] = []
  alertThresholds: WineAlertThreshold[] = []
  pourSizes: PourSize[]
  sales: WineSale[] = []
  salesAlertThreshold: SalesAlertThreshold = { minVolumeMl: null, maxVolumeMl: null }

  constructor(options: MockStoreOptions = {}) {
    const seed = options.seed ?? true
    this.wines = seed ? seedWines() : []
    this.vendors = seed ? seedVendors() : []
    this.pourSizes = seed ? seedPourSizes() : []

    if (seed && options.seedActivity) {
      const { invoices, sales, alertThresholds } = seedInvoicesAndSales(this.wines, this.vendors, this.pourSizes)
      this.invoices = invoices
      this.sales = sales
      this.alertThresholds = alertThresholds
    }
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

  findPourSize(id: string): PourSize | undefined {
    return this.pourSizes.find((pourSize) => pourSize.id === id)
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

  updatePourSize(id: string, updater: (pourSize: PourSize) => PourSize): PourSize {
    const index = this.pourSizes.findIndex((pourSize) => pourSize.id === id)
    if (index === -1) throw new Error('Pour size not found.')
    const updated = updater(this.pourSizes[index])
    this.pourSizes[index] = updated
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

  /** True if any recorded sale used this pour size. */
  isPourSizeInUse(id: string): boolean {
    return this.sales.some((sale) => sale.pourSizeId === id)
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

  deleteInvoice(id: string): void {
    const index = this.invoices.findIndex((invoice) => invoice.id === id)
    if (index === -1) throw new Error('Invoice not found.')
    this.invoices.splice(index, 1)
  }

  deletePourSize(id: string): void {
    const index = this.pourSizes.findIndex((pourSize) => pourSize.id === id)
    if (index === -1) throw new Error('Pour size not found.')
    this.pourSizes.splice(index, 1)
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
        additionalCharges: [],
      },
      lineItems: sample.lines.map((line) => ({
        id: createId('line'),
        itemNameRaw: line.itemNameRaw,
        volumeMlRaw: line.volumeMlRaw ?? null,
        categoryRaw: line.categoryRaw ?? null,
        styleRaw: line.styleRaw ?? null,
        countryRaw: line.countryRaw ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.quantity * line.unitPrice,
        packSize: 1,
        skuMatch: { wineId: null, confidence: null, status: 'unresolved' },
        excluded: false,
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

  /** Creates a new invoice in `processing` status with nothing extracted yet, for the real-OpenAI upload path. */
  createEmptyProcessingInvoice(input: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }): Invoice {
    const invoice: Invoice = {
      id: createId('invoice'),
      fileName: input.fileName,
      fileType: input.fileType,
      fileDataUrl: input.fileDataUrl,
      uploadedAt: new Date().toISOString(),
      status: 'processing',
      approvedAt: null,
      extracted: {
        invoiceDate: null,
        totalAmount: null,
        vendorMatch: { vendorNameRaw: '', vendorId: null, confidence: null, status: 'unresolved' },
        additionalCharges: [],
      },
      lineItems: [],
    }
    this.invoices.unshift(invoice)
    return invoice
  }

  /** Fills in a `processing` invoice from a real OpenAI extraction result and runs vendor/SKU matching against current master data. */
  completeProcessingFromExtraction(
    invoiceId: string,
    extraction: {
      vendorNameRaw: string
      invoiceDate: string | null
      totalAmount: number
      lines: {
        itemNameRaw: string
        volumeMlRaw: number | null
        categoryRaw: Wine['category']
        styleRaw: Wine['style']
        countryRaw: Wine['country']
        quantity: number
        unitPrice: number
        lineTotal: number
        packSize: number
      }[]
      additionalCharges: AdditionalCharge[]
    },
  ): void {
    const invoice = this.findInvoice(invoiceId)
    if (!invoice || invoice.status !== 'processing') return

    this.updateInvoice(invoiceId, (current) => ({
      ...current,
      status: 'not_approved',
      extracted: {
        invoiceDate: extraction.invoiceDate,
        totalAmount: extraction.totalAmount,
        vendorMatch: this.vendorMatchFor(extraction.vendorNameRaw),
        additionalCharges: extraction.additionalCharges,
      },
      lineItems: extraction.lines.map((line) => ({
        id: createId('line'),
        itemNameRaw: line.itemNameRaw,
        volumeMlRaw: line.volumeMlRaw,
        categoryRaw: line.categoryRaw,
        styleRaw: line.styleRaw,
        countryRaw: line.countryRaw,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        packSize: line.packSize,
        skuMatch: this.skuMatchFor(line.itemNameRaw),
        excluded: false,
      })),
    }))
  }

  addOpenAiLog(entry: OpenAiRequestLog): void {
    this.openAiLogs = [entry, ...this.openAiLogs]
  }

  /**
   * Purchased (approved invoices) minus sold-bottle-equivalent. Shared by
   * wineService.getBalances() and alertService.listInventoryAlerts().
   * A wine with no volumeMl can't convert its sales to a bottle-equivalent,
   * so it falls back to purchased-only rather than guessing - the missing
   * volume is already surfaced separately via the data-quality alert.
   */
  balanceInBottles(wineId: string): number {
    const purchased = this.invoices
      .filter((invoice) => invoice.status === 'approved')
      .flatMap((invoice) => invoice.lineItems)
      .filter((line) => line.skuMatch.wineId === wineId && !line.excluded)
      // A line's quantity is pack count as printed - real units received is quantity * packSize (1 for items sold individually).
      .reduce((sum, line) => sum + line.quantity * line.packSize, 0)

    const wine = this.findWine(wineId)
    if (!wine?.volumeMl) return purchased

    const soldMl = this.sales
      .filter((sale) => sale.wineId === wineId)
      .reduce((sum, sale) => sum + sale.volumeMl * sale.quantity, 0)
    return purchased - soldMl / wine.volumeMl
  }

  findThreshold(wineId: string): WineAlertThreshold | undefined {
    return this.alertThresholds.find((threshold) => threshold.wineId === wineId)
  }

  /** Creates or updates the one threshold a wine can have, reactivating it if it was deactivated. */
  upsertThreshold(wineId: string, minBottles: number): WineAlertThreshold {
    const index = this.alertThresholds.findIndex((threshold) => threshold.wineId === wineId)
    if (index !== -1) {
      const updated: WineAlertThreshold = { ...this.alertThresholds[index], minBottles, active: true }
      this.alertThresholds = this.alertThresholds.map((threshold, i) => (i === index ? updated : threshold))
      return updated
    }
    const created: WineAlertThreshold = {
      id: createId('threshold'),
      wineId,
      minBottles,
      active: true,
      createdAt: new Date().toISOString(),
    }
    this.alertThresholds = [...this.alertThresholds, created]
    return created
  }

  setThresholdActive(wineId: string, active: boolean): WineAlertThreshold {
    const index = this.alertThresholds.findIndex((threshold) => threshold.wineId === wineId)
    if (index === -1) throw new Error('Alert level not found.')
    const updated: WineAlertThreshold = { ...this.alertThresholds[index], active }
    this.alertThresholds = this.alertThresholds.map((threshold, i) => (i === index ? updated : threshold))
    return updated
  }

  deleteThreshold(wineId: string): void {
    this.alertThresholds = this.alertThresholds.filter((threshold) => threshold.wineId !== wineId)
  }

  addSale(sale: WineSale): void {
    this.sales = [sale, ...this.sales]
  }

  updateSale(id: string, updater: (sale: WineSale) => WineSale): WineSale {
    const index = this.sales.findIndex((sale) => sale.id === id)
    if (index === -1) throw new Error('Sale not found.')
    const updated = updater(this.sales[index])
    this.sales = this.sales.map((sale, i) => (i === index ? updated : sale))
    return updated
  }

  deleteSale(id: string): void {
    this.sales = this.sales.filter((sale) => sale.id !== id)
  }

  setSalesAlertThreshold(threshold: SalesAlertThreshold): void {
    this.salesAlertThreshold = threshold
  }
}
