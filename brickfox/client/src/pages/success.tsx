import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function Success() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setTimeout(() => {
      setLocation('/');
    }, 5000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Zahlung erfolgreich!</CardTitle>
          <CardDescription>
            Ihr Abonnement wurde erfolgreich aktiviert
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-gray-600">
            <p>Vielen Dank für Ihr Vertrauen!</p>
            <p className="mt-2">
              Sie können jetzt alle Funktionen von PIMPilot nutzen.
            </p>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => setLocation('/')}
            >
              Zur Startseite
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setLocation('/account')}
            >
              Abo-Einstellungen
            </Button>
          </div>

          <p className="text-sm text-gray-500 text-center">
            Sie werden automatisch weitergeleitet...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
