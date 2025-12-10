import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { Crown } from 'lucide-react';

export function SubscriptionBadge() {
  const { user } = useAuth();

  if (!user || !user.planId) {
    return null;
  }

  const planColors = {
    starter: 'bg-gray-500',
    pro: 'bg-blue-500',
    enterprise: 'bg-purple-500',
  } as const;

  const planNames = {
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise',
  } as const;

  const planId = user.planId as keyof typeof planColors;
  const color = planColors[planId] || 'bg-gray-500';
  const name = planNames[planId] || user.planId;

  return (
    <Badge className={`${color} text-white flex items-center gap-1`}>
      <Crown className="h-3 w-3" />
      {name}
    </Badge>
  );
}
