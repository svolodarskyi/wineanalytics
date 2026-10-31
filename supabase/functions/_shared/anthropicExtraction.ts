// Alternative to extractInvoiceWithOpenAi (invoiceExtraction.ts) using Claude
// instead of GPT-4.1. Selected via the INVOICE_OCR_PROVIDER env var in
// index.ts - this is now the default path; set INVOICE_OCR_PROVIDER=openai to fall back to GPT-4.1.
import Anthropic from 'npm:@anthropic-ai/sdk@0.68.0'
import { coerceExtractedInvoice, INVOICE_EXTRACTION_PROMPT, type ExtractedInvoice, type TokenUsage, type VisionExtractionResult } from './invoiceExtraction.ts'

// "For now" Haiku - cheapest vision-capable Claude model. Revisit if
// extraction accuracy needs it (Sonnet/Opus support the same request shape).
export const ANTHROPIC_INVOICE_OCR_MODEL = 'claude-haiku-4-5'

/** USD per token for Claude Haiku 4.5, per platform.claude.com/docs/en/about-claude/pricing. */
const ANTHROPIC_PRICE_PER_TOKEN_USD = { input: 1 / 1_000_000, output: 5 / 1_000_000 }

export function estimateAnthropicCostUsd(usage: TokenUsage): number {
  return usage.promptTokens * ANTHROPIC_PRICE_PER_TOKEN_USD.input + usage.completionTokens * ANTHROPIC_PRICE_PER_TOKEN_USD.output
}

const WINE_CATEGORY_ENUM = ['wine', 'hard_liquor', 'beer', 'sake', 'other'] as const

const WINE_STYLE_ENUM = ['red', 'white', 'sparkling', 'other'] as const

const WINE_COUNTRY_ENUM = [
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
] as const

// Claude's structured-output validator rejects `type: [...]` unions (rather
// than accepting them like standard JSON Schema) - nullable fields must use
// `anyOf` instead. See claude-api skill's JSON Schema Limitations.
const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const NULLABLE_NUMBER = { anyOf: [{ type: 'number' }, { type: 'null' }] }
const NULLABLE_CATEGORY = { anyOf: [{ type: 'string', enum: WINE_CATEGORY_ENUM }, { type: 'null' }] }
const NULLABLE_STYLE = { anyOf: [{ type: 'string', enum: WINE_STYLE_ENUM }, { type: 'null' }] }
const NULLABLE_COUNTRY = { anyOf: [{ type: 'string', enum: WINE_COUNTRY_ENUM }, { type: 'null' }] }

const INVOICE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    vendorName: NULLABLE_STRING,
    invoiceDate: NULLABLE_STRING,
    totalAmount: { type: 'number' },
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemName: { type: 'string' },
          volumeMl: NULLABLE_NUMBER,
          category: NULLABLE_CATEGORY,
          style: NULLABLE_STYLE,
          country: NULLABLE_COUNTRY,
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          lineTotal: { type: 'number' },
          packSize: { type: 'number' },
        },
        required: ['itemName', 'volumeMl', 'category', 'style', 'country', 'quantity', 'unitPrice', 'lineTotal', 'packSize'],
        additionalProperties: false,
      },
    },
    additionalCharges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { description: { type: 'string' }, amount: { type: 'number' } },
        required: ['description', 'amount'],
        additionalProperties: false,
      },
    },
  },
  required: ['vendorName', 'invoiceDate', 'totalAmount', 'lineItems', 'additionalCharges'],
  additionalProperties: false,
}

export async function extractInvoiceWithClaude(imageUrl: string, anthropicApiKey: string): Promise<VisionExtractionResult> {
  const client = new Anthropic({ apiKey: anthropicApiKey })

  const response = await client.messages.create({
    model: ANTHROPIC_INVOICE_OCR_MODEL,
    max_tokens: 4096,
    system: INVOICE_EXTRACTION_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the invoice data from this image.' },
          { type: 'image', source: { type: 'url', url: imageUrl } },
        ],
      },
    ],
    output_config: { format: { type: 'json_schema', schema: INVOICE_JSON_SCHEMA } },
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to process this invoice image.')
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response did not include any text content.')
  }

  let parsedContent: unknown
  try {
    parsedContent = JSON.parse(textBlock.text)
  } catch {
    throw new Error('Claude returned a response that was not valid JSON.')
  }

  const usage: TokenUsage = {
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
  }

  const parsed: ExtractedInvoice = coerceExtractedInvoice(parsedContent)
  return { responseJson: response, parsed, usage }
}
