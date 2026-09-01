import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True once VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are set, so index.ts can decide mock vs. real. */
export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

/** Lazily creates the client so importing this module never throws when Supabase isn't configured yet. */
export function getSupabaseClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the anon/public key, never the service key) in .env.',
    )
  }
  if (!client) {
    client = createClient(url, anonKey)
  }
  return client
}
