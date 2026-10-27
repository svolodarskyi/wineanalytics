import type { SupabaseClient } from '@supabase/supabase-js'

const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Native fetch-based decode instead of atob + a manual byte-by-byte
 * Uint8Array loop - meaningfully less peak memory for large (multi-MB phone
 * photo) data URLs, which matters on memory-constrained mobile browsers.
 */
async function dataUrlToBlob(dataUrl: string): Promise<{ blob: Blob; ext: string }> {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  if (!match) throw new Error('Expected a base64 data URL.')
  const [, mime] = match
  const blob = await fetch(dataUrl).then((r) => r.blob())
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'bin'
  return { blob, ext }
}

/** Uploads a `data:` URL to Storage and returns the object path (never a signed URL - that's resolved per-read, see resolveSignedUrl). */
export async function uploadDataUrl(
  supabase: SupabaseClient,
  bucket: string,
  pathWithoutExt: string,
  dataUrl: string,
): Promise<string> {
  const { blob, ext } = await dataUrlToBlob(dataUrl)
  const path = `${pathWithoutExt}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type })
  if (error) throw new Error(error.message)
  return path
}

/**
 * Resolves a stored object path to a time-limited signed URL for display
 * (both buckets are private). Returns null for a null path or a signing
 * failure - a broken photo/document shouldn't fail the whole list/get call.
 */
export async function resolveSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string | null,
): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

export async function removeObject(supabase: SupabaseClient, bucket: string, path: string | null): Promise<void> {
  if (!path) return
  await supabase.storage.from(bucket).remove([path])
}
