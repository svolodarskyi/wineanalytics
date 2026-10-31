import type { AdditionalCharge, OpenAiUsage, WineCategory } from '../../types'
import { estimateCostUsd, INVOICE_OCR_MODEL, WINE_SCAN_MODEL } from './pricing'
import { INVOICE_EXTRACTION_PROMPT, WINE_SCAN_PROMPT } from './prompt'

const WINE_CATEGORIES: readonly WineCategory[] = [
  'red',
  'white',
  'rose',
  'sparkling',
  'dessert',
  'fortified',
  'beer',
  'spirits',
  'cider',
  'non_alcoholic',
  'other',
]

export interface OpenAiExtractedLineItem {
  itemName: string
  volumeMl: number | null
  category: WineCategory | null
  quantity: number
  unitPrice: number
  lineTotal: number
  packSize: number
}

export interface OpenAiExtractedInvoice {
  vendorName: string | null
  invoiceDate: string | null
  totalAmount: number
  lineItems: OpenAiExtractedLineItem[]
  additionalCharges: AdditionalCharge[]
}

export interface OpenAiExtractedWine {
  name: string | null
  volumeMl: number | null
  category: WineCategory | null
}

export interface OpenAiExtractionResult<T> {
  parsed: T
  /** Full chat-completion response body, kept for the Settings debug log. */
  responseJson: unknown
  usage: OpenAiUsage
  costUsd: number
}

function toNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

/** For volumeMl: 0 or an unparseable value isn't a real bottle size, so fall back to null rather than 0. */
function toPositiveIntOrNull(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) && num > 0 ? Math.round(num) : null
}

function toTrimmedStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function toCategoryOrNull(value: unknown): WineCategory | null {
  return WINE_CATEGORIES.includes(value as WineCategory) ? (value as WineCategory) : null
}

/** Units per pack (a "6-pack", "case of 24") - 1 (sold individually) for anything unparseable or less than 1. */
function toPackSize(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) && num >= 1 ? Math.round(num) : 1
}

/** The model is instructed to return this shape, but never trust it blindly - coerce defensively. */
function coerceExtractedInvoice(value: unknown): OpenAiExtractedInvoice {
  const obj = (value ?? {}) as Record<string, unknown>
  const rawLineItems = Array.isArray(obj.lineItems) ? obj.lineItems : []
  const rawAdditionalCharges = Array.isArray(obj.additionalCharges) ? obj.additionalCharges : []
  return {
    vendorName: toTrimmedStringOrNull(obj.vendorName),
    invoiceDate: toTrimmedStringOrNull(obj.invoiceDate),
    totalAmount: toNumber(obj.totalAmount),
    lineItems: rawLineItems.map((item) => {
      const line = (item ?? {}) as Record<string, unknown>
      return {
        itemName: typeof line.itemName === 'string' ? line.itemName : 'Unknown item',
        volumeMl: toPositiveIntOrNull(line.volumeMl),
        category: toCategoryOrNull(line.category),
        quantity: toNumber(line.quantity),
        unitPrice: toNumber(line.unitPrice),
        lineTotal: toNumber(line.lineTotal),
        packSize: toPackSize(line.packSize),
      }
    }),
    additionalCharges: rawAdditionalCharges.map((charge) => {
      const item = (charge ?? {}) as Record<string, unknown>
      return {
        description: typeof item.description === 'string' && item.description.trim() ? item.description : 'Other charge',
        amount: toNumber(item.amount),
      }
    }),
  }
}

function coerceExtractedWine(value: unknown): OpenAiExtractedWine {
  const obj = (value ?? {}) as Record<string, unknown>
  return {
    name: toTrimmedStringOrNull(obj.name),
    volumeMl: toPositiveIntOrNull(obj.volumeMl),
    category: toCategoryOrNull(obj.category),
  }
}

/**
 * Calls OpenAI's vision chat-completion endpoint directly from the browser
 * using VITE_OPENAI_API_KEY. This is only safe for local experimentation -
 * the key ships in the client bundle. Once Supabase Edge Functions exist,
 * this call should move server-side.
 */
async function callOpenAiJsonVision(
  model: string,
  systemPrompt: string,
  userText: string,
  imageDataUrls: string[],
): Promise<{ responseJson: unknown; parsedContent: unknown; usage: OpenAiUsage }> {
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
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            ...imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
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

  return { responseJson, parsedContent, usage }
}

export async function extractInvoiceImage(imageDataUrl: string): Promise<OpenAiExtractionResult<OpenAiExtractedInvoice>> {
  const { responseJson, parsedContent, usage } = await callOpenAiJsonVision(
    INVOICE_OCR_MODEL,
    INVOICE_EXTRACTION_PROMPT,
    'Extract the invoice data from this image.',
    [imageDataUrl],
  )
  return { parsed: coerceExtractedInvoice(parsedContent), responseJson, usage, costUsd: estimateCostUsd(usage, INVOICE_OCR_MODEL) }
}

/** `imageDataUrls` should be 1-3 photos of the same bottle (front label, back label, whole bottle). */
export async function extractWinePhotos(imageDataUrls: string[]): Promise<OpenAiExtractionResult<OpenAiExtractedWine>> {
  const { responseJson, parsedContent, usage } = await callOpenAiJsonVision(
    WINE_SCAN_MODEL,
    WINE_SCAN_PROMPT,
    'Extract this wine bottle\'s details from these photos.',
    imageDataUrls,
  )
  return { parsed: coerceExtractedWine(parsedContent), responseJson, usage, costUsd: estimateCostUsd(usage, WINE_SCAN_MODEL) }
}
