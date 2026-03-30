import { cn } from '@/shared/lib/utils'

export function TypeBadge({ type }: { type: string }) {
  const isReply = type === 'team_reply' || type === 'project_reply'
  const isStepReady = type === 'step_ready'
  const isRecommendation = type === 'new_recommendation'
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium shrink-0',
      isReply ? 'bg-accent/10 text-accent'
        : isStepReady ? 'bg-green-500/10 text-green-600'
        : isRecommendation ? 'bg-amber-500/10 text-amber-600'
        : 'bg-surface-raised text-text-secondary'
    )}>
      {isReply ? 'Antwort' : isStepReady ? 'Bereit' : isRecommendation ? 'Empfehlung' : 'Status'}
    </span>
  )
}
