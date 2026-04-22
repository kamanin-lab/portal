import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase-Anmeldedaten fehlen. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in .env.local setzen.')
}

export const REMEMBER_ME_KEY = 'portal-remember-me'

export function isRemembered(): boolean {
  try {
    // default true (fail-safe — don't log out user on quirks)
    return localStorage.getItem(REMEMBER_ME_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeRememberFlag(remember: boolean): void {
  try {
    if (remember) localStorage.setItem(REMEMBER_ME_KEY, '1')
    else localStorage.setItem(REMEMBER_ME_KEY, '0')
  } catch { /* noop */ }
}

// Hybrid adapter: routes to localStorage or sessionStorage based on flag.
// getItem falls back to the *other* store so existing sessions are picked up
// (migration from current localStorage-only setup, and switch-mode flows).
const hybridStorage = {
  getItem: (key: string): string | null => {
    try {
      const primary = isRemembered() ? localStorage : sessionStorage
      const secondary = isRemembered() ? sessionStorage : localStorage
      return primary.getItem(key) ?? secondary.getItem(key)
    } catch { return null }
  },
  setItem: (key: string, value: string): void => {
    try {
      const target = isRemembered() ? localStorage : sessionStorage
      const other = isRemembered() ? sessionStorage : localStorage
      target.setItem(key, value)
      other.removeItem(key) // keep stores in sync — prevent stale copy
    } catch { /* noop */ }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key) } catch { /* noop */ }
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: hybridStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
