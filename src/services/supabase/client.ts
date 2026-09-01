import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** True once VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY are set, so index.ts can decide mock vs. real. */
export const isSupabaseConfigured = Boolean(url && publishableKey)

let client: SupabaseClient | null = null

/** Lazily creates the client so importing this module never throws when Supabase isn't configured yet. */
export function getSupabaseClient(): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (the publishable/anon key, never the secret/service key) in .env.',
    )
  }
  if (!client) {
    client = createClient(url, publishableKey)
  }
  return client
}
