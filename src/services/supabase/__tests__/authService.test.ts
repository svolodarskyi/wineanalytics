import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAuthService } from '../authService'

function fakeSupabase(overrides: Partial<SupabaseClient['auth']> = {}): SupabaseClient {
  return {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      ...overrides,
    },
  } as unknown as SupabaseClient
}

describe('supabase auth service', () => {
  it('getCurrentUser returns null when there is no session', async () => {
    const supabase = fakeSupabase({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    })
    const auth = createSupabaseAuthService(supabase)
    expect(await auth.getCurrentUser()).toBeNull()
  })

  it('getCurrentUser maps the session user', async () => {
    const supabase = fakeSupabase({
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'u1', email: 'demo@restaurant.com' } } },
        error: null,
      }),
    })
    const auth = createSupabaseAuthService(supabase)
    expect(await auth.getCurrentUser()).toEqual({ id: 'u1', email: 'demo@restaurant.com' })
  })

  it('getCurrentUser surfaces a session error', async () => {
    const supabase = fakeSupabase({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'boom' } }),
    })
    const auth = createSupabaseAuthService(supabase)
    await expect(auth.getCurrentUser()).rejects.toThrow('boom')
  })

  it('login signs in and returns the mapped user', async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: 'u2', email: 'demo@restaurant.com' } },
        error: null,
      }),
    })
    const auth = createSupabaseAuthService(supabase)
    const user = await auth.login('demo@restaurant.com', 'password')
    expect(user).toEqual({ id: 'u2', email: 'demo@restaurant.com' })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'demo@restaurant.com',
      password: 'password',
    })
  })

  it('login rejects with the Supabase error message on bad credentials', async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      }),
    })
    const auth = createSupabaseAuthService(supabase)
    await expect(auth.login('demo@restaurant.com', 'wrong')).rejects.toThrow('Invalid login credentials')
  })

  it('logout signs out and surfaces errors', async () => {
    const supabase = fakeSupabase({ signOut: vi.fn().mockResolvedValue({ error: null }) })
    const auth = createSupabaseAuthService(supabase)
    await auth.logout()
    expect(supabase.auth.signOut).toHaveBeenCalled()

    const failing = fakeSupabase({ signOut: vi.fn().mockResolvedValue({ error: { message: 'network down' } }) })
    await expect(createSupabaseAuthService(failing).logout()).rejects.toThrow('network down')
  })
})
