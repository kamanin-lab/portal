import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase-Anmeldedaten fehlen. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in .env.local setzen.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

if (import.meta.env.DEV) {
  const diagChannel = supabase.channel('dev-diagnostics');
  diagChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') console.log('[Realtime] Connected');
    if (status === 'CLOSED') console.warn('[Realtime] Disconnected');
    if (status === 'CHANNEL_ERROR') console.error('[Realtime] Channel error');
  });
}
