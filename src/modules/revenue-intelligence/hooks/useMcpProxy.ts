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

async function invoke(method: string, params: Record<string, unknown>, label: string) {
  const { data, error } = await supabase.functions.invoke('mcp-proxy', {
    body: { method, params },
  })

  // Network-level error (Supabase invoke itself failed)
  if (error) {
    toast.error('Verbindungsfehler. Bitte erneut versuchen.')
    console.error(`[useMcpProxy] ${label} network error:`, error)
    throw error
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
