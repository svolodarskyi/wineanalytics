import type { OpenAiUsage } from '../../types'
import { estimateCostUsd, OPENAI_MODEL } from './pricing'
import { INVOICE_EXTRACTION_PROMPT } from './prompt'

export interface OpenAiExtractedLineItem {
  itemName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface OpenAiExtractedInvoice {
  vendorName: string | null
  invoiceDate: string | null
  totalAmount: number
  lineItems: OpenAiExtractedLineItem[]
}

export interface OpenAiExtractionResult {
  parsed: OpenAiExtractedInvoice
  /** Full chat-completion response body, kept for the Settings debug log. */
  responseJson: unknown
  usage: OpenAiUsage
  costUsd: number
}

function toNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

/** The model is instructed to return this shape, but never trust it blindly - coerce defensively. */
function coerceExtractedInvoice(value: unknown): OpenAiExtractedInvoice {
  const obj = (value ?? {}) as Record<string, unknown>
  const rawLineItems = Array.isArray(obj.lineItems) ? obj.lineItems : []
  return {
    vendorName: typeof obj.vendorName === 'string' && obj.vendorName.trim() ? obj.vendorName : null,
    invoiceDate: typeof obj.invoiceDate === 'string' && obj.invoiceDate.trim() ? obj.invoiceDate : null,
    totalAmount: toNumber(obj.totalAmount),
    lineItems: rawLineItems.map((item) => {
      const line = (item ?? {}) as Record<string, unknown>
      return {
        itemName: typeof line.itemName === 'string' ? line.itemName : 'Unknown item',
        quantity: toNumber(line.quantity),
        unitPrice: toNumber(line.unitPrice),
        lineTotal: toNumber(line.lineTotal),
      }
    }),
  }
}

/**
 * Calls OpenAI directly from the browser using VITE_OPENAI_API_KEY. This is
 * only safe for local experimentation - the key ships in the client bundle.
 * Once Supabase Edge Functions exist, this call should move server-side.
 */
export async function extractInvoiceImage(imageDataUrl: string): Promise<OpenAiExtractionResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  if (!apiKey) {
    throw new Error('VITE_OPENAI_API_KEY is not set. Add it to your local .env file to enable OpenAI extraction.')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INVOICE_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the invoice data from this image.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  })

  const responseJson = await response.json()
  if (!response.ok) {
    const message =
      responseJson && typeof responseJson === 'object' && 'error' in responseJson
        ? ((responseJson as { error?: { message?: string } }).error?.message ?? null)
        : null
    throw new Error(message ?? `OpenAI request failed with status ${response.status}.`)
  }

  const content = responseJson?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('OpenAI response did not include any message content.')
  }

  let parsedContent: unknown
  try {
    parsedContent = JSON.parse(content)
  } catch {
    throw new Error('OpenAI returned a response that was not valid JSON.')
  }

  const usageRaw = responseJson?.usage ?? {}
  const usage: OpenAiUsage = {
    promptTokens: toNumber(usageRaw.prompt_tokens),
    completionTokens: toNumber(usageRaw.completion_tokens),
    totalTokens: toNumber(usageRaw.total_tokens),
  }

  return {
    parsed: coerceExtractedInvoice(parsedContent),
    responseJson,
    usage,
    costUsd: estimateCostUsd(usage),
  }
}
