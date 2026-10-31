// Ported from src/services/openai/prompt.ts and src/services/openai/client.ts -
// keep in sync. Duplicated rather than imported across the supabase/functions
// boundary (see plan notes: bundler-version-dependent, and client.ts has a live
// import.meta.env reference sitting next to the portable parts).

export type WineCategory = 'wine' | 'hard_liquor' | 'beer' | 'sake' | 'other'

export type WineStyle = 'red' | 'white' | 'sparkling' | 'other'

export type WineCountry =
  | 'france'
  | 'italy'
  | 'usa'
  | 'spain'
  | 'germany'
  | 'argentina'
  | 'chile'
  | 'australia'
  | 'new_zealand'
  | 'portugal'
  | 'south_africa'
  | 'japan'
  | 'other'

const WINE_CATEGORIES: readonly WineCategory[] = ['wine', 'hard_liquor', 'beer', 'sake', 'other']
const WINE_STYLES: readonly WineStyle[] = ['red', 'white', 'sparkling', 'other']
const WINE_COUNTRIES: readonly WineCountry[] = [
  'france',
  'italy',
  'usa',
  'spain',
  'germany',
  'argentina',
  'chile',
  'australia',
  'new_zealand',
  'portugal',
  'south_africa',
  'japan',
  'other',
]

export const OPENAI_INVOICE_OCR_MODEL = 'gpt-4.1'

/** USD per token for gpt-4.1, as published at https://openai.com/api/pricing - keep in sync with src/services/openai/pricing.ts. */
const OPENAI_PRICE_PER_TOKEN_USD = { input: 2 / 1_000_000, output: 8 / 1_000_000 }

export function estimateOpenAiCostUsd(usage: TokenUsage): number {
  return usage.promptTokens * OPENAI_PRICE_PER_TOKEN_USD.input + usage.completionTokens * OPENAI_PRICE_PER_TOKEN_USD.output
}

export const INVOICE_EXTRACTION_PROMPT = `You are extracting structured data from a photo or scan of a beverage distributor invoice - wine, beer, hard liquor, sake, or other drinks.

Read the image carefully and return a single JSON object with exactly this shape:

{
  "vendorName": string,
  "invoiceDate": string | null,   // ISO 8601 date (YYYY-MM-DD) if visible, else null
  "totalAmount": number,          // the invoice's total amount due, 0 if not visible
  "lineItems": [
    {
      "itemName": string,        // the product name as printed, do not normalize or translate it - do NOT include the bottle/can size or pack size here, those go in "volumeMl" and "packSize"
      "volumeMl": number | null, // bottle/can size in milliliters - convert whatever unit is printed (750ml -> 750, 1.5L -> 1500, 375ml -> 375, a 25.4oz bottle -> 750, a 12oz can -> 355) - null if not shown
      "category": "wine" | "hard_liquor" | "beer" | "sake" | "other" | null,
      "style": "red" | "white" | "sparkling" | "other" | null,   // ONLY when category is "wine" - null for every other category
      "country": "france" | "italy" | "usa" | "spain" | "germany" | "argentina" | "chile" | "australia" | "new_zealand" | "portugal" | "south_africa" | "japan" | "other" | null,   // ONLY when category is "wine" - null for every other category
      "quantity": number,        // how many of what's printed on this line - a pack/case count if the line is sold as packs (see packSize), not the total number of individual bottles/cans
      "unitPrice": number,       // price for one "quantity" unit as printed - a pack's price if this line is a pack, not a single bottle/can's price
      "lineTotal": number,
      "packSize": number         // units (bottles/cans) per pack/case as printed, e.g. a "6-PACK" or "CASE/24" line is 6 or 24 - 1 if the line is sold individually or no pack size is shown
    }
  ],
  "additionalCharges": [
    {
      "description": string,    // e.g. "Sales Tax", "Bottle Deposit", "GST", "Shipping", "Fuel Surcharge", "Discount"
      "amount": number
    }
  ]
}

Rules:
- Output ONLY the JSON object. No markdown fences, no commentary, no explanation.
- If a field cannot be determined from the image, use null for strings/dates, 0 for numbers, 1 for packSize, and [] for lineItems/additionalCharges.
- Preserve item names exactly as printed on the invoice, including vintage years if shown, but leave the
  bottle/can size and pack size out of itemName - put them in "volumeMl" and "packSize" instead.
- Infer "category" from the product name and any label details visible (e.g. "Cabernet Sauvignon", "Sauvignon
  Blanc", "Champagne"/"Prosecco"/"Brut", and "Port"/"Sherry" are all wine, "IPA"/"Lager"/"Ale" is beer,
  "Vodka"/"Whiskey"/"Tequila" is hard_liquor, "Sake"/"Junmai"/"Nigori" is sake). Use null only if you
  genuinely cannot tell - do not guess "other" as a default.
- Only when "category" is "wine", also infer "style" (red/white/sparkling, or "other" for rosé/dessert/
  fortified/anything else) and "country" (country of origin, e.g. "Product of Italy" or implied by the
  grape/appellation/producer - not the language on the label). Leave both null if category isn't "wine",
  or if you genuinely cannot tell even though it is wine - do not guess.
- lineItems is for every beverage product being purchased, not just wine - beer, hard liquor, sake, and
  other drinks all belong here too. Put every other charge or adjustment on the invoice - tax,
  GST/VAT, bottle/case deposits, shipping, fuel surcharges, fees, discounts, credits - into
  additionalCharges instead, never into lineItems. Use a negative amount for discounts/credits.
- Numbers must be plain JSON numbers (no currency symbols, no thousands separators).`

