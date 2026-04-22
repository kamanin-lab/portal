import { supabase } from '@/shared/lib/supabase'
import { toast } from 'sonner'

export function useMcpProxy() {
  const callTool = async (params: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('mcp-proxy', {
      body: { method: 'tools/call', params },
    })
    if (error) {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.')
      console.error('[useMcpProxy] callTool error:', error)
      throw error
    }
    return data
  }

  const readResource = async (params: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('mcp-proxy', {
      body: { method: 'resources/read', params },
    })
    if (error) {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.')
      console.error('[useMcpProxy] readResource error:', error)
      throw error
    }
    return data
  }

  const listTools = async () => {
    const { data, error } = await supabase.functions.invoke('mcp-proxy', {
      body: { method: 'tools/list', params: {} },
    })
    if (error) {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.')
      console.error('[useMcpProxy] listTools error:', error)
      throw error
    }
    return data
  }

  const listResources = async () => {
    const { data, error } = await supabase.functions.invoke('mcp-proxy', {
      body: { method: 'resources/list', params: {} },
    })
    if (error) {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.')
      console.error('[useMcpProxy] listResources error:', error)
      throw error
    }
    return data
  }

  const initialize = async () => {
    const { data, error } = await supabase.functions.invoke('mcp-proxy', {
      body: { method: 'initialize', params: {} },
    })
    if (error) {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.')
      console.error('[useMcpProxy] initialize error:', error)
      throw error
    }
    return data
  }

  return { callTool, readResource, listTools, listResources, initialize }
}
