import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AuthUser } from '../../types'
import type { AuthService } from '../types'

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user || !user.email) return null
  return { id: user.id, email: user.email }
}

export function createSupabaseAuthService(supabase: SupabaseClient): AuthService {
  return {
    async getCurrentUser(): Promise<AuthUser | null> {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw new Error(error.message)
      return toAuthUser(data.session?.user)
    },

    async login(email: string, password: string): Promise<AuthUser> {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
      const user = toAuthUser(data.user)
      if (!user) throw new Error('Sign in did not return a user.')
      return user
    },

    async logout(): Promise<void> {
      const { error } = await supabase.auth.signOut()
      if (error) throw new Error(error.message)
    },
  }
}
