import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ExternalLink, CreditCard, User, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export default function Account() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: userData, refetch: refetchUser } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (!res.ok) {
        setLocation('/login');
        return null;
      }
      return res.json();
    },
  });

  const { data: subscriptionData } = useQuery({
    queryKey: ['/api/subscription/status'],
    queryFn: async () => {
      const res = await fetch('/api/subscription/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load subscription');
      return res.json();
    },
    enabled: !!userData?.user,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Portal-Session fehlgeschlagen');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Logout fehlgeschlagen');
      return res.json();
    },
    onSuccess: () => {
      setLocation('/login');
    },
  });

  if (!userData?.user) {
    return null;
  }

  const user = userData.user;
  const subscription = subscriptionData?.user;
  const plan = subscriptionData?.plan;
  const usagePercent = subscription 
    ? (subscription.apiCallsUsed / subscription.apiCallsLimit) * 100
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Mein Account</h1>
          <Button variant="outline" onClick={() => logoutMutation.mutate()}>
            Abmelden
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <User className="h-6 w-6" />
                <div>
                  <CardTitle>Profil</CardTitle>
                  <CardDescription>{user.email}</CardDescription>
                </div>
              </div>
              {user.username && (
                <Badge variant="secondary">{user.username}</Badge>
              )}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CreditCard className="h-6 w-6" />
                <div>
                  <CardTitle>Abonnement</CardTitle>
                  <CardDescription>
                    {plan ? `${plan.name} Plan` : 'Kein aktives Abo'}
                  </CardDescription>
                </div>
              </div>
              {subscription?.planId && (
                <Badge
                  variant={
                    subscription.subscriptionStatus === 'active'
                      ? 'default'
                      : subscription.subscriptionStatus === 'past_due'
                      ? 'destructive'
                      : 'secondary'
                  }
                >
                  {subscription.subscriptionStatus === 'active'
                    ? 'Aktiv'
                    : subscription.subscriptionStatus === 'past_due'
                    ? 'Zahlungsrückstand'
                    : subscription.subscriptionStatus || 'Inaktiv'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Preis</p>
                    <p className="text-xl font-bold">€{plan.price}/Monat</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">AI-Calls Limit</p>
                    <p className="text-xl font-bold">{plan.apiCallsLimit}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Features:</span>
                  </div>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {plan.features.map((feature: string, idx: number) => (
                      <li key={idx}>• {feature}</li>
                    ))}
                  </ul>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Button
                    className="w-full"
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {portalMutation.isPending
                      ? 'Wird geladen...'
                      : 'Abo verwalten (Rechnungen, Kündigung)'}
                  </Button>
                </div>
              </>
            )}

            {!plan && (
              <div className="text-center py-4">
                <p className="text-gray-600 mb-4">
                  Sie haben noch kein aktives Abonnement
                </p>
                <Button onClick={() => setLocation('/pricing')}>
                  Plan wählen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {subscription && (
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-3">
                <TrendingUp className="h-6 w-6" />
                <div>
                  <CardTitle>Nutzung</CardTitle>
                  <CardDescription>
                    Ihre AI-Generierungen diesen Monat
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {subscription.apiCallsUsed} / {subscription.apiCallsLimit} verwendet
                  </span>
                  <span className="text-gray-600">
                    {Math.round(usagePercent)}%
                  </span>
                </div>
                <Progress value={usagePercent} className="h-2" />
              </div>

              {usagePercent >= 80 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Achtung:</strong> Sie haben {Math.round(usagePercent)}% Ihres
                    monatlichen Limits erreicht.
                    {usagePercent >= 100 ? (
                      <> Upgraden Sie Ihren Plan für mehr AI-Generierungen.</>
                    ) : (
                      <> Bald ist Ihr Limit erreicht.</>
                    )}
                  </p>
                  {usagePercent >= 90 && (
                    <Button
                      className="mt-2 w-full"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation('/pricing')}
                    >
                      Plan upgraden
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
