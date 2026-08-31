import type { AuthUser } from '../../types'
import type { AuthService } from '../types'
import { delay } from './delay'

const STORAGE_KEY = 'wineanalytics.mock-auth-user'

function readStoredUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function writeStoredUser(user: AuthUser | null): void {
  try {
    if (user) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage may be unavailable (e.g. private browsing); the session
    // simply won't persist across reloads in that case.
  }
}

/**
 * Stands in for Supabase Auth: any non-empty email/password combination
 * "signs in" and the session is remembered in localStorage.
 */
export function createMockAuthService(latencyMs: number): AuthService {
  return {
    async getCurrentUser(): Promise<AuthUser | null> {
      await delay(latencyMs)
      return readStoredUser()
    },

    async login(email: string, password: string): Promise<AuthUser> {
      await delay(latencyMs)
      if (!email.trim() || !password.trim()) {
        throw new Error('Email and password are required.')
      }
      const user: AuthUser = { id: `user_${email.trim().toLowerCase()}`, email: email.trim() }
      writeStoredUser(user)
      return user
    },

    async logout(): Promise<void> {
      await delay(latencyMs)
      writeStoredUser(null)
    },
  }
}
