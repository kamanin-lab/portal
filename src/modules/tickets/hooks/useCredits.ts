import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface CreditPackage {
  id: string;
  package_name: string;
  credits_per_month: number;
  is_active: boolean;
}

interface UseCreditsResult {
  balance: number;
  packageName: string | null;
  creditsPerMonth: number | null;
  isLoading: boolean;
}

export function useCredits(): UseCreditsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch active package
  const { data: pkg, isLoading: pkgLoading } = useQuery({
    queryKey: ['credit-package', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_packages')
        .select('id, package_name, credits_per_month, is_active')
        .eq('profile_id', user!.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as CreditPackage | null;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  // Fetch balance (sum of all transactions)
  const { data: balance = 0, isLoading: balanceLoading } = useQuery({
    queryKey: ['credit-balance', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_credit_balance', { p_profile_id: user!.id });
      if (error) {
        console.warn('[Credits] get_credit_balance RPC error:', error.message);
        return 0;
      }
      return Number(data) || 0;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Realtime subscription on credit_transactions INSERT — debounced 300ms
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`credit-transactions-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'credit_transactions',
        filter: `profile_id=eq.${user.id}`,
      }, () => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['credit-balance', user.id] });
        }, 300);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [user?.id, queryClient]);

  return {
    balance,
    packageName: pkg?.package_name ?? null,
    creditsPerMonth: pkg?.credits_per_month ?? null,
    isLoading: pkgLoading || balanceLoading,
  };
}
