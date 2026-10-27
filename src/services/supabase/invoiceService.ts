import type { SupabaseClient } from '@supabase/supabase-js'
import type { Confidence, Invoice, InvoiceStatus, MatchStatus, WineCategory } from '../../types'
import type { InvoiceService } from '../types'
import { removeObject, resolveSignedUrl, uploadDataUrl } from './storage'

const INVOICES_BUCKET = 'wine-invoices'
const SELECT_FULL = '*, wine_invoice_line_items(*), wine_invoice_additional_charges(*)'

interface InvoiceRow {
  id: string
  file_name: string
  file_type: 'image' | 'pdf'
  file_path: string
  uploaded_at: string
  status: InvoiceStatus
  approved_at: string | null
  invoice_date: string | null
  total_amount: number | null
  vendor_name_raw: string
  vendor_id: string | null
  vendor_confidence: Confidence | null
  vendor_match_status: MatchStatus
  wine_invoice_line_items: LineItemRow[] | null
  wine_invoice_additional_charges: ChargeRow[] | null
}

interface LineItemRow {
  id: string
  item_name_raw: string
  volume_ml_raw: number | null
  category_raw: WineCategory | null
  quantity: number
  unit_price: number
  line_total: number
  pack_size: number
  wine_id: string | null
  sku_confidence: Confidence | null
  sku_match_status: MatchStatus
  excluded: boolean
}

interface ChargeRow {
  description: string
  amount: number
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/**
 * Any hand-edit made after approval invalidates that approval - it's
 * accepted-as-correct data that's now being changed, so it needs a human to
 * look it over and approve again before it counts. Filtered to a no-op when
 * the invoice isn't currently approved, so every editing method can call
 * this unconditionally instead of branching on status itself.
 */
async function revertApprovalIfEditing(supabase: SupabaseClient, invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('wine_invoices')
    .update({ status: 'not_approved', approved_at: null })
    .eq('id', invoiceId)
    .eq('status', 'approved')
  throwIfError(error)
}

async function toInvoice(supabase: SupabaseClient, row: InvoiceRow): Promise<Invoice> {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileDataUrl: (await resolveSignedUrl(supabase, INVOICES_BUCKET, row.file_path)) ?? '',
    uploadedAt: row.uploaded_at,
    status: row.status,
    approvedAt: row.approved_at,
    extracted: {
      invoiceDate: row.invoice_date,
      totalAmount: row.total_amount,
      vendorMatch: {
        vendorNameRaw: row.vendor_name_raw,
        vendorId: row.vendor_id,
        confidence: row.vendor_confidence,
        status: row.vendor_match_status,
      },
      additionalCharges: (row.wine_invoice_additional_charges ?? []).map((c) => ({
        description: c.description,
        amount: Number(c.amount),
      })),
    },
    lineItems: (row.wine_invoice_line_items ?? []).map((li) => ({
      id: li.id,
      itemNameRaw: li.item_name_raw,
      volumeMlRaw: li.volume_ml_raw,
      categoryRaw: li.category_raw,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unit_price),
      lineTotal: Number(li.line_total),
      packSize: Number(li.pack_size),
      skuMatch: { wineId: li.wine_id, confidence: li.sku_confidence, status: li.sku_match_status },
      excluded: li.excluded,
    })),
  }
}

async function fetchInvoice(supabase: SupabaseClient, id: string): Promise<Invoice> {
  const { data, error } = await supabase
    .from('wine_invoices')
    .select(SELECT_FULL)
    .eq('id', id)
    .order('position', { foreignTable: 'wine_invoice_line_items' })
    .order('id', { foreignTable: 'wine_invoice_line_items' })
    .maybeSingle()
  throwIfError(error)
  if (!data) throw new Error('Invoice not found.')
  return toInvoice(supabase, data as unknown as InvoiceRow)
}

type CorrectableField = 'invoice_date' | 'quantity' | 'unit_price' | 'volume_ml' | 'pack_size'

/** Records a manual correction to an OCR-extracted field - skipped as a no-op when the value didn't actually change. Best-effort: a logging failure never blocks the underlying save. */
async function logCorrection(
  supabase: SupabaseClient,
  params: { invoiceId: string; lineItemId?: string; fieldName: CorrectableField; oldValue: string | number | null; newValue: string | number | null },
): Promise<void> {
  if (params.oldValue === params.newValue) return
  const { error } = await supabase.from('wine_invoice_corrections').insert({
    invoice_id: params.invoiceId,
    line_item_id: params.lineItemId ?? null,
    field_name: params.fieldName,
    old_value: params.oldValue == null ? null : String(params.oldValue),
    new_value: params.newValue == null ? null : String(params.newValue),
  })
  if (error) console.error('Could not log invoice correction:', error.message)
}

