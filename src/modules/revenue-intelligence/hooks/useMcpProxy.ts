import { useMemo } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from 'sonner'

interface McpEnvelope {
  ok: boolean
  code: string
  correlationId: string
  message?: string
  data?: unknown
}

function toastForCode(code: string) {
  switch (code) {
    case 'UNAUTHORIZED':
      toast.error('Sitzung abgelaufen. Bitte neu anmelden.')
      break
    case 'FORBIDDEN':
      toast.error('Kein Zugriff auf Umsatz-Intelligenz.')
      break
    default:
      toast.error('Verbindungsfehler. Bitte erneut versuchen.')
  }
}

// LOCAL-DEV BYPASS — when VITE_MCP_DIRECT_URL is set, skip the Edge Function
// proxy and POST JSON-RPC directly to a local mcp-poc dev server. Used for
// developing against a local Summerfield DDEV when the MCP server cannot be
// reached from Cloud Supabase (DDEV is LAN-only). Remove the env var (or unset
// the variable) for staging/prod — the proxy path is the production contract.
const DIRECT_URL = import.meta.env.VITE_MCP_DIRECT_URL as string | undefined

async function invokeDirect(method: string, params: Record<string, unknown>): Promise<unknown> {
  const id = crypto.randomUUID()
  const res = await fetch(DIRECT_URL!, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json,text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  if (!res.ok) throw new Error(`MCP direct HTTP ${res.status}`)
  const text = await res.text()
  // mcp-poc replies with SSE-style "event: message\ndata: {...}\n\n" when accept includes event-stream
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '))
  const json = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text)
  return json
}

async function invoke(method: string, params: Record<string, unknown>, label: string) {
  let data: unknown
  let error: unknown = null

  if (DIRECT_URL) {
    try {
      data = await invokeDirect(method, params)
    } catch (err) {
      error = err
    }
  } else {
    const result = await supabase.functions.invoke('mcp-proxy', {
      body: { method, params },
    })
    data = result.data
    error = result.error
  }

  // Network-level error (Supabase invoke itself failed)
  if (error) {
    toast.error('Verbindungsfehler. Bitte erneut versuchen.')
    console.error(`[useMcpProxy] ${label} network error:`, error)
    throw error
  }

  // Direct mode returns the raw JSON-RPC response; proxy mode returns
  // McpEnvelope ({ok,code,correlationId,data:JsonRpcResponse}). Normalize so
  // the rest of this function can treat them uniformly.
  if (DIRECT_URL) {
    const rpc = data as { result?: unknown; error?: { code?: number; message?: string } } | undefined
    if (rpc?.error) {
      console.error(`[useMcpProxy] ${label} upstream JSON-RPC error:`, rpc.error)
      toast.error('Verbindungsfehler. Bitte erneut versuchen.')
      throw new Error(`MCP upstream error: ${rpc.error.message ?? 'unknown'}`)
    }
    return rpc?.result ?? data
  }

  const envelope = data as McpEnvelope

  if (!envelope.ok) {
    console.error(
      `[useMcpProxy] ${label} failed: code=${envelope.code} correlationId=${envelope.correlationId} message=${envelope.message ?? ''}`,
    )
    toastForCode(envelope.code)
    throw new Error(`MCP proxy error: ${envelope.code} — ${envelope.message ?? 'unknown'}`)
  }

  // envelope.data is the full JSON-RPC response ({jsonrpc, id, result} or {jsonrpc, id, error}).
  // MCP SDK / @mcp-ui/client expect the unwrapped `result` object (e.g. ReadResourceResult has
  // shape {contents: [...]}, not {result: {contents: [...]}}).
  const rpc = envelope.data as { result?: unknown; error?: { code?: number; message?: string } } | undefined
  if (rpc?.error) {
    const msg = rpc.error.message ?? 'Unknown upstream error'
    console.error(`[useMcpProxy] ${label} upstream JSON-RPC error:`, rpc.error)
    toast.error('Verbindungsfehler. Bitte erneut versuchen.')
    throw new Error(`MCP upstream error: ${msg}`)
  }
  return rpc?.result ?? envelope.data
}

// The returned object must have stable identity across rerenders. Consumers
// (notably AppRenderer in RevenueIntelligencePage) depend on callback identity
// staying fixed — otherwise their useEffect([callback]) dependencies re-run
// every render and can loop (e.g. re-sending toolResult to the iframe, which
// then DDoSes our edge proxy).
export function useMcpProxy() {
  return useMemo(
    () => ({
      callTool: (params: Record<string, unknown>) => invoke('tools/call', params, 'callTool'),
      readResource: (params: Record<string, unknown>) => invoke('resources/read', params, 'readResource'),
      listTools: () => invoke('tools/list', {}, 'listTools'),
      listResources: () => invoke('resources/list', {}, 'listResources'),
      initialize: () => invoke('initialize', {}, 'initialize'),
    }),
    [],
  )
}
