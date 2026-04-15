import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import { MultiplicationSignIcon } from '@hugeicons/core-free-icons'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/shared/lib/supabase'
import { useOrg } from '@/shared/hooks/useOrg'
import { Button } from '@/shared/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
}

export function InviteMemberDialog({ open, onClose }: Props) {
  const { organization } = useOrg()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'viewer'>('member')
  const [isPending, setIsPending] = useState(false)

  function handleClose() {
    setEmail('')
    setRole('member')
    setIsPending(false)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !organization?.id) return
    setIsPending(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-member', {
        body: { organizationId: organization.id, email: email.trim(), role },
      })
      if (error) throw new Error(error.message || 'Verbindungsfehler')
      if (!data?.success) throw new Error(data?.error || 'Einladung fehlgeschlagen')
      toast.success('Einladung gesendet.', { description: `${email.trim()} wurde eingeladen.` })
      queryClient.invalidateQueries({ queryKey: ['org-members'] })
      handleClose()
    } catch (err) {
      toast.error('Einladung fehlgeschlagen.', { description: (err as Error).message })
      setIsPending(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[420px] bg-surface rounded-[14px] border border-border p-6 shadow-2xl z-50 focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-md font-semibold text-text-primary">Mitglied einladen</Dialog.Title>
            <Dialog.Close className="p-1.5 rounded hover:bg-surface-hover">
              <HugeiconsIcon icon={MultiplicationSignIcon} size={18} className="text-text-tertiary" />
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-email" className="text-xs font-medium text-text-secondary">E-Mail-Adresse</label>
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-role" className="text-xs font-medium text-text-secondary">Rolle</label>
              <select
                id="invite-role"
                value={role}
                onChange={e => setRole(e.target.value as 'member' | 'viewer')}
                className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent"
              >
                <option value="member">Mitglied</option>
                <option value="viewer">Betrachter</option>
              </select>
            </div>
            <div className="flex justify-end gap-2.5 mt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Abbrechen</Button>
              <Button type="submit" disabled={isPending || !email.trim()}>{isPending ? 'Laden...' : 'Einladen'}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
