import { createContext, useContext, useState, useEffect, useCallback, type ReactNode, createElement } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'
import { toast } from 'sonner'
import { startActivityTracking, getIdleMs, SESSION_TIMEOUT_MS, SESSION_WARNING_MS } from '@/shared/lib/session-timeout'
import type { Profile } from '@/shared/types/common'

const STAGING_AUTH_BYPASS = false
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
  email_notifications: true,
  notification_preferences: {
    task_review: true,
    task_completed: true,
    team_comment: true,
    support_response: true,
    reminders: true,
    new_recommendation: true,
    unread_digest: true,
    project_task_ready: true,
    project_step_completed: true,
    project_messages: true,
    peer_messages: true,
    weekly_summary: true,
  },
  avatar_url: null,
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
  refreshProfile: () => Promise<void>
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
      if (event === 'PASSWORD_RECOVERY') {
        // Recovery link clicked (invite flow) — redirect to dedicated password-set page
        // Only redirect if not already there (prevents loop)
        if (!window.location.pathname.startsWith('/passwort-setzen')) {
          window.location.href = '/passwort-setzen'
        }
        return
      }
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

  // Session inactivity timeout
  useEffect(() => {
    if (STAGING_AUTH_BYPASS || !user) return

    const stopTracking = startActivityTracking()
    let warnedAboutExpiry = false

    const checkInterval = setInterval(() => {
      const idle = getIdleMs()
      const remaining = SESSION_TIMEOUT_MS - idle

      if (remaining <= 0) {
        clearInterval(checkInterval)
        stopTracking()
        supabase.auth.signOut().then(() => {
          setUser(null)
          setSession(null)
          setProfile(null)
          toast.info('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.')
        })
      } else if (!warnedAboutExpiry && remaining <= SESSION_WARNING_MS) {
        warnedAboutExpiry = true
        toast.warning('Ihre Sitzung läuft in 5 Minuten ab. Klicken Sie irgendwo, um sie zu verlängern.', {
          duration: 30_000,
        })
      }
    }, 60_000) // check every minute

    return () => {
      clearInterval(checkInterval)
      stopTracking()
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/inbox` },
    })
    return { error: error as Error | null }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/konto?action=change-password`,
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

  const refreshProfile = useCallback(async () => {
    const currentUser = user
    if (currentUser) {
      await loadProfile(currentUser.id)
    }
  }, [user, loadProfile])

  const value: AuthContextValue = {
    user, session, profile, isLoading,
    isAuthenticated: STAGING_AUTH_BYPASS ? true : !!session,
    signIn, signInWithMagicLink, resetPassword, updatePassword, signOut, refreshProfile,
  }

  return createElement(AuthContext.Provider, { value }, children)
}
