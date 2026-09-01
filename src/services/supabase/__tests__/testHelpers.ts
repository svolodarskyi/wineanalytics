import { vi } from 'vitest'

export interface FakeQueryResult {
  data?: unknown
  error?: { message: string; code?: string } | null
  count?: number | null
}

/**
 * Minimal stand-in for a Supabase PostgrestFilterBuilder: every filter/modifier
 * method returns itself (so any chain shape works), and the builder itself is
 * thenable so `await query` resolves to `result` without a terminal call like
 * `.single()`.
 */
export function fakeQueryBuilder(result: FakeQueryResult) {
  const resolved = { data: null, error: null, count: null, ...result }
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(resolved)),
    maybeSingle: vi.fn(() => Promise.resolve(resolved)),
    then: (onFulfilled: (value: FakeQueryResult) => unknown) => Promise.resolve(resolved).then(onFulfilled),
  }
  return builder
}

export interface FakeStorageOptions {
  uploadError?: { message: string } | null
  signedUrl?: string | null
  signError?: { message: string } | null
}

/** Minimal stand-in for supabase.storage.from(bucket), one fixed behavior for every bucket/path. */
export function fakeStorage(options: FakeStorageOptions = {}) {
  const bucketApi = {
    upload: vi.fn((..._args: unknown[]) => Promise.resolve({ error: options.uploadError ?? null })),
    createSignedUrl: vi.fn(() =>
      Promise.resolve({
        data: options.signError ? null : { signedUrl: options.signedUrl ?? 'https://signed.example/photo.png' },
        error: options.signError ?? null,
      }),
    ),
    remove: vi.fn(() => Promise.resolve({ error: null })),
  }
  return { from: vi.fn(() => bucketApi), bucketApi }
}
