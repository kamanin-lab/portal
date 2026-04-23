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

export function useMcpProxy() {
  const callTool = async (params: Record<string, unknown>) =>
    invoke('tools/call', params, 'callTool')

  const readResource = async (params: Record<string, unknown>) =>
    invoke('resources/read', params, 'readResource')

  const listTools = async () =>
    invoke('tools/list', {}, 'listTools')

  const listResources = async () =>
    invoke('resources/list', {}, 'listResources')

  const initialize = async () =>
    invoke('initialize', {}, 'initialize')

  return { callTool, readResource, listTools, listResources, initialize }
}
