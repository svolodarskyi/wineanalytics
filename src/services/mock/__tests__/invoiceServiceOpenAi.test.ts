import { describe, expect, it, vi } from 'vitest'
import type { OpenAiService } from '../../types'
import { createMockInvoiceService } from '../invoiceService'
import { MockStore } from '../store'

const SAMPLE_IMAGE = {
  fileName: 'invoice.jpg',
  fileType: 'image' as const,
  fileDataUrl: 'data:image/jpeg;base64,AA==',
}

function waitForProcessing(store: MockStore, invoiceId: string) {
  return new Promise<void>((resolve) => {
    const check = () => {
      const invoice = store.findInvoice(invoiceId)
      if (invoice && invoice.status !== 'processing') {
        resolve()
        return
      }
      setTimeout(check, 5)
    }
    check()
  })
}

describe('mock invoice service - image uploads via OpenAI', () => {
  it('fills in the invoice from a successful OpenAI extraction', async () => {
    const store = new MockStore({ seed: false })
    const fakeOpenAi: OpenAiService = {
      extractInvoice: vi.fn().mockResolvedValue({
        vendorNameRaw: 'Test Vendor',
        invoiceDate: '2026-01-01',
        totalAmount: 42,
        lines: [{ itemNameRaw: 'Test Wine', quantity: 2, unitPrice: 21, lineTotal: 42 }],
        additionalCharges: [{ description: 'Sales Tax', amount: 3.5 }],
      }),
      listLogs: vi.fn().mockResolvedValue([]),
    }
    const invoices = createMockInvoiceService(store, { latencyMs: 0, processingDelayMs: 1000 }, fakeOpenAi)

    const invoice = await invoices.upload(SAMPLE_IMAGE)
    expect(invoice.status).toBe('processing')

    await waitForProcessing(store, invoice.id)
    const processed = store.findInvoice(invoice.id)!
    expect(processed.status).toBe('not_approved')
    expect(processed.extracted.vendorMatch.vendorNameRaw).toBe('Test Vendor')
    expect(processed.extracted.totalAmount).toBe(42)
    expect(processed.lineItems).toHaveLength(1)
    expect(processed.lineItems[0].itemNameRaw).toBe('Test Wine')
    expect(processed.extracted.additionalCharges).toEqual([{ description: 'Sales Tax', amount: 3.5 }])
  })

  it('leaves the invoice fully unresolved, not stuck, when extraction fails', async () => {
    const store = new MockStore({ seed: false })
    const fakeOpenAi: OpenAiService = {
      extractInvoice: vi.fn().mockRejectedValue(new Error('boom')),
      listLogs: vi.fn().mockResolvedValue([]),
    }
    const invoices = createMockInvoiceService(store, { latencyMs: 0, processingDelayMs: 1000 }, fakeOpenAi)

    const invoice = await invoices.upload(SAMPLE_IMAGE)
    await waitForProcessing(store, invoice.id)
    const processed = store.findInvoice(invoice.id)!
    expect(processed.status).toBe('not_approved')
    expect(processed.lineItems).toHaveLength(0)
    expect(processed.extracted.vendorMatch.status).toBe('unresolved')
  })

  it('never calls OpenAI for pdf uploads', async () => {
    const store = new MockStore({ seed: false })
    const fakeOpenAi: OpenAiService = {
      extractInvoice: vi.fn(),
      listLogs: vi.fn().mockResolvedValue([]),
    }
    const invoices = createMockInvoiceService(store, { latencyMs: 0, processingDelayMs: 5 }, fakeOpenAi)

    await invoices.upload({ fileName: 'invoice.pdf', fileType: 'pdf', fileDataUrl: 'data:application/pdf;base64,AA==' })
    expect(fakeOpenAi.extractInvoice).not.toHaveBeenCalled()
  })
})
