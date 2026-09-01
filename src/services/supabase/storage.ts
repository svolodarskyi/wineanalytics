import type { SupabaseClient } from '@supabase/supabase-js'

const SIGNED_URL_TTL_SECONDS = 60 * 60

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!match) throw new Error('Expected a base64 data URL.')
  const [, mime, base64] = match
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'bin'
  return { blob: new Blob([bytes], { type: mime }), ext }
}

/** Uploads a `data:` URL to Storage and returns the object path (never a signed URL - that's resolved per-read, see resolveSignedUrl). */
export async function uploadDataUrl(
  supabase: SupabaseClient,
  bucket: string,
  pathWithoutExt: string,
  dataUrl: string,
): Promise<string> {
  const { blob, ext } = dataUrlToBlob(dataUrl)
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
