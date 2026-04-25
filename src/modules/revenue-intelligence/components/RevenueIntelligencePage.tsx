/**
 * Revenue Intelligence -- embeds the kmn MCP App (daily-briefing tool).
 * Follows Architecture Rule 11 (ContentContainer width="narrow") like every
 * other app page. The iframe sits inside the centered column.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppRenderer } from '@mcp-ui/client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ReadResourceResult, ListResourcesResult } from '@modelcontextprotocol/sdk/types.js'
import { toast } from 'sonner'
import { useMcpProxy } from '../hooks/useMcpProxy'
import { useThemePublisher } from '../hooks/useThemePublisher'
import { DashboardLoading } from './DashboardLoading'
import { McpErrorBoundary } from './McpErrorBoundary'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'

const TOOL_NAME = 'daily_briefing'
const TOOL_RESOURCE_URI = 'ui://widgets/daily-briefing.html'

export function RevenueIntelligencePage() {
  const { callTool, readResource, listResources } = useMcpProxy()
  useThemePublisher()
  const [isReady, setIsReady] = useState(false)
  // The kmn daily_briefing widget stays in a "loading" state until it
  // receives a tool result via ui/notifications/tool-result. @mcp-ui/client's
  // AppRenderer forwards the `toolResult` prop to the iframe for us, so we
  // invoke the tool once on mount and feed the result in.
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null)

  const sandboxUrl = useMemo(() => new URL('/sandbox-proxy.html', window.location.origin), [])

  // Keep the latest callTool in a ref so the initial-invoke effect can run exactly
  // once, without re-triggering every time useMcpProxy returns a fresh function
  // identity on rerender (that caused a tool-call loop, see commit history).
  const callToolRef = useRef(callTool)
  callToolRef.current = callTool

  const handleCallTool = useCallback(
    async (params: { name: string; arguments?: Record<string, unknown> }) => {
      const result = await callToolRef.current(params)
      return result as CallToolResult
    },
    [],
  )

  // One-shot initial tool invocation. Ref-guard prevents double-fire in React
  // StrictMode dev and any rerender noise — production sees a single fetch.
  //
  // IMPORTANT: do NOT add a `cancelled` flag tied to cleanup. StrictMode runs
  // the effect twice in dev: mount → cleanup (sets cancelled=true) → remount.
  // The remount sees `initialCallDoneRef.current === true` and bails, so the
  // ONLY tool invocation is the one started on first mount. If we honour the
  // first cleanup's `cancelled` flag, the resulting `setToolResult` call is
  // suppressed → toolResult stays null → AppRenderer never sends
  // ui/notifications/tool-result → widget stays in loading state forever.
  // (See debug session widget-srcdoc-body-empty.md, 2026-04-25.)
  const initialCallDoneRef = useRef(false)
  useEffect(() => {
    if (initialCallDoneRef.current) return
    initialCallDoneRef.current = true
    ;(async () => {
      try {
        const result = (await callToolRef.current({ name: TOOL_NAME, arguments: {} })) as CallToolResult
        setToolResult(result)
      } catch (err) {
        console.error('[RevenueIntelligence] initial tool call failed:', err)
      }
    })()
  }, [])

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

  // The widget calls ui/open-link when the user clicks "Öffnen →" on an order row.
  // Without a handler the SDK resolves silently and nothing happens. Open in a new
  // tab, with noopener to sever the window.opener reference (the sandbox iframe
  // must not be able to reach our host window).
  const handleOpenLink = useCallback(async ({ url }: { url: string }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        console.warn('[RevenueIntelligence] blocked non-http open-link:', url)
        return { isError: true }
      }
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
      return {}
    } catch (err) {
      console.error('[RevenueIntelligence] open-link failed:', err)
      return { isError: true }
    }
  }, [])

  // Stable identity — isReady is checked via functional setState so we don't
  // need to rebind the callback when it flips. Rebinding would invalidate
  // AppRenderer's useEffect deps and cause toolResult re-send loops.
  const handleSizeChanged = useCallback(() => {
    setIsReady((prev) => prev || true)
  }, [])

  return (
    <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
      <div className="relative w-full min-h-[400px]">
        {!isReady && (
          <div className="absolute inset-0 z-10">
            <DashboardLoading />
          </div>
        )}
        <div className={isReady ? 'w-full' : 'w-full opacity-0'}>
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
              onOpenLink={handleOpenLink}
              onError={handleError}
              onSizeChanged={handleSizeChanged}
            />
          </McpErrorBoundary>
        </div>
      </div>
    </ContentContainer>
  )
}
