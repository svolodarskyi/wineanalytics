import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseInvoiceService } from '../invoiceService'
import { fakeStorage, routedSupabaseFrom } from './testHelpers'

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

describe('supabase invoice service', () => {
  // OCR + matching + line-item writes now happen server-side, kicked off by a
  // Postgres trigger on this insert (see supabase/functions/process-invoice) -
  // upload() itself just uploads the file and inserts the row.
  it('upload inserts the row, uploads the file, and returns it as processing with no further writes', async () => {
    const from = routedSupabaseFrom({ wine_invoices: [{ data: { ...NEW_ROW, file_type: 'image' } }] })
    const storage = fakeStorage()
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from, storage))

    const invoice = await invoices.upload({ fileName: 'invoice.jpg', fileType: 'image', fileDataUrl: 'data:image/jpeg;base64,AA==' })

    expect(invoice.status).toBe('processing')
    expect(storage.bucketApi.upload).toHaveBeenCalled()
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('get requests line items ordered by position, so rows can\'t reshuffle between refetches', async () => {
    // Regression: without an explicit ORDER BY, Postgres/PostgREST make no
    // guarantee about the order a joined resource comes back in - any
    // refetch (confirming a match, excluding a line, editing pack size)
    // could silently return the line items in a different order than
    // before, making rows visibly jump around on the review page even
    // though nothing about them changed.
    const from = routedSupabaseFrom({ wine_invoices: [{ data: NEW_ROW }] })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))

    await invoices.get('inv1')

    const builder = from.mock.results[0].value
    expect(builder.order).toHaveBeenCalledWith('position', { foreignTable: 'wine_invoice_line_items' })
  })

  it('selectVendorMatch maps a foreign-key violation to "Vendor not found."', async () => {
    const from = routedSupabaseFrom({
      wine_invoices: [{ error: null }, { error: { message: 'violates foreign key constraint', code: '23503' } }],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
    await expect(invoices.selectVendorMatch('inv1', 'missing-vendor')).rejects.toThrow(/vendor not found/i)
  })

  it('updateInvoiceDate corrects the extracted date by hand, and logs the correction', async () => {
    const from = routedSupabaseFrom({
      wine_invoices: [
        { error: null },
        { data: { invoice_date: '2026-01-01' } },
        { error: null },
        { data: { ...NEW_ROW, invoice_date: '2026-03-15' } },
      ],
      wine_invoice_corrections: [{ error: null }],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
    const updated = await invoices.updateInvoiceDate('inv1', '2026-03-15')
    expect(updated.extracted.invoiceDate).toBe('2026-03-15')
    const updateBuilder = from.mock.results[2].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ invoice_date: '2026-03-15' })
    const correctionBuilder = from.mock.results[3].value
    expect(correctionBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_id: 'inv1', field_name: 'invoice_date', old_value: '2026-01-01', new_value: '2026-03-15' }),
    )
  })

  it('updateInvoiceDate does not log a correction when the date is unchanged', async () => {
    const from = routedSupabaseFrom({
      wine_invoices: [
        { error: null },
        { data: { invoice_date: '2026-03-15' } },
        { error: null },
        { data: { ...NEW_ROW, invoice_date: '2026-03-15' } },
      ],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
    await invoices.updateInvoiceDate('inv1', '2026-03-15')
    expect(from).not.toHaveBeenCalledWith('wine_invoice_corrections')
  })

  it('editing an invoice reverts its approval status, so it needs approving again (no-ops when not currently approved)', async () => {
    const from = routedSupabaseFrom({
      // Same date in/out so logCorrection is a no-op and doesn't need its own queued table.
      wine_invoices: [{ error: null }, { data: { invoice_date: '2026-01-01' } }, { error: null }, { data: NEW_ROW }],
    })
    const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
    await invoices.updateInvoiceDate('inv1', '2026-01-01')

    const revertBuilder = from.mock.results[0].value
    expect(revertBuilder.update).toHaveBeenCalledWith({ status: 'not_approved', approved_at: null })
    expect(revertBuilder.eq).toHaveBeenCalledWith('id', 'inv1')
    expect(revertBuilder.eq).toHaveBeenCalledWith('status', 'approved')
  })

  describe('updateLineItem', () => {
    it('recomputes lineTotal and logs corrections for volume, quantity, unit price, and pack size', async () => {
      const from = routedSupabaseFrom({
        wine_invoice_line_items: [
          { data: { quantity: 1, unit_price: 10, volume_ml_raw: 750, pack_size: 1 } },
          { error: null },
        ],
        wine_invoices: [
          { error: null },
          {
            data: {
              ...NEW_ROW,
              wine_invoice_line_items: [
                {
                  id: 'li1',
                  item_name_raw: 'Wine A',
                  quantity: 3,
                  unit_price: 12,
                  line_total: 36,
                  volume_ml_raw: 1500,
                  pack_size: 6,
                  wine_id: 'w1',
                  sku_confidence: 'high',
                  sku_match_status: 'suggested',
                },
              ],
            },
          },
        ],
        wine_invoice_corrections: [{ error: null }, { error: null }, { error: null }, { error: null }],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))

      const updated = await invoices.updateLineItem('inv1', 'li1', { volumeMl: 1500, quantity: 3, unitPrice: 12, packSize: 6 })

      expect(updated.lineItems[0].lineTotal).toBe(36)
      const updateBuilder = from.mock.results[2].value
      expect(updateBuilder.update).toHaveBeenCalledWith({
        quantity: 3,
        unit_price: 12,
        line_total: 36,
        volume_ml_raw: 1500,
        pack_size: 6,
      })
      const quantityCorrection = from.mock.results[3].value
      expect(quantityCorrection.insert).toHaveBeenCalledWith(
        expect.objectContaining({ field_name: 'quantity', old_value: '1', new_value: '3' }),
      )
      const priceCorrection = from.mock.results[4].value
      expect(priceCorrection.insert).toHaveBeenCalledWith(
        expect.objectContaining({ field_name: 'unit_price', old_value: '10', new_value: '12' }),
      )
      const volumeCorrection = from.mock.results[5].value
      expect(volumeCorrection.insert).toHaveBeenCalledWith(
        expect.objectContaining({ field_name: 'volume_ml', old_value: '750', new_value: '1500' }),
      )
      const packSizeCorrection = from.mock.results[6].value
      expect(packSizeCorrection.insert).toHaveBeenCalledWith(
        expect.objectContaining({ field_name: 'pack_size', old_value: '1', new_value: '6' }),
      )
    })

    it('rejects an unknown line item id', async () => {
      const from = routedSupabaseFrom({
        wine_invoices: [{ error: null }],
        wine_invoice_line_items: [{ data: null }],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      await expect(
        invoices.updateLineItem('inv1', 'missing', { volumeMl: null, quantity: 1, unitPrice: 1, packSize: 1 }),
      ).rejects.toThrow(/not found/i)
    })
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
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      await expect(invoices.approve('inv1')).rejects.toThrow(/still processing/i)
    })

    it('rejects when the vendor is unresolved', async () => {
      const from = routedSupabaseFrom({ wine_invoices: [{ data: { ...NEW_ROW, status: 'not_approved' } }] })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
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
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      await expect(invoices.approve('inv1')).rejects.toThrow(/wine sku/i)
    })

    it('allows approval when the only unresolved line item is excluded', async () => {
      const from = routedSupabaseFrom({
        wine_invoices: [
          {
            data: {
              ...NEW_ROW,
              status: 'not_approved',
              vendor_id: 'v1',
              vendor_match_status: 'suggested',
              wine_invoice_line_items: [
                { ...resolvedInvoiceRow.wine_invoice_line_items[0], wine_id: null, sku_match_status: 'unresolved', excluded: true },
              ],
            },
          },
          { error: null },
          { data: { ...resolvedInvoiceRow, status: 'approved' } },
        ],
        wine_invoice_line_items: [{ error: null }],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      const approved = await invoices.approve('inv1')
      expect(approved.status).toBe('approved')
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
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))

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
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      const result = await invoices.approve('inv1')
      expect(result.status).toBe('approved')
      expect(from).toHaveBeenCalledTimes(1)
    })
  })

  describe('setLineItemExcluded', () => {
    it('writes the excluded flag and returns the refreshed invoice', async () => {
      const from = routedSupabaseFrom({
        wine_invoice_line_items: [{ error: null }],
        wine_invoices: [
          { error: null },
          {
            data: {
              ...NEW_ROW,
              wine_invoice_line_items: [
                { id: 'li1', item_name_raw: 'Wine A', quantity: 1, unit_price: 10, line_total: 10, wine_id: null, sku_confidence: null, sku_match_status: 'unresolved', excluded: true },
              ],
            },
          },
        ],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))

      const updated = await invoices.setLineItemExcluded('inv1', 'li1', true)

      expect(updated.lineItems[0].excluded).toBe(true)
      const updateBuilder = from.mock.results[1].value
      expect(updateBuilder.update).toHaveBeenCalledWith({ excluded: true })
    })
  })

  describe('discard', () => {
    it('deletes the row and removes its stored file for a not_approved invoice', async () => {
      const from = routedSupabaseFrom({
        wine_invoices: [{ data: { status: 'not_approved', file_path: 'inv1.pdf' } }, { error: null }],
      })
      const storage = fakeStorage()
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from, storage))

      await invoices.discard('inv1')

      const deleteBuilder = from.mock.results[1].value
      expect(deleteBuilder.delete).toHaveBeenCalled()
      expect(deleteBuilder.eq).toHaveBeenCalledWith('id', 'inv1')
      expect(storage.bucketApi.remove).toHaveBeenCalledWith(['inv1.pdf'])
    })

    it('deletes a processing invoice too', async () => {
      const from = routedSupabaseFrom({
        wine_invoices: [{ data: { status: 'processing', file_path: 'inv1.pdf' } }, { error: null }],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      await expect(invoices.discard('inv1')).resolves.toBeUndefined()
    })

    it('deletes an approved invoice too - discard is allowed regardless of approval status', async () => {
      const from = routedSupabaseFrom({
        wine_invoices: [{ data: { status: 'approved', file_path: 'inv1.pdf' } }, { error: null }],
      })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      await expect(invoices.discard('inv1')).resolves.toBeUndefined()
    })

    it('rejects an unknown invoice id', async () => {
      const from = routedSupabaseFrom({ wine_invoices: [{ data: null }] })
      const invoices = createSupabaseInvoiceService(supabaseWithFrom(from))
      await expect(invoices.discard('missing')).rejects.toThrow(/not found/i)
    })
  })
})
