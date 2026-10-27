import type { OpenAiUsage } from '../../types'

/** Invoice line items/totals feed straight into inventory and cost numbers, so accuracy matters more than cost here. */
export const INVOICE_OCR_MODEL = 'gpt-4.1'
/** Wine label scanning just prefills a form the user reviews before saving, so the cheaper model is fine. */
export const WINE_SCAN_MODEL = 'gpt-4o-mini'

/**
 * USD per token, as published at https://openai.com/api/pricing when this was
 * written. OpenAI changes pricing occasionally - update these numbers if the
 * cost log starts looking off.
 */
const PRICE_PER_TOKEN_USD: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2 / 1_000_000, output: 8 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
}

export function estimateCostUsd(usage: OpenAiUsage, model: string): number {
  const price = PRICE_PER_TOKEN_USD[model] ?? PRICE_PER_TOKEN_USD['gpt-4o-mini']
  return usage.promptTokens * price.input + usage.completionTokens * price.output
}
