// Triggered by a Postgres AFTER INSERT trigger on wine_invoices (see
// supabase/migrations/20260912000000_invoice_processing_webhook.sql), NOT by
// the browser - this is what makes invoice processing survive the upload tab
// closing/backgrounding mid-request. See the plan this replaced: the OCR call
// and the DB writes it triggers used to live in a fire-and-forget promise
// chain in src/services/supabase/invoiceService.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { confidenceFromScore, findBestMatch } from '../_shared/similarity.ts'
import {
  estimateOpenAiCostUsd,
  extractInvoiceWithOpenAi,
  OPENAI_INVOICE_OCR_MODEL,
  type ExtractedCharge,
  type ExtractedInvoice,
  type ExtractedLineItem,
  type TokenUsage,
} from '../_shared/invoiceExtraction.ts'
import { ANTHROPIC_INVOICE_OCR_MODEL, estimateAnthropicCostUsd, extractInvoiceWithClaude } from '../_shared/anthropicExtraction.ts'

/** 'openai' (default, unchanged) or 'anthropic' (Claude Haiku) - set via the INVOICE_OCR_PROVIDER secret. */
type OcrProvider = 'openai' | 'anthropic'

const INVOICES_BUCKET = 'wine-invoices'
const SIGNED_URL_TTL_SECONDS = 300

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    id: string
    file_name: string
    file_type: 'image' | 'pdf'
    file_path: string
    status: string
  }
}

interface MatchResult {
  id: string | null
  confidence: 'high' | 'medium' | 'low' | null
  status: 'suggested' | 'unresolved'
}

const EMPTY_EXTRACTION: ExtractedInvoice = { vendorName: '', invoiceDate: null, totalAmount: 0, lineItems: [], additionalCharges: [] }

function getSupabaseClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set for this Edge Function.`)
  return value
}

async function vendorMatchFor(supabase: ReturnType<typeof getSupabaseClient>, rawName: string): Promise<MatchResult> {
  const { data, error } = await supabase.from('wine_vendors').select('id, name, invoice_name, active').eq('active', true)
  if (error) throw new Error(error.message)
  const candidates = (data ?? []) as { id: string; name: string; invoice_name: string | null; active: boolean }[]
  const best = findBestMatch(
    rawName,
    candidates.map((v) => ({ id: v.id, name: v.name, active: v.active, invoiceName: v.invoice_name })),
  )
  const confidence = best ? confidenceFromScore(best.score) : null
  return { id: confidence ? (best?.id ?? null) : null, confidence, status: confidence ? 'suggested' : 'unresolved' }
}

async function skuMatchFor(supabase: ReturnType<typeof getSupabaseClient>, rawName: string): Promise<MatchResult> {
  const { data, error } = await supabase.from('wine_wines').select('id, name, invoice_name, active').eq('active', true)
  if (error) throw new Error(error.message)
  const candidates = (data ?? []) as { id: string; name: string; invoice_name: string | null; active: boolean }[]
  const best = findBestMatch(
    rawName,
    candidates.map((w) => ({ id: w.id, name: w.name, active: w.active, invoiceName: w.invoice_name })),
  )
  const confidence = best ? confidenceFromScore(best.score) : null
  return { id: confidence ? (best?.id ?? null) : null, confidence, status: confidence ? 'suggested' : 'unresolved' }
}

async function logProcessingFailure(
  supabase: ReturnType<typeof getSupabaseClient>,
  invoiceId: string,
  fileName: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Invoice ${invoiceId}: failed to complete background processing.`, err)
  await supabase.from('wine_openai_logs').insert({
    invoice_id: invoiceId,
    model: 'db-write',
    file_name: fileName,
    response_json: null,
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    cost_usd: 0,
    error: message,
  })
}

/** Direct port of completeProcessingFromExtraction in src/services/supabase/invoiceService.ts. */
async function completeProcessingFromExtraction(
  supabase: ReturnType<typeof getSupabaseClient>,
  invoiceId: string,
  fileName: string,
  extraction: {
    vendorNameRaw: string
    invoiceDate: string | null
    totalAmount: number
    lines: ExtractedLineItem[]
    additionalCharges: ExtractedCharge[]
  },
): Promise<void> {
  try {
    const vendorMatch = await vendorMatchFor(supabase, extraction.vendorNameRaw)

    if (extraction.lines.length) {
      const lineRows = await Promise.all(
        extraction.lines.map(async (line, position) => {
          const skuMatch = await skuMatchFor(supabase, line.itemName)
          return {
            invoice_id: invoiceId,
            item_name_raw: line.itemName,
            volume_ml_raw: line.volumeMl,
            category_raw: line.category,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            line_total: line.lineTotal,
            pack_size: line.packSize,
            position,
            wine_id: skuMatch.id,
            sku_confidence: skuMatch.confidence,
            sku_match_status: skuMatch.status,
          }
        }),
      )
      const { error: lineError } = await supabase.from('wine_invoice_line_items').insert(lineRows)
      if (lineError) throw new Error(`Inserting line items failed: ${lineError.message}`)
    }

    if (extraction.additionalCharges.length) {
      const { error: chargesError } = await supabase
        .from('wine_invoice_additional_charges')
        .insert(extraction.additionalCharges.map((c) => ({ invoice_id: invoiceId, description: c.description, amount: c.amount })))
      if (chargesError) throw new Error(`Inserting additional charges failed: ${chargesError.message}`)
    }

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
    if (updateError) throw new Error(`Updating invoice failed: ${updateError.message}`)
  } catch (err) {
    await logProcessingFailure(supabase, invoiceId, fileName, err)
  }
}

