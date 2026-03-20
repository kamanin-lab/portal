import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { PRODUCTION_URL } from '@/lib/constants';

const log = createLogger('AuthContext');

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  clickup_list_ids: string[] | null;
  email_notifications: boolean;
  avatar_url: string | null;
  support_task_id: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signUp: (email: string, password: string, fullName: string, companyName: string) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signInWithMagicLink: (email: string) => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      log.error('Failed to fetch profile', { error: error.message });
      return null;
    }
    return data;
  }, []);

  useEffect(() => {
    let isMounted = true;
    let initialSessionHandled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        if (event === 'INITIAL_SESSION') return;

        log.debug('Auth state changed', { event });
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            if (isMounted) {
              fetchProfile(session.user.id)
                .then((p) => { if (isMounted) setProfile(p); })
                .catch((err) => { log.error('Failed to fetch profile on auth change', { error: err.message }); });
            }
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isMounted || initialSessionHandled) return;
        initialSessionHandled = true;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          log.debug('Session restored');
          fetchProfile(session.user.id)
            .then((p) => { if (isMounted) { setProfile(p); setIsLoading(false); } })
            .catch((err) => { log.error('Failed to fetch profile on init', { error: err.message }); if (isMounted) setIsLoading(false); });
        } else {
          setIsLoading(false);
        }
      })
      .catch((err) => {
        log.error('Failed to get session', { error: err.message });
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, fullName: string, companyName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName, company_name: companyName },
      },
    });
    if (error) log.error('Sign up failed', { error: error.message });
    else log.info('Sign up successful');
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) log.error('Sign in failed', { error: error.message });
    else log.info('Sign in successful');
    return { data, error };
  };

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${PRODUCTION_URL}/dashboard` },
    });
    if (error) log.error('Magic link sign in failed', { error: error.message });
    else log.info('Magic link sent');
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${PRODUCTION_URL}/update-password`,
    });
    if (error) log.error('Password reset failed', { error: error.message });
    else log.info('Password reset email sent');
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) log.error('Password update failed', { error: error.message });
    else log.info('Password updated successfully');
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      log.info('Sign out successful');
      setUser(null);
      setSession(null);
      setProfile(null);
    } else {
      log.error('Sign out failed', { error: error.message });
    }
    return { error };
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, isLoading,
      isAuthenticated: !!session,
      signUp, signIn, signInWithMagicLink, resetPassword, updatePassword, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
