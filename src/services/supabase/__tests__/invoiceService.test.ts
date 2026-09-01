import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { OpenAiService } from '../../types'
import { createSupabaseInvoiceService } from '../invoiceService'
import { fakeStorage, flushAsync, routedSupabaseFrom } from './testHelpers'

const NEW_ROW = {
  id: 'inv1',
  file_name: 'invoice.pdf',
  file_type: 'pdf',
  file_path: 'inv1.pdf',
  uploaded_at: '2026-01-01T00:00:00.000Z',
  status: 'processing',
  approved_at: null,
  invoice_date: null,
  total_amount: null,
  vendor_name_raw: '',
  vendor_id: null,
  vendor_confidence: null,
  vendor_match_status: 'unresolved',
  wine_invoice_line_items: [],
  wine_invoice_additional_charges: [],
}

function supabaseWithFrom(from: ReturnType<typeof routedSupabaseFrom>, storage = fakeStorage()) {
  return { from, storage } as unknown as SupabaseClient
}

function noopOpenAi(): OpenAiService {
  return { extractInvoice: vi.fn(), listLogs: vi.fn() }
}

describe('supabase invoice service', () => {
  it('upload (pdf) inserts the row, uploads the file, and lands fully unresolved with no OpenAI call', async () => {
    const openai = noopOpenAi()
    const from = routedSupabaseFrom({
      wine_invoices: [{ data: NEW_ROW }, { error: null }],
      wine_vendors: [{ data: [] }],
    })
    const storage = fakeStorage()
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from, storage), openai)

    const invoice = await invoices.upload({ fileName: 'invoice.pdf', fileType: 'pdf', fileDataUrl: 'data:application/pdf;base64,AA==' })
    expect(invoice.status).toBe('processing')
    expect(storage.bucketApi.upload).toHaveBeenCalled()
    expect(openai.extractInvoice).not.toHaveBeenCalled()

    await flushAsync()
    const invoicesUpdateBuilder = from.mock.results[2].value
    expect(invoicesUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'not_approved', vendor_name_raw: '', vendor_match_status: 'unresolved' }),
    )
  })

  it('upload (image) extracts via OpenAI and writes line items + additional charges on success', async () => {
    const openai: OpenAiService = {
      extractInvoice: vi.fn().mockResolvedValue({
        vendorNameRaw: 'Acme Wine Co',
        invoiceDate: '2026-01-15',
        totalAmount: 55,
        lines: [{ itemNameRaw: 'Test Wine', quantity: 2, unitPrice: 25, lineTotal: 50 }],
        additionalCharges: [{ description: 'Sales Tax', amount: 5 }],
      }),
      listLogs: vi.fn(),
    }
    const from = routedSupabaseFrom({
      wine_invoices: [{ data: { ...NEW_ROW, file_type: 'image' } }, { error: null }],
      wine_vendors: [{ data: [] }],
      wine_wines: [{ data: [] }],
      wine_invoice_line_items: [{ error: null }],
      wine_invoice_additional_charges: [{ error: null }],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), openai)

    await invoices.upload({ fileName: 'invoice.jpg', fileType: 'image', fileDataUrl: 'data:image/jpeg;base64,AA==' })
    await flushAsync()

    expect(openai.extractInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'invoice.jpg', invoiceId: expect.any(String) }),
    )
    const lineItemsBuilder = from.mock.results[4].value
    expect(lineItemsBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ item_name_raw: 'Test Wine', quantity: 2 }),
    ])
    const chargesBuilder = from.mock.results[5].value
    expect(chargesBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ description: 'Sales Tax', amount: 5 }),
    ])
  })

  it('upload (image) lands fully unresolved when OpenAI extraction fails', async () => {
    const openai: OpenAiService = {
      extractInvoice: vi.fn().mockRejectedValue(new Error('no key')),
      listLogs: vi.fn(),
    }
    const from = routedSupabaseFrom({
      wine_invoices: [{ data: { ...NEW_ROW, file_type: 'image' } }, { error: null }],
      wine_vendors: [{ data: [] }],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), openai)

    await invoices.upload({ fileName: 'invoice.jpg', fileType: 'image', fileDataUrl: 'data:image/jpeg;base64,AA==' })
    await flushAsync()

    const invoicesUpdateBuilder = from.mock.results[2].value
    expect(invoicesUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'not_approved', vendor_name_raw: '' }),
    )
  })

  it('selectVendorMatch maps a foreign-key violation to "Vendor not found."', async () => {
    const from = routedSupabaseFrom({
      wine_invoices: [{ error: { message: 'violates foreign key constraint', code: '23503' } }],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), noopOpenAi())
    await expect(invoices.selectVendorMatch('inv1', 'missing-vendor')).rejects.toThrow(/vendor not found/i)
  })

  it('updateInvoiceDate corrects the extracted date by hand', async () => {
    const from = routedSupabaseFrom({
      wine_invoices: [{ error: null }, { data: { ...NEW_ROW, invoice_date: '2026-03-15' } }],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), noopOpenAi())
    const updated = await invoices.updateInvoiceDate('inv1', '2026-03-15')
    expect(updated.extracted.invoiceDate).toBe('2026-03-15')
    const updateBuilder = from.mock.results[0].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ invoice_date: '2026-03-15' })
  })

  describe('approve', () => {
    const resolvedInvoiceRow = {
      ...NEW_ROW,
      status: 'not_approved',
      vendor_id: 'v1',
      vendor_match_status: 'suggested',
      wine_invoice_line_items: [
        { id: 'li1', item_name_raw: 'Wine A', quantity: 1, unit_price: 10, line_total: 10, wine_id: 'w1', sku_confidence: 'high', sku_match_status: 'suggested' },
      ],
    }

    it('rejects while still processing', async () => {
      const from = routedSupabaseFrom({ wine_invoices: [{ data: { ...NEW_ROW, status: 'processing' } }] })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), noopOpenAi())
      await expect(invoices.approve('inv1')).rejects.toThrow(/still processing/i)
    })

    it('rejects when the vendor is unresolved', async () => {
      const from = routedSupabaseFrom({ wine_invoices: [{ data: { ...NEW_ROW, status: 'not_approved' } }] })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), noopOpenAi())
      await expect(invoices.approve('inv1')).rejects.toThrow(/vendor/i)
    })

    it('rejects when a line item is unresolved', async () => {
      const from = routedSupabaseFrom({
        wine_invoices: [
          {
            data: {
              ...NEW_ROW,
              status: 'not_approved',
              vendor_id: 'v1',
              wine_invoice_line_items: [{ ...resolvedInvoiceRow.wine_invoice_line_items[0], wine_id: null, sku_match_status: 'unresolved' }],
            },
          },
        ],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), noopOpenAi())
      await expect(invoices.approve('inv1')).rejects.toThrow(/wine sku/i)
    })

    it('approves, auto-confirming suggested matches, and is idempotent', async () => {
      const from = routedSupabaseFrom({
        wine_invoices: [
          { data: resolvedInvoiceRow },
          { error: null },
          { data: { ...resolvedInvoiceRow, status: 'approved', vendor_match_status: 'confirmed' } },
        ],
        wine_invoice_line_items: [{ error: null }],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), noopOpenAi())

      const approved = await invoices.approve('inv1')
      expect(approved.status).toBe('approved')

      const invoicesUpdateBuilder = from.mock.results[1].value
      expect(invoicesUpdateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved', vendor_match_status: 'confirmed' }),
      )
      const lineItemsUpdateBuilder = from.mock.results[2].value
      expect(lineItemsUpdateBuilder.update).toHaveBeenCalledWith({ sku_match_status: 'confirmed' })
    })

    it('returns the invoice as-is without further writes when already approved', async () => {
      const from = routedSupabaseFrom({ wine_invoices: [{ data: { ...resolvedInvoiceRow, status: 'approved' } }] })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from), noopOpenAi())
      const result = await invoices.approve('inv1')
      expect(result.status).toBe('approved')
      expect(from).toHaveBeenCalledTimes(1)
    })
  })
})