export interface ExtractedLineItem {
  itemName: string
  volumeMl: number | null
  category: WineCategory | null
  /** Only meaningful when category is 'wine'. */
  style: WineStyle | null
  /** Only meaningful when category is 'wine'. */
  country: WineCountry | null
  quantity: number
  unitPrice: number
  lineTotal: number
  packSize: number
}

export interface ExtractedCharge {
  description: string
  amount: number
}

export interface ExtractedInvoice {
  vendorName: string | null
  invoiceDate: string | null
  totalAmount: number
  lineItems: ExtractedLineItem[]
  additionalCharges: ExtractedCharge[]
}

/** Provider-agnostic - both OpenAI and Anthropic usage map onto this shape. */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
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

function toStyleOrNull(value: unknown): WineStyle | null {
  return WINE_STYLES.includes(value as WineStyle) ? (value as WineStyle) : null
}

function toCountryOrNull(value: unknown): WineCountry | null {
  return WINE_COUNTRIES.includes(value as WineCountry) ? (value as WineCountry) : null
}

/** Units per pack (a "6-pack", "case of 24") - 1 (sold individually) for anything unparseable or less than 1. */
function toPackSize(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) && num >= 1 ? Math.round(num) : 1
}

/** The model is instructed to return this shape, but never trust it blindly - coerce defensively. Shared across providers. */
export function coerceExtractedInvoice(value: unknown): ExtractedInvoice {
  const obj = (value ?? {}) as Record<string, unknown>
  const rawLineItems = Array.isArray(obj.lineItems) ? obj.lineItems : []
  const rawAdditionalCharges = Array.isArray(obj.additionalCharges) ? obj.additionalCharges : []
  return {
    vendorName: toTrimmedStringOrNull(obj.vendorName),
    invoiceDate: toTrimmedStringOrNull(obj.invoiceDate),
    totalAmount: toNumber(obj.totalAmount),
    lineItems: rawLineItems.map((item) => {
      const line = (item ?? {}) as Record<string, unknown>
      const category = toCategoryOrNull(line.category)
      return {
        itemName: typeof line.itemName === 'string' ? line.itemName : 'Unknown item',
        volumeMl: toPositiveIntOrNull(line.volumeMl),
        category,
        // Style/country only make sense for wine - ignore the model's guess otherwise.
        style: category === 'wine' ? toStyleOrNull(line.style) : null,
        country: category === 'wine' ? toCountryOrNull(line.country) : null,
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

export interface VisionExtractionResult {
  responseJson: unknown
  parsed: ExtractedInvoice
  usage: TokenUsage
}

/** Straight port of callOpenAiJsonVision in src/services/openai/client.ts, using a server-side key instead of VITE_OPENAI_API_KEY. */
export async function extractInvoiceWithOpenAi(imageUrl: string, openAiApiKey: string): Promise<VisionExtractionResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_INVOICE_OCR_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INVOICE_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the invoice data from this image.' },
            { type: 'image_url', image_url: { url: imageUrl } },
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
  const usage: TokenUsage = {
    promptTokens: toNumber(usageRaw.prompt_tokens),
    completionTokens: toNumber(usageRaw.completion_tokens),
    totalTokens: toNumber(usageRaw.total_tokens),
  }

  return { responseJson, parsed: coerceExtractedInvoice(parsedContent), usage }
}
