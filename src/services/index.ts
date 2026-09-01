import { createMockServices } from './mock'
import { createSupabaseServices } from './supabase'
import { isSupabaseConfigured } from './supabase/client'
import type { Services } from './types'

/**
 * Single composition point for the backend. Every part of the app imports
 * `services` from here instead of calling fetch/Supabase/OpenAI directly.
 *
 * Two separate gates, not one: VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY
 * being set only means Supabase Auth can be exercised in isolation (see
 * _docs/supabase-plan.md) - it does NOT mean the wine_* schema exists yet.
 * VITE_USE_SUPABASE="true" is the explicit cutover switch, flipped once the
 * migration in supabase/migrations/ has actually been applied. Until then
 * this keeps resolving to the mock, even with credentials configured.
 */
const useSupabase = isSupabaseConfigured && import.meta.env.VITE_USE_SUPABASE === 'true'

export const services: Services = useSupabase ? createSupabaseServices() : createMockServices()

export type {
  AuthService,
  InvoiceService,
  ListOptions,
  OpenAiExtractedLine,
  OpenAiService,
  Services,
  VendorService,
  WineListOptions,
  WineService,
} from './types'
