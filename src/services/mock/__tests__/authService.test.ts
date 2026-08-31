import { beforeEach, describe, expect, it } from 'vitest'
import { createMockAuthService } from '../authService'

describe('mock auth service', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('has no current user before logging in', async () => {
    const auth = createMockAuthService(0)
    expect(await auth.getCurrentUser()).toBeNull()
  })

  it('logs in with any non-empty email/password and persists the session', async () => {
    const auth = createMockAuthService(0)
    const user = await auth.login('demo@restaurant.com', 'password')
    expect(user.email).toBe('demo@restaurant.com')

    // A second service instance reads the same persisted session.
    const auth2 = createMockAuthService(0)
    expect(await auth2.getCurrentUser()).toEqual(user)
  })

  it('rejects empty email or password', async () => {
    const auth = createMockAuthService(0)
    await expect(auth.login('', 'password')).rejects.toThrow(/required/i)
    await expect(auth.login('demo@restaurant.com', '')).rejects.toThrow(/required/i)
  })

  it('logout clears the session', async () => {
    const auth = createMockAuthService(0)
    await auth.login('demo@restaurant.com', 'password')
    await auth.logout()
    expect(await auth.getCurrentUser()).toBeNull()
  })
})
