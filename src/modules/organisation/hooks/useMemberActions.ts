import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/shared/lib/supabase'
import type { OrgMember } from './useOrgMembers'

interface Options {
  members: OrgMember[]
  currentUserId: string | undefined
}

export function useMemberActions({ members, currentUserId }: Options) {
  const queryClient = useQueryClient()

  function adminCount(): number {
    return members.filter(m => m.role === 'admin').length
  }

  async function changeRole({ memberId, nextRole }: { memberId: string; nextRole: 'member' | 'viewer' }) {
    const target = members.find(m => m.id === memberId)
    if (!target) throw new Error('Mitglied nicht gefunden')
    if (target.role === 'admin' && adminCount() <= 1) {
      toast.error('Rollenänderung nicht möglich.', { description: 'Es muss mindestens einen Administrator geben.' })
      throw new Error('Cannot demote last admin')
    }
    const { error } = await supabase.from('org_members').update({ role: nextRole }).eq('id', memberId)
    if (error) {
      toast.error('Rollenänderung fehlgeschlagen.', { description: error.message })
      throw error
    }
    toast.success('Rolle geändert.')
    queryClient.invalidateQueries({ queryKey: ['org-members'] })
  }

  async function removeMember({ memberId }: { memberId: string }) {
    const target = members.find(m => m.id === memberId)
    if (!target) throw new Error('Mitglied nicht gefunden')
    const isSelf = target.profile_id === currentUserId
    if (isSelf && target.role === 'admin' && adminCount() <= 1) {
      toast.error('Entfernen nicht möglich.', { description: 'Sie sind der letzte Administrator.' })
      throw new Error('Cannot remove self as last admin')
    }
    const { error } = await supabase.from('org_members').delete().eq('id', memberId)
    if (error) {
      toast.error('Mitglied konnte nicht entfernt werden.', { description: error.message })
      throw error
    }
    toast.success('Mitglied entfernt.')
    queryClient.invalidateQueries({ queryKey: ['org-members'] })
  }

  return { changeRole, removeMember }
}
