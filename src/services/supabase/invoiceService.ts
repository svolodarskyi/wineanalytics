import type { SupabaseClient } from '@supabase/supabase-js'
import { confidenceFromScore, findBestMatch } from '../mock/similarity'
import type { AdditionalCharge, Confidence, Invoice, InvoiceStatus, MatchStatus, WineCategory } from '../../types'
import type { InvoiceService, OpenAiExtractedLine, OpenAiService } from '../types'
import { resolveSignedUrl, uploadDataUrl } from './storage'

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
  volume_raw: string | null
  category_raw: WineCategory | null
  quantity: number
  unit_price: number
  line_total: number
  wine_id: string | null
  sku_confidence: Confidence | null
  sku_match_status: MatchStatus
}

interface ChargeRow {
  description: string
  amount: number
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
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
      volumeRaw: li.volume_raw,
      categoryRaw: li.category_raw,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unit_price),
      lineTotal: Number(li.line_total),
      skuMatch: { wineId: li.wine_id, confidence: li.sku_confidence, status: li.sku_match_status },
    })),
  }
}

async function fetchInvoice(supabase: SupabaseClient, id: string): Promise<Invoice> {
  const { data, error } = await supabase.from('wine_invoices').select(SELECT_FULL).eq('id', id).maybeSingle()
  throwIfError(error)
  if (!data) throw new Error('Invoice not found.')
  return toInvoice(supabase, data as unknown as InvoiceRow)
}

interface MatchResult {
  id: string | null
  confidence: Confidence | null
  status: MatchStatus
}

async function vendorMatchFor(supabase: SupabaseClient, rawName: string): Promise<MatchResult> {
  const { data, error } = await supabase.from('wine_vendors').select('id, name, invoice_name, active').eq('active', true)
  throwIfError(error)
  const candidates = (data ?? []) as { id: string; name: string; invoice_name: string | null; active: boolean }[]
  const best = findBestMatch(
    rawName,
    candidates.map((v) => ({ id: v.id, name: v.name, active: v.active, invoiceName: v.invoice_name })),
  )
  const confidence = best ? confidenceFromScore(best.score) : null
  return { id: confidence ? (best?.id ?? null) : null, confidence, status: confidence ? 'suggested' : 'unresolved' }
}

async function skuMatchFor(supabase: SupabaseClient, rawName: string): Promise<MatchResult> {
  const { data, error } = await supabase.from('wine_wines').select('id, name, invoice_name, active').eq('active', true)
  throwIfError(error)
  const candidates = (data ?? []) as { id: string; name: string; invoice_name: string | null; active: boolean }[]
  const best = findBestMatch(
    rawName,
    candidates.map((w) => ({ id: w.id, name: w.name, active: w.active, invoiceName: w.invoice_name })),
  )
  const confidence = best ? confidenceFromScore(best.score) : null
  return { id: confidence ? (best?.id ?? null) : null, confidence, status: confidence ? 'suggested' : 'unresolved' }
}

/** Fills in a `processing` invoice from an extraction result (real or the empty fallback) and runs matching against current master data. */
async function completeProcessingFromExtraction(
  supabase: SupabaseClient,
  invoiceId: string,
  extraction: {
    vendorNameRaw: string
    invoiceDate: string | null
    totalAmount: number
    lines: OpenAiExtractedLine[]
    additionalCharges: AdditionalCharge[]
  },
): Promise<void> {
  const vendorMatch = await vendorMatchFor(supabase, extraction.vendorNameRaw)

  const { error: updateError } = await supabase
    .from('wine_invoices')
    .update({
      status: 'not_approved',
      invoice_date: extraction.invoiceDate,
      total_amount: extraction.totalAmount,
      vendor_name_raw: extraction.vendorNameRaw,
      vendor_id: vendorMatch.id,
      vendor_confidence: vendorMatch.confidence,
      vendor_match_status: vendorMatch.status,
    })
    .eq('id', invoiceId)
  // Best-effort background completion - if this fails there's nothing more to
  // do here; the invoice just stays in "processing" for the user to retry.
  if (updateError) return

  if (extraction.lines.length) {
    const lineRows = await Promise.all(
      extraction.lines.map(async (line) => {
        const skuMatch = await skuMatchFor(supabase, line.itemNameRaw)
        return {
          invoice_id: invoiceId,
          item_name_raw: line.itemNameRaw,
          volume_raw: line.volumeRaw,
          category_raw: line.categoryRaw,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          line_total: line.lineTotal,
          wine_id: skuMatch.id,
          sku_confidence: skuMatch.confidence,
          sku_match_status: skuMatch.status,
        }
      }),
    )
    await supabase.from('wine_invoice_line_items').insert(lineRows)
  }

  if (extraction.additionalCharges.length) {
    await supabase.from('wine_invoice_additional_charges').insert(
      extraction.additionalCharges.map((c) => ({ invoice_id: invoiceId, description: c.description, amount: c.amount })),
    )
  }
}

const EMPTY_EXTRACTION = { vendorNameRaw: '', invoiceDate: null, totalAmount: 0, lines: [], additionalCharges: [] }

export function createSupabaseInvoiceService(supabase: SupabaseClient, openai: OpenAiService): InvoiceService {
  return {
    async list(options?: { status?: InvoiceStatus | 'all' }): Promise<Invoice[]> {
      let query = supabase.from('wine_invoices').select(SELECT_FULL).order('uploaded_at', { ascending: false })
      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status)
      }
      const { data, error } = await query
      throwIfError(error)
      return Promise.all((data as unknown as InvoiceRow[]).map((row) => toInvoice(supabase, row)))
    },

    async get(id: string): Promise<Invoice | null> {
      const { data, error } = await supabase.from('wine_invoices').select(SELECT_FULL).eq('id', id).maybeSingle()
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
      const invoice = await toInvoice(supabase, data as unknown as InvoiceRow)

      if (input.fileType === 'image') {
        // Fire-and-forget: the review page polls while status is "processing".
        openai
          .extractInvoice({ fileName: input.fileName, imageDataUrl: input.fileDataUrl, invoiceId: id })
          .then((extraction) => completeProcessingFromExtraction(supabase, id, extraction))
          .catch(() => {
            // Failure is already captured in the OpenAI request log; leave the
            // invoice fully unresolved so the user can still fill it in by hand.
            void completeProcessingFromExtraction(supabase, id, EMPTY_EXTRACTION)
          })
      } else {
        // No real extraction path for PDFs yet (vision models need an image) -
        // land as fully unresolved rather than faking data or getting stuck.
        void completeProcessingFromExtraction(supabase, id, EMPTY_EXTRACTION)
      }

      return invoice
    },

    async confirmVendorMatch(invoiceId: string): Promise<Invoice> {
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

    async updateInvoiceDate(invoiceId: string, invoiceDate: string | null): Promise<Invoice> {
      const { error } = await supabase.from('wine_invoices').update({ invoice_date: invoiceDate }).eq('id', invoiceId)
      throwIfError(error)
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
      if (invoice.lineItems.some((line) => !line.skuMatch.wineId)) {
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
  }
}
