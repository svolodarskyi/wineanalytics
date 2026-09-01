import type { Services } from '../types'
import { createMockAlertService } from './alertService'
import { createMockAuthService } from './authService'
import { createMockInvoiceService } from './invoiceService'
import { createOpenAiService } from './openAiService'
import { MockStore, type MockStoreOptions } from './store'
import { createMockVendorService } from './vendorService'
import { createMockWineService } from './wineService'

export interface MockServicesOptions extends MockStoreOptions {
  /** Simulated network latency for every call, in ms. Defaults to 250. */
  latencyMs?: number
  /** Simulated OCR + matching turnaround time after an invoice is uploaded, in ms. Defaults to 1200. */
  processingDelayMs?: number
}

/**
 * Builds a fully self-contained mock backend: an in-memory store plus one
 * implementation per service interface. Each call returns an independent
 * instance, so the app singleton and each test file get isolated state.
 */
export function createMockServices(options: MockServicesOptions = {}): Services {
  const { latencyMs = 250, processingDelayMs = 1200, ...storeOptions } = options
  const store = new MockStore(storeOptions)
  const openai = createOpenAiService(store, latencyMs)

  return {
    auth: createMockAuthService(latencyMs),
    wines: createMockWineService(store, latencyMs),
    vendors: createMockVendorService(store, latencyMs),
    invoices: createMockInvoiceService(store, { latencyMs, processingDelayMs }, openai),
    openai,
    alerts: createMockAlertService(store, latencyMs),
  }
}

export { MockStore }