export function createSupabaseInvoiceService(supabase: SupabaseClient): InvoiceService {
  return {
    async list(options?: { status?: InvoiceStatus | 'all' }): Promise<Invoice[]> {
      let query = supabase
        .from('wine_invoices')
        .select(SELECT_FULL)
        .order('uploaded_at', { ascending: false })
        .order('position', { foreignTable: 'wine_invoice_line_items' })
        .order('id', { foreignTable: 'wine_invoice_line_items' })
      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status)
      }
      const { data, error } = await query
      throwIfError(error)
      return Promise.all((data as unknown as InvoiceRow[]).map((row) => toInvoice(supabase, row)))
    },

    async get(id: string): Promise<Invoice | null> {
      const { data, error } = await supabase
        .from('wine_invoices')
        .select(SELECT_FULL)
        .eq('id', id)
        .order('position', { foreignTable: 'wine_invoice_line_items' })
        .order('id', { foreignTable: 'wine_invoice_line_items' })
        .maybeSingle()
      throwIfError(error)
      return data ? toInvoice(supabase, data as unknown as InvoiceRow) : null
    },

    async upload(input: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }): Promise<Invoice> {
      const id = crypto.randomUUID()
      const filePath = await uploadDataUrl(supabase, INVOICES_BUCKET, id, input.fileDataUrl)

      const { data, error } = await supabase
        .from('wine_invoices')
        .insert({
          id,
          file_name: input.fileName,
          file_type: input.fileType,
          file_path: filePath,
          status: 'processing',
          vendor_name_raw: '',
          vendor_match_status: 'unresolved',
        })
        .select(SELECT_FULL)
        .single()
      throwIfError(error)
      // Processing (OCR + matching + line items) happens server-side, kicked
      // off by a Postgres trigger on this insert - see
      // supabase/functions/process-invoice and
      // supabase/migrations/20260912000000_invoice_processing_webhook.sql.
      // The review page polls while status is "processing" (see useInvoice).
      return toInvoice(supabase, data as unknown as InvoiceRow)
    },

    async confirmVendorMatch(invoiceId: string): Promise<Invoice> {
      await revertApprovalIfEditing(supabase, invoiceId)
      const { data, error } = await supabase.from('wine_invoices').select('vendor_id').eq('id', invoiceId).maybeSingle()
      throwIfError(error)
      if (!data) throw new Error('Invoice not found.')
      if (!(data as { vendor_id: string | null }).vendor_id) {
        throw new Error('There is no suggested vendor to confirm.')
      }
      const { error: updateError } = await supabase
        .from('wine_invoices')
        .update({ vendor_match_status: 'confirmed' })
        .eq('id', invoiceId)
      throwIfError(updateError)
      return fetchInvoice(supabase, invoiceId)
    },

    async selectVendorMatch(invoiceId: string, vendorId: string): Promise<Invoice> {
      await revertApprovalIfEditing(supabase, invoiceId)
      const { error } = await supabase
        .from('wine_invoices')
        .update({ vendor_id: vendorId, vendor_confidence: null, vendor_match_status: 'changed' })
        .eq('id', invoiceId)
      if (error) {
        if (error.code === '23503') throw new Error('Vendor not found.')
        throw new Error(error.message)
      }
      return fetchInvoice(supabase, invoiceId)
    },

    async confirmSkuMatch(invoiceId: string, lineItemId: string): Promise<Invoice> {
      await revertApprovalIfEditing(supabase, invoiceId)
      const { data, error } = await supabase
        .from('wine_invoice_line_items')
        .select('wine_id')
        .eq('id', lineItemId)
        .eq('invoice_id', invoiceId)
        .maybeSingle()
      throwIfError(error)
      if (!data) throw new Error('Invoice line item not found.')
      if (!(data as { wine_id: string | null }).wine_id) {
        throw new Error('There is no suggested wine SKU to confirm.')
      }
      const { error: updateError } = await supabase
        .from('wine_invoice_line_items')
        .update({ sku_match_status: 'confirmed' })
        .eq('id', lineItemId)
      throwIfError(updateError)
      return fetchInvoice(supabase, invoiceId)
    },

    async selectSkuMatch(invoiceId: string, lineItemId: string, wineId: string): Promise<Invoice> {
      await revertApprovalIfEditing(supabase, invoiceId)
      const { error } = await supabase
        .from('wine_invoice_line_items')
        .update({ wine_id: wineId, sku_confidence: null, sku_match_status: 'changed' })
        .eq('id', lineItemId)
        .eq('invoice_id', invoiceId)
      if (error) {
        if (error.code === '23503') throw new Error('Wine not found.')
        throw new Error(error.message)
      }
      return fetchInvoice(supabase, invoiceId)
    },

    async updateLineItem(
      invoiceId: string,
      lineItemId: string,
      fields: { volumeMl: number | null; quantity: number; unitPrice: number; packSize: number },
    ): Promise<Invoice> {
      await revertApprovalIfEditing(supabase, invoiceId)
      const { data: before, error: fetchError } = await supabase
        .from('wine_invoice_line_items')
        .select('quantity, unit_price, volume_ml_raw, pack_size')
        .eq('id', lineItemId)
        .eq('invoice_id', invoiceId)
        .maybeSingle()
      throwIfError(fetchError)
      if (!before) throw new Error('Invoice line item not found.')
      const previous = before as { quantity: number; unit_price: number; volume_ml_raw: number | null; pack_size: number }

      const lineTotal = Math.round(fields.quantity * fields.unitPrice * 100) / 100
      const { error } = await supabase
        .from('wine_invoice_line_items')
        .update({
          quantity: fields.quantity,
          unit_price: fields.unitPrice,
          line_total: lineTotal,
          volume_ml_raw: fields.volumeMl,
          pack_size: fields.packSize,
        })
        .eq('id', lineItemId)
        .eq('invoice_id', invoiceId)
      throwIfError(error)

      await logCorrection(supabase, { invoiceId, lineItemId, fieldName: 'quantity', oldValue: previous.quantity, newValue: fields.quantity })
      await logCorrection(supabase, { invoiceId, lineItemId, fieldName: 'unit_price', oldValue: previous.unit_price, newValue: fields.unitPrice })
      await logCorrection(supabase, { invoiceId, lineItemId, fieldName: 'volume_ml', oldValue: previous.volume_ml_raw, newValue: fields.volumeMl })
      await logCorrection(supabase, { invoiceId, lineItemId, fieldName: 'pack_size', oldValue: previous.pack_size, newValue: fields.packSize })

      return fetchInvoice(supabase, invoiceId)
    },

    async setLineItemExcluded(invoiceId: string, lineItemId: string, excluded: boolean): Promise<Invoice> {
      await revertApprovalIfEditing(supabase, invoiceId)
      const { error } = await supabase
        .from('wine_invoice_line_items')
        .update({ excluded })
        .eq('id', lineItemId)
        .eq('invoice_id', invoiceId)
      throwIfError(error)
      return fetchInvoice(supabase, invoiceId)
    },

    async updateInvoiceDate(invoiceId: string, invoiceDate: string | null): Promise<Invoice> {
      await revertApprovalIfEditing(supabase, invoiceId)
      const { data: before, error: fetchError } = await supabase
        .from('wine_invoices')
        .select('invoice_date')
        .eq('id', invoiceId)
        .maybeSingle()
      throwIfError(fetchError)
      const previousDate = (before as { invoice_date: string | null } | null)?.invoice_date ?? null

      const { error } = await supabase.from('wine_invoices').update({ invoice_date: invoiceDate }).eq('id', invoiceId)
      throwIfError(error)

      await logCorrection(supabase, { invoiceId, fieldName: 'invoice_date', oldValue: previousDate, newValue: invoiceDate })

      return fetchInvoice(supabase, invoiceId)
    },

    async approve(invoiceId: string): Promise<Invoice> {
      const invoice = await fetchInvoice(supabase, invoiceId)
      if (invoice.status === 'approved') return invoice
      if (invoice.status === 'processing') {
        throw new Error('Invoice is still processing.')
      }
      if (!invoice.extracted.vendorMatch.vendorId) {
        throw new Error('Resolve the vendor match before approving.')
      }
      if (invoice.lineItems.some((line) => !line.excluded && !line.skuMatch.wineId)) {
        throw new Error("Resolve every line item's wine SKU before approving.")
      }

      // Approving accepts every remaining AI suggestion as-is, so the user
      // only has to click Confirm/Change on the matches they want to correct.
      const { error } = await supabase
        .from('wine_invoices')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          vendor_match_status: invoice.extracted.vendorMatch.status === 'suggested' ? 'confirmed' : invoice.extracted.vendorMatch.status,
        })
        .eq('id', invoiceId)
      throwIfError(error)

      const { error: lineError } = await supabase
        .from('wine_invoice_line_items')
        .update({ sku_match_status: 'confirmed' })
        .eq('invoice_id', invoiceId)
        .eq('sku_match_status', 'suggested')
      throwIfError(lineError)

      return fetchInvoice(supabase, invoiceId)
    },

    async discard(invoiceId: string): Promise<void> {
      const { data, error } = await supabase.from('wine_invoices').select('status, file_path').eq('id', invoiceId).maybeSingle()
      throwIfError(error)
      if (!data) throw new Error('Invoice not found.')
      const row = data as { status: InvoiceStatus; file_path: string | null }

      // wine_invoice_line_items and wine_invoice_additional_charges cascade-delete with the invoice row.
      const { error: deleteError } = await supabase.from('wine_invoices').delete().eq('id', invoiceId)
      throwIfError(deleteError)

      await removeObject(supabase, INVOICES_BUCKET, row.file_path)
    },
  }
}
