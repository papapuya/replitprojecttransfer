import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/lib/auth-context';
import { TrendingUp, AlertTriangle } from 'lucide-react';

export function UsageMeter() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const usagePercent = (user.apiCallsUsed / user.apiCallsLimit) * 100;
  const isWarning = usagePercent >= 80;
  const isCritical = usagePercent >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isWarning ? (
            <AlertTriangle className={`h-4 w-4 ${isCritical ? 'text-red-500' : 'text-yellow-500'}`} />
          ) : (
            <TrendingUp className="h-4 w-4 text-gray-600" />
          )}
          <span className="font-medium">API-Nutzung</span>
        </div>
        <span className="text-gray-600">
          {user.apiCallsUsed} / {user.apiCallsLimit}
        </span>
      </div>
      <Progress
        value={usagePercent}
        className={`h-2 ${isCritical ? 'bg-red-100' : isWarning ? 'bg-yellow-100' : ''}`}
      />
      {isCritical && (
        <p className="text-xs text-red-600">
          Limit erreicht. Upgraden Sie Ihren Plan für mehr AI-Generierungen.
        </p>
      )}
    </div>
  );
}
