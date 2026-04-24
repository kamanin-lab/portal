// Host-side theme publisher for the kmn/theme/* postMessage bridge.
// Responds to widget-initiated kmn/theme/request with kmn/theme/set carrying the 12 tokens.
// Installs MutationObserver on <html> for future dark-mode re-emits (MCPAPP-TOKEN-06).
//
// Portal currently has no dark mode — the MutationObserver sits idle until a future
// <html data-theme>, class, or style attribute toggle fires. When added, the observer
// rebroadcasts kmn/theme/set to all iframes. The listener survives across widget
// mount/unmount cycles (PORT-03).
//
// useMemo-stabilized return per ADR-034 + feedback_react_hook_identity_churn.

import { useEffect, useMemo } from 'react'
import { readCurrentTokens } from '@/shared/styles/widget-tokens'

const PROTOCOL_VERSION = 1 as const

export function useThemePublisher() {
  useEffect(() => {
    // Respond to widget-initiated requests.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'kmn/theme/request') return
      if (typeof e.data.protocolVersion !== 'number') return

      // Protocol version asymmetry (MCPAPP-TOKEN-08): host higher-version ignores + logs.
      if (e.data.protocolVersion > PROTOCOL_VERSION) {
        console.warn(
          `[kmn-theme] widget protocolVersion=${e.data.protocolVersion} > portal=${PROTOCOL_VERSION} — ignoring`,
        )
        return
      }

      // Reply to the message source (sandbox-proxy's window, which relays to the widget iframe).
      // targetOrigin '*' because sandbox-proxy's inner srcdoc has origin=null per Pitfall 4.
      ;(e.source as Window | null)?.postMessage(
        { type: 'kmn/theme/set', protocolVersion: PROTOCOL_VERSION, tokens: readCurrentTokens() },
        '*',
      )
    }
    window.addEventListener('message', onMessage)

    // MutationObserver on <html> attributes — re-emit on theme change.
    // Portal has no dark mode yet; this is infrastructure for a future toggle.
    const observer = new MutationObserver(() => {
      document.querySelectorAll('iframe').forEach((iframe) => {
        iframe.contentWindow?.postMessage(
          { type: 'kmn/theme/set', protocolVersion: PROTOCOL_VERSION, tokens: readCurrentTokens() },
          '*',
        )
      })
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    })

    return () => {
      window.removeEventListener('message', onMessage)
      observer.disconnect()
    }
  }, [])

  // Side-effect-only hook; return useMemo-stabilized satisfies the hook-return rule.
  return useMemo(() => ({ protocolVersion: PROTOCOL_VERSION }), [])
}
