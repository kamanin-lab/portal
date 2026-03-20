import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { passwordSchema } from '@/lib/constants';

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setCompanyName(profile.company_name || '');
      setEmailNotifications(profile.email_notifications ?? true);
    }
  }, [profile]);

  const handleEmailNotificationChange = async (checked: boolean) => {
    if (!user) {
      toast({
        title: 'Fehler',
        description: 'Bitte melden Sie sich an, um Einstellungen zu ändern.',
        variant: 'destructive',
      });
      return;
    }

    if (isSavingNotifications) return;

    const previousValue = emailNotifications;
    setEmailNotifications(checked);
    setIsSavingNotifications(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ email_notifications: checked })
        .eq('id', user.id)
        .select('email_notifications')
        .single();

      if (error) throw error;

      toast({
        title: checked ? 'Benachrichtigungen aktiviert' : 'Benachrichtigungen deaktiviert',
        description: 'Gespeichert.',
      });
    } catch (err) {
      setEmailNotifications(previousValue);
      
      toast({
        title: 'Fehler beim Speichern',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          company_name: companyName,
          email_notifications: emailNotifications,
        }, { 
          onConflict: 'id' 
        });

      if (error) throw error;

      toast({
        title: 'Einstellungen gespeichert',
        description: 'Ihr Profil wurde erfolgreich aktualisiert.',
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: 'Fehler beim Speichern',
        description: error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwörter stimmen nicht überein',
        description: 'Bitte stellen Sie sicher, dass beide Passwörter übereinstimmen.',
        variant: 'destructive',
      });
      return;
    }

    const passwordResult = passwordSchema.safeParse(newPassword);
    if (!passwordResult.success) {
      toast({
        title: 'Ungültiges Passwort',
        description: passwordResult.error.errors[0]?.message,
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Passwort geändert',
        description: 'Ihr Passwort wurde erfolgreich aktualisiert.',
      });
      
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      toast({
        title: 'Fehler beim Ändern des Passworts',
        description: error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="container py-8 space-y-6 flex-1">
        <Button 
          variant="ghost-outline" 
          onClick={() => navigate('/dashboard')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zum Dashboard
        </Button>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre Kontoeinstellungen und Präferenzen
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Profil</CardTitle>
              <CardDescription>
                Aktualisieren Sie Ihre persönlichen Informationen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input 
                  id="email" 
                  value={user?.email || ''} 
                  disabled 
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Die E-Mail-Adresse kann nicht geändert werden
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="fullName">Vollständiger Name</Label>
                <Input 
                  id="fullName" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Geben Sie Ihren Namen ein"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="companyName">Firmenname</Label>
                <Input 
                  id="companyName" 
                  value={companyName} 
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Geben Sie Ihren Firmennamen ein"
                />
              </div>

              <Button 
                onClick={handleSaveProfile} 
                disabled={isSaving}
                className="w-full sm:w-auto"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Änderungen speichern
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Benachrichtigungen</CardTitle>
                <CardDescription>
                  Legen Sie fest, wie Sie über Neuigkeiten informiert werden
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="emailNotifications" className="flex items-center gap-2">
                      E-Mail-Benachrichtigungen
                      {isSavingNotifications && <Loader2 className="h-3 w-3 animate-spin" />}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      E-Mail erhalten, wenn eine Aufgabe Ihre Aufmerksamkeit erfordert
                    </p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={emailNotifications}
                    onCheckedChange={handleEmailNotificationChange}
                    disabled={isSavingNotifications}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Passwort ändern</CardTitle>
                <CardDescription>
                  Aktualisieren Sie Ihr Kontopasswort
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Neues Passwort</Label>
                  <Input 
                    id="newPassword" 
                    type="password"
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Neues Passwort eingeben"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
                  <Input 
                    id="confirmPassword" 
                    type="password"
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Neues Passwort bestätigen"
                  />
                </div>

                <Button 
                  onClick={handleChangePassword} 
                  disabled={isChangingPassword || !newPassword || !confirmPassword}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {isChangingPassword ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Passwort ändern
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Settings;
