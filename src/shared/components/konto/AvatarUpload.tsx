import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Camera01Icon, Loading03Icon, MultiplicationSignIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { supabase } from '@/shared/lib/supabase'
import { useUpdateProfile } from '@/shared/hooks/useUpdateProfile'
import { cn } from '@/shared/lib/utils'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXT_MAP: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

interface Props {
  userId: string
  avatarUrl: string | null
  fullName: string | null
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return parts[0][0]?.toUpperCase() ?? '?'
}

export function AvatarUpload({ userId, avatarUrl, fullName }: Props) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateProfile = useUpdateProfile()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // Reset so same file can be re-selected

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Bitte ein Bild im Format JPG, PNG oder WebP hochladen.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Maximale Dateigröße: 2 MB.')
      return
    }

    setIsUploading(true)
    try {
      const ext = EXT_MAP[file.type] ?? 'jpg'
      const filePath = `${userId}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

      updateProfile.mutate({ avatar_url: publicUrl }, {
        onError: () => {
          toast.error('Profilbild hochgeladen, aber Profil konnte nicht aktualisiert werden.')
        },
      })
    } catch {
      toast.error('Fehler beim Hochladen. Bitte erneut versuchen.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = () => updateProfile.mutate({ avatar_url: null })
  const isLoading = isUploading || updateProfile.isPending

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <div
          className={cn(
            'h-14 w-14 rounded-full flex items-center justify-center overflow-hidden',
            'bg-surface-active border border-border',
            isLoading && 'opacity-60'
          )}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profilbild" className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-text-secondary select-none">
              {getInitials(fullName)}
            </span>
          )}
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <HugeiconsIcon icon={Loading03Icon} size={20} className="text-accent animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors',
            isLoading && 'opacity-60 cursor-not-allowed'
          )}
        >
          <HugeiconsIcon icon={Camera01Icon} size={13} />
          Foto ändern
        </button>
        {avatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-1.5 text-xs text-text-tertiary hover:text-awaiting transition-colors',
              isLoading && 'opacity-60 cursor-not-allowed'
            )}
          >
            <HugeiconsIcon icon={MultiplicationSignIcon} size={13} />
            Foto entfernen
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  )
}
