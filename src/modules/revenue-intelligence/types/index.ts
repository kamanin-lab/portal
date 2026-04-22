// Revenue Intelligence module types
// POC scope: minimal types. Expand as the module matures.

export interface McpProxyRequest {
  method: string
  params?: Record<string, unknown>
  id?: string
  jsonrpc?: string
}