/** Defaults to 'anthropic' (Claude Haiku) - set the INVOICE_OCR_PROVIDER secret to 'openai' to switch back to GPT-4.1 instead. */
function getOcrProvider(): OcrProvider {
  return Deno.env.get('INVOICE_OCR_PROVIDER') === 'openai' ? 'openai' : 'anthropic'
}

async function runExtraction(
  supabase: ReturnType<typeof getSupabaseClient>,
  invoiceId: string,
  filePath: string,
  fileName: string,
): Promise<void> {
  const provider = getOcrProvider()

  const { data: signed, error: signError } = await supabase.storage.from(INVOICES_BUCKET).createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)
  if (signError || !signed) throw new Error(`Could not sign invoice image URL: ${signError?.message ?? 'unknown error'}`)

  let extraction: ExtractedInvoice
  let usage: TokenUsage | null = null
  let responseJson: unknown = null
  let logError: string | null = null

  try {
    const result =
      provider === 'anthropic'
        ? await extractInvoiceWithClaude(signed.signedUrl, requireEnv('ANTHROPIC_API_KEY'))
        : await extractInvoiceWithOpenAi(signed.signedUrl, requireEnv('OPENAI_API_KEY'))
    extraction = result.parsed
    usage = result.usage
    responseJson = result.responseJson
  } catch (err) {
    logError = err instanceof Error ? err.message : String(err)
    extraction = EMPTY_EXTRACTION
  }

  await supabase.from('wine_openai_logs').insert({
    invoice_id: invoiceId,
    model: provider === 'anthropic' ? ANTHROPIC_INVOICE_OCR_MODEL : OPENAI_INVOICE_OCR_MODEL,
    file_name: fileName,
    response_json: responseJson,
    prompt_tokens: usage?.promptTokens ?? null,
    completion_tokens: usage?.completionTokens ?? null,
    total_tokens: usage?.totalTokens ?? null,
    cost_usd: usage ? (provider === 'anthropic' ? estimateAnthropicCostUsd(usage) : estimateOpenAiCostUsd(usage)) : 0,
    error: logError,
  })

  await completeProcessingFromExtraction(supabase, invoiceId, fileName, {
    vendorNameRaw: extraction.vendorName ?? '',
    invoiceDate: extraction.invoiceDate,
    totalAmount: extraction.totalAmount,
    lines: extraction.lineItems,
    additionalCharges: extraction.additionalCharges,
  })
}

Deno.serve(async (req: Request) => {
  const expectedSecret = Deno.env.get('INVOICE_WEBHOOK_SECRET')
  if (!expectedSecret || req.headers.get('x-webhook-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const record = payload.record
  if (!record?.id || !record.file_path) {
    return new Response('Missing invoice id/file_path in payload', { status: 400 })
  }

  const supabase = getSupabaseClient()

  // Idempotency claim: if this delivery loses the race (retry, duplicate
  // delivery), processing_started_at is already set and we no-op.
  const { data: claimed, error: claimError } = await supabase
    .from('wine_invoices')
    .update({ processing_started_at: new Date().toISOString() })
    .eq('id', record.id)
    .eq('status', 'processing')
    .is('processing_started_at', null)
    .select('id')
    .maybeSingle()

  if (claimError) {
    console.error(`Invoice ${record.id}: failed to claim for processing.`, claimError)
    return new Response('Failed to claim invoice', { status: 500 })
  }
  if (!claimed) {
    return new Response('Already claimed or not processing', { status: 200 })
  }

  if (record.file_type !== 'image') {
    // No real extraction path for PDFs yet (vision models need an image) -
    // land as fully unresolved rather than faking data or getting stuck.
    await completeProcessingFromExtraction(supabase, record.id, record.file_name, {
      vendorNameRaw: '',
      invoiceDate: null,
      totalAmount: 0,
      lines: [],
      additionalCharges: [],
    })
    return new Response('OK (non-image, landed unresolved)', { status: 200 })
  }

  await runExtraction(supabase, record.id, record.file_path, record.file_name)
  return new Response('OK', { status: 200 })
})
