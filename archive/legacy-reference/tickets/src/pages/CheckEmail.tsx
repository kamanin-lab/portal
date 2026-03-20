import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { PRODUCTION_URL } from '@/lib/constants';
import kamaninLogo from '@/assets/K-logo.png';

const RESEND_COOLDOWN_SECONDS = 60;

const CheckEmail = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const [cooldown, setCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    setResendStatus('sending');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${PRODUCTION_URL}/dashboard` },
      });
      if (error) {
        setResendStatus('error');
      } else {
        setResendStatus('sent');
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch {
      setResendStatus('error');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src={kamaninLogo} alt="KAMANIN" className="h-14 w-auto mx-auto" />
          <p className="text-muted-foreground">Client Portal</p>
        </div>

        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Konto erstellt</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground">
              Bitte bestätigen Sie Ihre E-Mail-Adresse.
              <br />
              Wir haben einen Bestätigungslink an{' '}
              <strong className="text-foreground">{email || 'Ihre E-Mail-Adresse'}</strong> gesendet.
            </p>
            <p className="text-sm text-muted-foreground">
              Prüfen Sie Ihren <strong>Posteingang</strong> und den <strong>Spam-Ordner</strong>.
            </p>

            {resendStatus === 'sent' && (
              <p className="text-sm text-green-600 dark:text-green-400 flex items-center justify-center gap-1.5">
                <Mail className="h-4 w-4" />
                E-Mail erneut gesendet. Bitte prüfen Sie Ihren Posteingang.
              </p>
            )}
            {resendStatus === 'error' && (
              <p className="text-sm text-destructive">
                Senden fehlgeschlagen. Bitte versuchen Sie es erneut.
              </p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={cooldown > 0 || resendStatus === 'sending' || !email}
            >
              {resendStatus === 'sending'
                ? 'Wird gesendet...'
                : cooldown > 0
                  ? `Erneut senden in ${cooldown}s`
                  : 'Bestätigungs-E-Mail erneut senden'}
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link to="/auth">Zurück zur Anmeldung</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default CheckEmail;
