import { type ReactNode, useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  // PKCE flow: if ?code= is present in URL, SDK is exchanging it for a session.
  // Block redirect to /login until exchange completes (SIGNED_IN) or fails.
  const [exchanging, setExchanging] = useState(
    () => new URLSearchParams(location.search).has('code')
  )

  useEffect(() => {
    if (!exchanging) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setExchanging(false)
      }
    })
    // Safety timeout: stop waiting after 5s regardless
    const timeout = setTimeout(() => setExchanging(false), 5000)
    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [exchanging])

  if (isLoading || exchanging) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
