import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from './useAuth'
import type { NotificationPreferences } from '@/shared/types/common'

interface UpdateProfileData {
  full_name?: string
  company_name?: string
  avatar_url?: string | null
  notification_preferences?: NotificationPreferences
}

export function useUpdateProfile() {
  const { user, refreshProfile } = useAuth()

  return useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      if (!user) throw new Error('Nicht angemeldet')

      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user.id)

      if (error) throw error
    },
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Änderungen gespeichert')
    },
    onError: () => {
      toast.error('Fehler beim Speichern. Bitte erneut versuchen.')
    },
  })
}

export function useUpdatePassword() {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (newPassword: string) => {
      if (!user) throw new Error('Nicht angemeldet')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Passwort erfolgreich geändert')
    },
    onError: () => {
      toast.error('Passwort konnte nicht geändert werden. Bitte erneut versuchen.')
    },
  })
}

export function useUpdateEmail() {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (newEmail: string) => {
      if (!user) throw new Error('Nicht angemeldet')
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Bestätigungsemail gesendet')
    },
    onError: () => {
      toast.error('E-Mail konnte nicht geändert werden. Bitte erneut versuchen.')
    },
  })
}
