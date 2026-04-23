/**
 * Revenue Intelligence -- embeds the Kamanda MCP App (daily-briefing tool).
 *
 * NOTE: This page is a documented exception to Architecture Rule 11
 * (ContentContainer width="narrow" on all app pages). An embedded dashboard
 * iframe cannot be meaningfully constrained to max-w-4xl. Do not wrap this
 * page in ContentContainer.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppRenderer } from '@mcp-ui/client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ReadResourceResult, ListResourcesResult } from '@modelcontextprotocol/sdk/types.js'
import { toast } from 'sonner'
import { useMcpProxy } from '../hooks/useMcpProxy'
import { DashboardLoading } from './DashboardLoading'
import { McpErrorBoundary } from './McpErrorBoundary'

const TOOL_NAME = 'daily_briefing'
const TOOL_RESOURCE_URI = 'ui://widgets/daily-briefing.html'

export function RevenueIntelligencePage() {
  const { callTool, readResource, listResources } = useMcpProxy()
  const [isReady, setIsReady] = useState(false)
  // The kamanda daily_briefing widget stays in a "loading" state until it
  // receives a tool result via ui/notifications/tool-result. @mcp-ui/client's
  // AppRenderer forwards the `toolResult` prop to the iframe for us, so we
  // invoke the tool once on mount and feed the result in.
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null)

  const sandboxUrl = useMemo(() => new URL('/sandbox-proxy.html', window.location.origin), [])

  const handleCallTool = useCallback(
    async (params: { name: string; arguments?: Record<string, unknown> }) => {
      const result = await callTool(params)
      // Upstream MCP server returns a valid CallToolResult JSON-RPC response
      return result as CallToolResult
    },
    [callTool],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = (await callTool({ name: TOOL_NAME, arguments: {} })) as CallToolResult
        if (!cancelled) setToolResult(result)
      } catch (err) {
        if (!cancelled) {
          console.error('[RevenueIntelligence] initial tool call failed:', err)
          // useMcpProxy already toasts user-facing error
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [callTool])

  const handleReadResource = useCallback(
    async (params: { uri: string }) => {
      const result = await readResource(params)
      // Upstream returns valid ReadResourceResult
      return result as ReadResourceResult
    },
    [readResource],
  )

  const handleListResources = useCallback(
    async () => {
      const result = await listResources()
      // Upstream returns valid ListResourcesResult
      return result as ListResourcesResult
    },
    [listResources],
  )

  const handleError = useCallback((error: Error) => {
    console.error('[RevenueIntelligence] AppRenderer error:', error)
    toast.error('Fehler beim Laden der Umsatz-Intelligenz.')
  }, [])

  const handleMessage = useCallback(async () => {
    return {}
  }, [])

  const handleSizeChanged = useCallback(() => {
    if (!isReady) setIsReady(true)
  }, [isReady])

  return (
    <div className="h-[calc(100vh-3.5rem)] w-full relative">
      {!isReady && (
        <div className="absolute inset-0 z-10">
          <DashboardLoading />
        </div>
      )}
      <div className={isReady ? 'h-full w-full' : 'h-full w-full opacity-0'}>
        <McpErrorBoundary>
          <AppRenderer
            toolName={TOOL_NAME}
            toolResourceUri={TOOL_RESOURCE_URI}
            toolResult={toolResult ?? undefined}
            sandbox={{ url: sandboxUrl }}
            onCallTool={handleCallTool}
            onReadResource={handleReadResource}
            onListResources={handleListResources}
            onMessage={handleMessage}
            onError={handleError}
            onSizeChanged={handleSizeChanged}
          />
        </McpErrorBoundary>
      </div>
    </div>
  )
}
