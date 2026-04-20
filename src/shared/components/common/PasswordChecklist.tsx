import { HugeiconsIcon } from '@hugeicons/react'
import { Tick01Icon, MultiplicationSignIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import { PASSWORD_RULES, validatePassword } from '@/shared/lib/password-validation'

interface PasswordChecklistProps {
  password: string
  className?: string
}

export function PasswordChecklist({ password, className }: PasswordChecklistProps) {
  if (password.length === 0) return null

  const { results } = validatePassword(password)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {PASSWORD_RULES.map(rule => {
        const passed = results.find(r => r.key === rule.key)?.passed ?? false
        return (
          <div key={rule.key} className="flex items-center gap-1.5">
            {passed ? (
              <HugeiconsIcon icon={Tick01Icon} size={12} className="text-committed shrink-0" />
            ) : (
              <HugeiconsIcon icon={MultiplicationSignIcon} size={12} className="text-awaiting shrink-0" />
            )}
            <span className={cn('text-xs', passed ? 'text-committed' : 'text-awaiting')}>
              {rule.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
