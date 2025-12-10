import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'Benutzername oder E-Mail erforderlich'),
  password: z.string().min(1, 'Passwort erforderlich'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Load "Remember Me" preference from storage (default: true)
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('rememberMe');
    return saved === null ? true : saved === 'true';
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: true,
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      // Save "Remember Me" preference BEFORE login to ensure DynamicStorage uses it
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.setItem('rememberMe', 'false');
      }
      
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Login fehlgeschlagen');
      }
      
      return res.json();
    },
    onSuccess: async (data) => {
      const storage = rememberMe ? localStorage : sessionStorage;
      const otherStorage = rememberMe ? sessionStorage : localStorage;
      
      // Store token (works for both Supabase and local auth)
      if (data.access_token) {
        storage.setItem('supabase_token', data.access_token);
        otherStorage.removeItem('supabase_token');
      }
      
      // Only try to set Supabase session if it has refresh_token (Supabase auth)
      if (data.session?.access_token && data.session?.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (error) {
          console.error('Failed to set Supabase session:', error);
        } else {
          console.log('✅ Supabase session set successfully');
        }
      }
      
      toast({
        title: 'Erfolgreich angemeldet',
        description: 'Sie werden weitergeleitet...',
      });
      
      // Redirect
      setTimeout(() => {
        if (data.user?.is_admin) {
          window.location.href = '/admin/dashboard';
        } else {
          window.location.href = '/dashboard';
        }
      }, 300);
    },
    onError: (error: Error) => {
      setIsLoading(false);
      toast({
        title: 'Login fehlgeschlagen',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: LoginForm) => {
    setIsLoading(true);
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between mb-2">
            <a 
              href="/" 
              className="text-sm text-gray-600 hover:text-indigo-600 flex items-center gap-1 transition-colors"
            >
              ← Zurück zur Startseite
            </a>
          </div>
          <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">PIMPilot</CardTitle>
          <CardDescription className="text-center">
            Melden Sie sich mit Ihrem Account an
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail oder Benutzername</Label>
              <Input
                id="email"
                type="text"
                placeholder=""
                {...register('email')}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  {...register('password')}
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                disabled={isLoading}
              />
              <Label
                htmlFor="rememberMe"
                className="text-sm font-normal cursor-pointer"
              >
                Angemeldet bleiben
              </Label>
            </div>
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Wird angemeldet...' : 'Anmelden'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-gray-600 text-center">
            Noch kein Account?{' '}
            <a href="/register" className="text-indigo-600 hover:underline font-medium">
              Jetzt registrieren
            </a>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
