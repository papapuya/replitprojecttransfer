import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, Zap } from 'lucide-react';
import { useLocation } from 'wouter';

interface UpgradePromptProps {
  reason: 'limit_reached' | 'no_subscription' | 'past_due';
  message?: string;
}

export function UpgradePrompt({ reason, message }: UpgradePromptProps) {
  const [, setLocation] = useLocation();

  const content = {
    limit_reached: {
      icon: <AlertTriangle className="h-12 w-12 text-yellow-500" />,
      title: 'API-Limit erreicht',
      description: message || 'Sie haben Ihr monatliches Limit für AI-Generierungen erreicht.',
      action: 'Plan upgraden',
      actionUrl: '/pricing',
    },
    no_subscription: {
      icon: <Zap className="h-12 w-12 text-blue-500" />,
      title: 'Abonnement erforderlich',
      description: message || 'Um diese Funktion zu nutzen, benötigen Sie ein aktives Abonnement.',
      action: 'Plan wählen',
      actionUrl: '/pricing',
    },
    past_due: {
      icon: <TrendingUp className="h-12 w-12 text-red-500" />,
      title: 'Zahlung überfällig',
      description: message || 'Ihre Zahlung ist überfällig. Bitte aktualisieren Sie Ihre Zahlungsmethode.',
      action: 'Zahlung aktualisieren',
      actionUrl: '/account',
    },
  };

  const promptContent = content[reason];

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {promptContent.icon}
          </div>
          <CardTitle className="text-2xl">{promptContent.title}</CardTitle>
          <CardDescription>{promptContent.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-gray-600">
          {reason === 'limit_reached' && (
            <p>
              Upgraden Sie auf einen höheren Plan, um mehr AI-Generierungen pro Monat zu erhalten.
            </p>
          )}
          {reason === 'no_subscription' && (
            <p>
              Wählen Sie einen Plan, der zu Ihren Anforderungen passt, und starten Sie sofort.
            </p>
          )}
          {reason === 'past_due' && (
            <p>
              Ihr Zugriff ist eingeschränkt, bis die Zahlung erfolgreich ist.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            onClick={() => setLocation(promptContent.actionUrl)}
          >
            {promptContent.action}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
