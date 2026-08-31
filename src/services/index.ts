import { createMockServices } from './mock'
import type { Services } from './types'

/**
 * Single composition point for the backend. Every part of the app imports
 * `services` from here instead of calling fetch/Supabase/OpenAI directly.
 *
 * There is currently no real backend, so this always resolves to the mock
 * implementation. Swapping in a real one later means writing a
 * `createRealServices()` that satisfies the same `Services` interface and
 * choosing between the two here - no other file in the app needs to change.
 */
export const services: Services = createMockServices()

export type {
  AuthService,
  InvoiceService,
  InvoiceSortBy,
  ListOptions,
  Services,
  VendorService,
  WineListOptions,
  WineService,
  WineSortBy,
} from './types'
