import { Avatar, AvatarImage, AvatarFallback } from '@/shared/components/ui/avatar';
import { cn } from '@/shared/lib/utils';

const SIZE_CLASSES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-lg',
} as const;

interface UserAvatarProps {
  name: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() ?? '?';
}

export function UserAvatar({ name, avatarUrl, size = 'md', className }: UserAvatarProps) {
  return (
    <Avatar className={cn(SIZE_CLASSES[size], className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name ?? ''} />}
      <AvatarFallback className="font-semibold">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
