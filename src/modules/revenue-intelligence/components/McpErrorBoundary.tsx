import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Button } from '@/shared/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class McpErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[McpErrorBoundary] Caught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[calc(100vh-3.5rem)] w-full items-center justify-center">
          <div className="text-center space-y-4 max-w-md px-4">
            <p className="text-muted-foreground text-sm">
              Die Umsatz-Intelligenz ist momentan nicht erreichbar. Bitte lade die Seite neu.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Seite neu laden
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
