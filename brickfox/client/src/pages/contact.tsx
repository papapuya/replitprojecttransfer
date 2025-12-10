import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Mail, Send, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Contact() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Fehler beim Senden der Nachricht');
      }

      setIsSuccess(true);
      toast({
        title: 'Nachricht gesendet!',
        description: 'Wir melden uns schnellstmöglich bei Ihnen.',
      });

      setFormData({
        name: '',
        company: '',
        email: '',
        phone: '',
        message: '',
      });
    } catch (error: any) {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-16 px-4 flex items-center justify-center">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-12 pb-8">
            <div className="mb-6 flex justify-center">
              <div className="bg-green-100 rounded-full p-4">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Vielen Dank!</h2>
            <p className="text-gray-600 mb-6">
              Ihre Nachricht wurde erfolgreich versendet. Wir melden uns schnellstmöglich bei Ihnen.
            </p>
            <Button onClick={() => setLocation('/')} className="w-full">
              Zurück zur Startseite
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
        </div>

        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-indigo-100 rounded-full p-3">
              <Mail className="h-8 w-8 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Kontaktieren Sie uns
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Haben Sie Fragen zu PIMPilot? Wir helfen Ihnen gerne weiter!
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Contact Form */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Nachricht senden</CardTitle>
              <CardDescription>
                Füllen Sie das Formular aus und wir melden uns bei Ihnen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ihr Name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Firma</Label>
                  <Input
                    id="company"
                    name="company"
                    placeholder="Ihre Firma (optional)"
                    value={formData.company}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="ihre@email.de"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+49 123 456789 (optional)"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Nachricht *</Label>
                  <Textarea
                    id="message"
                    name="message"
                    placeholder="Ihre Nachricht..."
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    className="resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700"
                >
                  {isSubmitting ? (
                    <>Wird gesendet...</>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Nachricht senden
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <div className="space-y-6">
            <Card className="shadow-lg bg-gradient-to-br from-blue-50 to-purple-50">
              <CardHeader>
                <CardTitle>Warum PIMPilot?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white rounded-full p-1 flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Schnelle Implementierung</p>
                    <p className="text-sm text-gray-600">In wenigen Tagen startklar</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-purple-600 text-white rounded-full p-1 flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">KI-Automatisierung</p>
                    <p className="text-sm text-gray-600">Spart Zeit und Kosten</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-pink-600 text-white rounded-full p-1 flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Persönlicher Support</p>
                    <p className="text-sm text-gray-600">Direkter Ansprechpartner</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
