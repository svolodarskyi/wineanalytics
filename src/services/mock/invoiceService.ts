import type { Invoice, InvoiceStatus } from '../../types'
import type { InvoiceService, OpenAiService } from '../types'
import { delay } from './delay'
import type { MockStore } from './store'

export interface MockInvoiceServiceOptions {
  latencyMs: number
  /** How long simulated OCR + matching takes to complete after upload. */
  processingDelayMs: number
}

function requireInvoice(store: MockStore, id: string): Invoice {
  const invoice = store.findInvoice(id)
  if (!invoice) throw new Error('Invoice not found.')
  return invoice
}

export function createMockInvoiceService(
  store: MockStore,
  options: MockInvoiceServiceOptions,
  openai: OpenAiService,
): InvoiceService {
  const { latencyMs, processingDelayMs } = options

  return {
    async list(options?: { status?: InvoiceStatus | 'all' }): Promise<Invoice[]> {
      await delay(latencyMs)
      let results = store.invoices
      if (options?.status && options.status !== 'all') {
        results = results.filter((invoice) => invoice.status === options.status)
      }
      return [...results].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    },

    async get(id: string): Promise<Invoice | null> {
      await delay(latencyMs)
      return store.findInvoice(id) ?? null
    },

    async upload(input: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }): Promise<Invoice> {
      await delay(latencyMs)

      // Photos/scans go to OpenAI for real extraction. PDFs stay on the
      // canned simulation for now - vision models need an image, not a PDF,
      // and rendering PDFs to images client-side is a separate piece of work.
      if (input.fileType === 'image') {
        const invoice = store.createEmptyProcessingInvoice(input)
        openai
          .extractInvoice({ fileName: input.fileName, imageDataUrl: input.fileDataUrl, invoiceId: invoice.id })
          .then((extraction) => store.completeProcessingFromExtraction(invoice.id, extraction))
          .catch(() => {
            // Failure is already captured in the OpenAI request log (see
            // Settings > AI Requests); leave the invoice fully unresolved so
            // the user can still fill it in by hand instead of getting stuck.
            store.completeProcessingFromExtraction(invoice.id, {
              vendorNameRaw: '',
              invoiceDate: null,
              totalAmount: 0,
              lines: [],
              additionalCharges: [],
            })
          })
        return invoice
      }

      const invoice = store.createProcessingInvoice(input)
      setTimeout(() => store.completeProcessing(invoice.id), processingDelayMs)
      return invoice
    },

    async confirmVendorMatch(invoiceId: string): Promise<Invoice> {
      await delay(latencyMs)
      const invoice = requireInvoice(store, invoiceId)
      if (!invoice.extracted.vendorMatch.vendorId) {
        throw new Error('There is no suggested vendor to confirm.')
      }
      return store.updateInvoice(invoiceId, (current) => ({
        ...current,
        extracted: {
          ...current.extracted,
          vendorMatch: { ...current.extracted.vendorMatch, status: 'confirmed' },
        },
      }))
    },

    async selectVendorMatch(invoiceId: string, vendorId: string): Promise<Invoice> {
      await delay(latencyMs)
      requireInvoice(store, invoiceId)
      const vendor = store.findVendor(vendorId)
      if (!vendor) throw new Error('Vendor not found.')
      return store.updateInvoice(invoiceId, (current) => ({
        ...current,
        extracted: {
          ...current.extracted,
          vendorMatch: { ...current.extracted.vendorMatch, vendorId: vendor.id, confidence: null, status: 'changed' },
        },
      }))
    },

    async confirmSkuMatch(invoiceId: string, lineItemId: string): Promise<Invoice> {
      await delay(latencyMs)
      const invoice = requireInvoice(store, invoiceId)
      const line = invoice.lineItems.find((item) => item.id === lineItemId)
      if (!line) throw new Error('Invoice line item not found.')
      if (!line.skuMatch.wineId) {
        throw new Error('There is no suggested wine SKU to confirm.')
      }
      return store.updateInvoice(invoiceId, (current) => ({
        ...current,
        lineItems: current.lineItems.map((item) =>
          item.id === lineItemId ? { ...item, skuMatch: { ...item.skuMatch, status: 'confirmed' } } : item,
        ),
      }))
    },

    async selectSkuMatch(invoiceId: string, lineItemId: string, wineId: string): Promise<Invoice> {
      await delay(latencyMs)
      const invoice = requireInvoice(store, invoiceId)
      const line = invoice.lineItems.find((item) => item.id === lineItemId)
      if (!line) throw new Error('Invoice line item not found.')
      const wine = store.findWine(wineId)
      if (!wine) throw new Error('Wine not found.')
      return store.updateInvoice(invoiceId, (current) => ({
        ...current,
        lineItems: current.lineItems.map((item) =>
          item.id === lineItemId
            ? { ...item, skuMatch: { wineId: wine.id, confidence: null, status: 'changed' } }
            : item,
        ),
      }))
    },

    async approve(invoiceId: string): Promise<Invoice> {
      await delay(latencyMs)
      const invoice = requireInvoice(store, invoiceId)
      if (invoice.status === 'approved') return invoice
      if (invoice.status === 'processing') {
        throw new Error('Invoice is still processing.')
      }
      if (!invoice.extracted.vendorMatch.vendorId) {
        throw new Error('Resolve the vendor match before approving.')
      }
      const unresolvedLine = invoice.lineItems.find((line) => !line.skuMatch.wineId)
      if (unresolvedLine) {
        throw new Error("Resolve every line item's wine SKU before approving.")
      }
      // Approving accepts every remaining AI suggestion as-is, so the user
      // only has to click Confirm/Change on the matches they want to correct.
      return store.updateInvoice(invoiceId, (current) => ({
        ...current,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        extracted: {
          ...current.extracted,
          vendorMatch:
            current.extracted.vendorMatch.status === 'suggested'
              ? { ...current.extracted.vendorMatch, status: 'confirmed' }
              : current.extracted.vendorMatch,
        },
        lineItems: current.lineItems.map((item) =>
          item.skuMatch.status === 'suggested' ? { ...item, skuMatch: { ...item.skuMatch, status: 'confirmed' } } : item,
        ),
      }))
    },
  }
}
