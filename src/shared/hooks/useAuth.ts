import { createContext, useContext, useState, useEffect, useCallback, type ReactNode, createElement } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'
import type { Profile } from '@/shared/types/common'

const STAGING_AUTH_BYPASS = true
const STAGING_BYPASS_USER_ID = 'staging-auth-bypass-user'

const STAGING_BYPASS_USER = {
  id: STAGING_BYPASS_USER_ID,
  email: 'yuri@kamanin.at',
} as User

const STAGING_BYPASS_PROFILE: Profile = {
  id: STAGING_BYPASS_USER_ID,
  email: 'yuri@kamanin.at',
  full_name: 'Yuri Kamanin',
  company_name: 'KAMANIN',
  clickup_list_ids: null,
  email_notifications: true,
  avatar_url: null,
  support_task_id: null,
  clickup_chat_channel_id: null,
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(STAGING_AUTH_BYPASS ? STAGING_BYPASS_USER : null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(STAGING_AUTH_BYPASS ? STAGING_BYPASS_PROFILE : null)
  const [isLoading, setIsLoading] = useState(!STAGING_AUTH_BYPASS)

  const loadProfile = useCallback(async (userId: string) => {
    const p = await fetchProfile(userId)
    setProfile(p)
  }, [])

  useEffect(() => {
    if (STAGING_AUTH_BYPASS) {
      setUser(STAGING_BYPASS_USER)
      setSession(null)
      setProfile(STAGING_BYPASS_PROFILE)
      setIsLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => {
          if (mounted) setIsLoading(false)
        })
      } else {
        setIsLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'INITIAL_SESSION') return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setTimeout(() => { if (mounted) loadProfile(session.user.id) }, 0)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    })
    return { error: error as Error | null }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    return { error: error as Error | null }
  }

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
  }

  const value: AuthContextValue = {
    user, session, profile, isLoading,
    isAuthenticated: STAGING_AUTH_BYPASS ? true : !!session,
    signIn, signInWithMagicLink, resetPassword, updatePassword, signOut,
  }

  return createElement(AuthContext.Provider, { value }, children)
}
