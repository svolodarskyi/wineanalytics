import type { OpenAiUsage } from '../../types'

export const OPENAI_MODEL = 'gpt-4o-mini'

/**
 * USD per token, as published at https://openai.com/api/pricing when this was
 * written. OpenAI changes pricing occasionally - update these two numbers if
 * the cost log starts looking off.
 */
const PRICE_PER_TOKEN_USD = {
  input: 0.15 / 1_000_000,
  output: 0.6 / 1_000_000,
}

export function estimateCostUsd(usage: OpenAiUsage): number {
  return usage.promptTokens * PRICE_PER_TOKEN_USD.input + usage.completionTokens * PRICE_PER_TOKEN_USD.output
}
