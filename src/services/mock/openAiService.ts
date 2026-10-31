import { extractInvoiceImage, extractWinePhotos } from '../openai/client'
import { INVOICE_OCR_MODEL, WINE_SCAN_MODEL } from '../openai/pricing'
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
          model: INVOICE_OCR_MODEL,
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
            volumeMlRaw: item.volumeMl,
            categoryRaw: item.category,
            styleRaw: item.style,
            countryRaw: item.country,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            packSize: item.packSize,
          })),
          additionalCharges: result.parsed.additionalCharges,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OpenAI request failed.'
        store.addOpenAiLog({
          id: createId('openai'),
          createdAt: new Date().toISOString(),
          model: INVOICE_OCR_MODEL,
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

    async extractWine(input: { imageDataUrls: string[] }) {
      const fileName = `bottle scan (${input.imageDataUrls.length} photo${input.imageDataUrls.length === 1 ? '' : 's'})`
      try {
        const result = await extractWinePhotos(input.imageDataUrls)
        store.addOpenAiLog({
          id: createId('openai'),
          createdAt: new Date().toISOString(),
          model: WINE_SCAN_MODEL,
          fileName,
          imageDataUrl: input.imageDataUrls[0] ?? '',
          responseJson: result.responseJson,
          usage: result.usage,
          costUsd: result.costUsd,
          error: null,
        })
        return result.parsed
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OpenAI request failed.'
        store.addOpenAiLog({
          id: createId('openai'),
          createdAt: new Date().toISOString(),
          model: WINE_SCAN_MODEL,
          fileName,
          imageDataUrl: input.imageDataUrls[0] ?? '',
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
