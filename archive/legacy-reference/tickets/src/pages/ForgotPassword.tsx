import { useState } from 'react';
import { PRODUCTION_URL } from '@/lib/constants';
import { Link } from 'react-router-dom';
import kamaninLogo from '@/assets/K-logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { ArrowLeft, Mail } from 'lucide-react';

const emailSchema = z.string().trim().email({ message: 'Ungültige E-Mail-Adresse' });

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      setError(emailResult.error.errors[0]?.message);
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${PRODUCTION_URL}/update-password`,
      });

      if (error) {
        toast({
          title: 'Fehler',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        setIsEmailSent(true);
        toast({
          title: 'E-Mail prüfen',
          description: 'Wir haben Ihnen einen Link zum Zurücksetzen des Passworts gesendet.',
        });
      }
    } catch (err) {
      toast({
        title: 'Fehler',
        description: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  if (isEmailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <img src={kamaninLogo} alt="KAMANIN" className="h-14 w-auto mx-auto" />
            <p className="text-muted-foreground">Client Portal</p>
          </div>

          <Card>
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">E-Mail prüfen</CardTitle>
              <CardDescription>
                Wir haben einen Link zum Zurücksetzen an <strong>{email}</strong> gesendet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Klicken Sie auf den Link in der E-Mail, um Ihr Passwort zurückzusetzen. Der Link ist 1 Stunde gültig.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setIsEmailSent(false);
                  setEmail('');
                }}
              >
                Andere E-Mail-Adresse verwenden
              </Button>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="inline-block h-4 w-4 mr-1" />
                Zurück zur Anmeldung
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src={kamaninLogo} alt="KAMANIN" className="h-14 w-auto mx-auto" />
          <p className="text-muted-foreground">Client Portal</p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Passwort zurücksetzen</CardTitle>
            <CardDescription>
              Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@firma.de"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(undefined);
                  }}
                  required
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Wird gesendet...' : 'Link senden'}
              </Button>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="inline-block h-4 w-4 mr-1" />
                Zurück zur Anmeldung
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
