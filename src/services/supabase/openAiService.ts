import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpenAiRequestLog } from '../../types'
import { extractInvoiceImage } from '../openai/client'
import { OPENAI_MODEL } from '../openai/pricing'
import type { OpenAiService } from '../types'
import { resolveSignedUrl } from './storage'

const INVOICES_BUCKET = 'wine-invoices'

interface OpenAiLogRow {
  id: string
  created_at: string
  model: string
  file_name: string
  response_json: unknown
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  cost_usd: number
  error: string | null
  wine_invoices: { file_path: string } | null
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/**
 * Doesn't store the image itself - every logged call corresponds 1:1 with an
 * invoice upload, so this just references invoice_id and resolves the
 * invoice's own stored file at read time (see wineService.ts for the same
 * signed-URL pattern applied to wine photos).
 */
export function createSupabaseOpenAiService(supabase: SupabaseClient): OpenAiService {
  return {
    async extractInvoice(input: { fileName: string; imageDataUrl: string; invoiceId?: string }) {
      try {
        const result = await extractInvoiceImage(input.imageDataUrl)
        await supabase.from('wine_openai_logs').insert({
          invoice_id: input.invoiceId ?? null,
          model: OPENAI_MODEL,
          file_name: input.fileName,
          response_json: result.responseJson,
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
          cost_usd: result.costUsd,
          error: null,
        })
        return {
          vendorNameRaw: result.parsed.vendorName ?? '',
          invoiceDate: result.parsed.invoiceDate,
          totalAmount: result.parsed.totalAmount,
          lines: result.parsed.lineItems.map((item) => ({
            itemNameRaw: item.itemName,
            volumeMlRaw: item.volumeMl,
            categoryRaw: item.category,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
          additionalCharges: result.parsed.additionalCharges,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OpenAI request failed.'
        await supabase.from('wine_openai_logs').insert({
          invoice_id: input.invoiceId ?? null,
          model: OPENAI_MODEL,
          file_name: input.fileName,
          response_json: null,
          prompt_tokens: null,
          completion_tokens: null,
          total_tokens: null,
          cost_usd: 0,
          error: message,
        })
        throw err
      }
    },

    async listLogs(): Promise<OpenAiRequestLog[]> {
      const { data, error } = await supabase
        .from('wine_openai_logs')
        .select('*, wine_invoices(file_path)')
        .order('created_at', { ascending: false })
      throwIfError(error)

      return Promise.all(
        (data as unknown as OpenAiLogRow[]).map(async (row) => ({
          id: row.id,
          createdAt: row.created_at,
          model: row.model,
          fileName: row.file_name,
          imageDataUrl: (await resolveSignedUrl(supabase, INVOICES_BUCKET, row.wine_invoices?.file_path ?? null)) ?? '',
          responseJson: row.response_json,
          usage:
            row.prompt_tokens === null || row.completion_tokens === null || row.total_tokens === null
              ? null
              : { promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens, totalTokens: row.total_tokens },
          costUsd: Number(row.cost_usd),
          error: row.error,
        })),
      )
    },
  }
}
