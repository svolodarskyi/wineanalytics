import type { Services } from '../types'
import { createSupabaseAuthService } from './authService'
import { getSupabaseClient } from './client'
import { createSupabaseInvoiceService } from './invoiceService'
import { createSupabaseOpenAiService } from './openAiService'
import { createSupabaseVendorService } from './vendorService'
import { createSupabaseWineService } from './wineService'

/**
 * Builds the real backend: one implementation per service interface, all
 * sharing a single Supabase client. Requires the `wine_*` schema (see
 * supabase/migrations/) to already exist - see _docs/supabase-plan.md.
 */
export function createSupabaseServices(): Services {
  const supabase = getSupabaseClient()
  const openai = createSupabaseOpenAiService(supabase)

  return {
    auth: createSupabaseAuthService(supabase),
    wines: createSupabaseWineService(supabase),
    vendors: createSupabaseVendorService(supabase),
    invoices: createSupabaseInvoiceService(supabase, openai),
    openai,
  }
}
