import { ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { UpgradePrompt } from './upgrade-prompt';

interface ProtectedRouteProps {
  children: ReactNode;
  requireSubscription?: boolean;
}

export function ProtectedRoute({ children, requireSubscription = false }: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requireSubscription) {
    if (!user?.subscriptionStatus || user.subscriptionStatus === 'canceled') {
      return <UpgradePrompt reason="no_subscription" />;
    }

    if (user.subscriptionStatus === 'past_due') {
      return <UpgradePrompt reason="past_due" />;
    }
  }

  return <>{children}</>;
}
