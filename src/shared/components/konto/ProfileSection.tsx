import { useState } from 'react'
import { User } from 'lucide-react'
import type { Profile } from '@/shared/types/common'
import { useUpdateProfile } from '@/shared/hooks/useUpdateProfile'
import { useAuth } from '@/shared/hooks/useAuth'
import { AvatarUpload } from './AvatarUpload'

interface Props {
  profile: Profile
}

interface EditableFieldProps {
  id: string
  label: string
  value: string | null
  fieldKey: 'full_name' | 'company_name'
}

function EditableField({ id, label, value, fieldKey }: EditableFieldProps) {
  const [localValue, setLocalValue] = useState(value ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const updateProfile = useUpdateProfile()

  const hasChanges = localValue.trim() !== (value ?? '')

  const handleSave = () => {
    if (!hasChanges) return
    updateProfile.mutate({ [fieldKey]: localValue.trim() }, {
      onSuccess: () => setIsEditing(false),
    })
  }

  const handleCancel = () => {
    setLocalValue(value ?? '')
    setIsEditing(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      {isEditing ? (
        <div className="flex gap-2">
          <input
            id={id}
            type="text"
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            className="flex-1 h-9 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={!hasChanges || updateProfile.isPending}
            className="h-9 px-4 rounded-[8px] bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {updateProfile.isPending ? 'Speichern...' : 'Speichern'}
          </button>
          <button
            onClick={handleCancel}
            className="h-9 px-3 rounded-[8px] border border-border text-text-secondary text-xs font-medium hover:bg-surface-hover transition-colors"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary">
            {value || 'Nicht angegeben'}
          </span>
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            Bearbeiten
          </button>
        </div>
      )}
    </div>
  )
}

export function ProfileSection({ profile }: Props) {
  const { user } = useAuth()

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <User size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">Profil</h2>
      </div>

      <div className="flex flex-col gap-4">
        {/* Avatar */}
        {user && (
          <AvatarUpload
            userId={user.id}
            avatarUrl={profile.avatar_url}
            fullName={profile.full_name}
          />
        )}

        {/* Name */}
        <EditableField
          id="full-name"
          label="Name"
          value={profile.full_name}
          fieldKey="full_name"
        />

        {/* Company */}
        <EditableField
          id="company-name"
          label="Unternehmen"
          value={profile.company_name}
          fieldKey="company_name"
        />
      </div>
    </section>
  )
}
