/**
 * Shared helpers for e2e tests against STAGING environment.
 * Do NOT run against production.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local without a dep on dotenv
try {
  const raw = readFileSync('.env.local', 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const k = trimmed.slice(0, eqIdx).trim()
    const v = trimmed.slice(eqIdx + 1).trim()
    if (!(k in process.env)) process.env[k] = v
  }
} catch { /* fine, caller may export vars manually */ }

export const STAGING_URL = process.env.STAGING_SUPABASE_URL!
export const STAGING_ANON = process.env.STAGING_ANON_KEY!
export const STAGING_SERVICE = process.env.STAGING_SERVICE_ROLE_KEY!
export const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN!
export const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID!
export const CLICKUP_TEST_LIST_ID = '901520762121'

if (!STAGING_URL?.includes('ahlthosftngdcryltapu')) {
  throw new Error('SAFETY: STAGING_SUPABASE_URL is not the expected staging project. Aborting.')
}

export function adminClient(): SupabaseClient {
  return createClient(STAGING_URL, STAGING_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient(): SupabaseClient {
  return createClient(STAGING_URL, STAGING_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function signInAs(email: string, password: string): Promise<{ client: SupabaseClient; userId: string; token: string }> {
  const client = anonClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message}`)
  return { client, userId: data.user.id, token: data.session.access_token }
}

export async function callEdgeFunction(name: string, token: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${STAGING_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

export async function clickupCall(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.clickup.com/api/v2${path}`, {
    ...init,
    headers: {
      Authorization: CLICKUP_TOKEN,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

export async function createClickupTestTask(name: string, listId = CLICKUP_TEST_LIST_ID): Promise<{ id: string; url: string }> {
  const res = await clickupCall(`/list/${listId}/task`, {
    method: 'POST',
    body: JSON.stringify({ name, status: 'to do' }),
  })
  if (!res.ok) throw new Error(`ClickUp createTask failed: ${res.status} ${await res.text()}`)
  const task = await res.json()
  return { id: task.id, url: task.url }
}

export async function deleteClickupTask(taskId: string): Promise<void> {
  const res = await clickupCall(`/task/${taskId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    console.warn(`ClickUp deleteTask ${taskId}: ${res.status} ${await res.text()}`)
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`)
}

export function green(s: string): string { return `\x1b[32m${s}\x1b[0m` }
export function red(s: string): string { return `\x1b[31m${s}\x1b[0m` }
export function yellow(s: string): string { return `\x1b[33m${s}\x1b[0m` }
