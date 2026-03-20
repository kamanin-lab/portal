import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import kamaninLogo from '@/assets/K-logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PRODUCTION_URL, passwordSchema, PASSWORD_RULES } from '@/lib/constants';
import { z } from 'zod';
import { Separator } from '@/components/ui/separator';
import { Mail, AlertCircle, Eye, EyeOff, Check, X } from 'lucide-react';

const emailSchema = z.string().trim().email({ message: 'Ungültige E-Mail-Adresse' }).max(255, { message: 'E-Mail-Adresse zu lang' });

function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 200);
}

const nameSchema = z.string().transform(sanitizeInput).pipe(
  z.string().min(1, { message: 'Name ist erforderlich' }).max(100, { message: 'Name zu lang' })
);
const companySchema = z.string().transform(sanitizeInput).pipe(
  z.string().max(100, { message: 'Firmenname zu lang' })
).optional();

function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="space-y-1 mt-1.5">
      {PASSWORD_RULES.map((rule) => {
        const passed = password.length > 0 && rule.test(password);
        return (
          <li key={rule.label} className="flex items-center gap-1.5 text-xs">
            {password.length === 0 ? (
              <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 inline-block" />
            ) : passed ? (
              <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            ) : (
              <X className="h-3.5 w-3.5 text-destructive" />
            )}
            <span className={password.length > 0 ? (passed ? 'text-green-600 dark:text-green-400' : 'text-destructive') : 'text-muted-foreground'}>
              {rule.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PasswordInput({
  id, value, onChange, placeholder = '••••••••', label, error, showForgot = false,
}: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string;
  label: string; error?: string; showForgot?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {showForgot && (
          <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
            Passwort vergessen?
          </Link>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="pr-10"
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; fullName?: string; companyName?: string }>({});

  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signUp } = useAuth();

  const clearError = (field: string) => setErrors((prev) => ({ ...prev, [field]: undefined }));

  const validateInputs = (): boolean => {
    const newErrors: typeof errors = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.errors[0]?.message;

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0]?.message;

    if (!isLogin) {
      const nameResult = nameSchema.safeParse(fullName);
      if (!nameResult.success) newErrors.fullName = nameResult.error.errors[0]?.message;

      if (companyName) {
        const companyResult = companySchema.safeParse(companyName);
        if (!companyResult.success) newErrors.companyName = companyResult.error.errors[0]?.message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleMagicLink = async () => {
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      setErrors({ email: emailResult.error.errors[0]?.message });
      return;
    }
    setIsMagicLinkLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${PRODUCTION_URL}/dashboard` },
      });
      if (error) {
        toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
      } else {
        setMagicLinkSent(true);
        toast({ title: 'E-Mail prüfen', description: 'Wir haben Ihnen einen Magic Link zum Anmelden gesendet.' });
      }
    } catch {
      toast({ title: 'Fehler', description: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.', variant: 'destructive' });
    }
    setIsMagicLinkLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;
    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          const message = error.message.includes('Invalid login credentials')
            ? 'Ungültige E-Mail-Adresse oder Passwort. Bitte versuchen Sie es erneut.'
            : error.message;
          toast({ title: 'Anmeldung fehlgeschlagen', description: message, variant: 'destructive' });
        } else {
          toast({ title: 'Willkommen zurück!', description: 'Sie haben sich erfolgreich angemeldet.' });
          navigate('/dashboard');
        }
      } else {
        const sanitizedFullName = sanitizeInput(fullName);
        const sanitizedCompanyName = sanitizeInput(companyName);
        if (!sanitizedFullName) {
          toast({ title: 'Name erforderlich', description: 'Bitte geben Sie Ihren vollständigen Namen ein.', variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        const { error } = await signUp(email, password, sanitizedFullName, sanitizedCompanyName);
        if (error) {
          if (error.message.includes('User already registered')) {
            setErrors({ email: 'Ein Konto mit dieser E-Mail-Adresse existiert bereits.' });
          } else {
            toast({ title: 'Registrierung fehlgeschlagen', description: error.message, variant: 'destructive' });
          }
        } else {
          navigate(`/auth/check-email?email=${encodeURIComponent(email)}`);
        }
      }
    } catch {
      toast({ title: 'Fehler', description: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  if (magicLinkSent) {
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
                Wir haben einen Magic Link an <strong>{email}</strong> gesendet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Klicken Sie auf den Link in der E-Mail, um sich anzumelden. Der Link ist 1 Stunde gültig.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button variant="outline" className="w-full" onClick={() => { setMagicLinkSent(false); setEmail(''); }}>
                Andere E-Mail-Adresse verwenden
              </Button>
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
            <CardTitle className="text-2xl">{isLogin ? 'Anmelden' : 'Konto erstellen'}</CardTitle>
            <CardDescription>
              {isLogin
                ? 'Geben Sie Ihre E-Mail-Adresse und Ihr Passwort ein, um auf Ihre Projekte zuzugreifen'
                : 'Geben Sie Ihre Daten ein, um Ihr Konto zu erstellen'}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Vollständiger Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Max Mustermann"
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); clearError('fullName'); }}
                      required={!isLogin}
                      maxLength={100}
                    />
                    {errors.fullName && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.fullName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Firmenname (optional)</Label>
                    <Input
                      id="companyName"
                      type="text"
                      placeholder="Musterfirma GmbH"
                      value={companyName}
                      maxLength={100}
                      onChange={(e) => { setCompanyName(e.target.value); clearError('companyName'); }}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@firma.de"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
                  required
                />
                {errors.email && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email}
                    {errors.email.includes('existiert bereits') && (
                      <button
                        type="button"
                        className="underline text-primary ml-1"
                        onClick={() => { setIsLogin(true); setErrors({}); }}
                      >
                        Stattdessen anmelden
                      </button>
                    )}
                  </p>
                )}
              </div>

              <PasswordInput
                id="password"
                label="Passwort"
                value={password}
                onChange={(v) => { setPassword(v); clearError('password'); }}
                error={errors.password}
                showForgot={isLogin}
              />

              {!isLogin && <PasswordRequirements password={password} />}
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading
                  ? (isLogin ? 'Wird angemeldet...' : 'Konto wird erstellt...')
                  : (isLogin ? 'Anmelden' : 'Konto erstellen')}
              </Button>

              {isLogin && (
                <>
                  <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                      <Separator className="w-full" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Oder</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleMagicLink}
                    disabled={isMagicLinkLoading || !email}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {isMagicLinkLoading ? 'Wird gesendet...' : 'Mit Magic Link anmelden'}
                  </Button>
                </>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setIsLogin(!isLogin); setErrors({}); }}
              >
                {isLogin ? 'Noch kein Konto? Jetzt registrieren' : 'Bereits ein Konto? Anmelden'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
