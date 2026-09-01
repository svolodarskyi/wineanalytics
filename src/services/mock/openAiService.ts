import { extractInvoiceImage } from '../openai/client'
import { OPENAI_MODEL } from '../openai/pricing'
import type { OpenAiService } from '../types'
import { delay } from './delay'
import { createId } from './ids'
import type { MockStore } from './store'

/**
 * Lives in mock/ because it logs through the same in-memory MockStore as
 * everything else, but the OpenAI call itself is real - see
 * services/openai/client.ts.
 */
export function createOpenAiService(store: MockStore, latencyMs: number): OpenAiService {
  return {
    async extractInvoice(input: { fileName: string; imageDataUrl: string; invoiceId?: string }) {
      try {
        const result = await extractInvoiceImage(input.imageDataUrl)
        store.addOpenAiLog({
          id: createId('openai'),
          createdAt: new Date().toISOString(),
          model: OPENAI_MODEL,
          fileName: input.fileName,
          imageDataUrl: input.imageDataUrl,
          responseJson: result.responseJson,
          usage: result.usage,
          costUsd: result.costUsd,
          error: null,
        })
        return {
          vendorNameRaw: result.parsed.vendorName ?? '',
          invoiceDate: result.parsed.invoiceDate,
          totalAmount: result.parsed.totalAmount,
          lines: result.parsed.lineItems.map((item) => ({
            itemNameRaw: item.itemName,
            volumeRaw: item.volume,
            categoryRaw: item.category,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
          additionalCharges: result.parsed.additionalCharges,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OpenAI request failed.'
        store.addOpenAiLog({
          id: createId('openai'),
          createdAt: new Date().toISOString(),
          model: OPENAI_MODEL,
          fileName: input.fileName,
          imageDataUrl: input.imageDataUrl,
          responseJson: null,
          usage: null,
          costUsd: 0,
          error: message,
        })
        throw err
      }
    },

    async listLogs() {
      await delay(latencyMs)
      return store.openAiLogs
    },
  }
}
