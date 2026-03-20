import { ReactNode, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const auth = useAuth();
  
  const isAuthenticated = auth.isAuthenticated;
  const isLoading = auth.isLoading;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Wird geladen...</div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null;
    }

    return <>{children}</>;
  }, [isLoading, isAuthenticated, children]);

  return content;
};

export default ProtectedRoute;
