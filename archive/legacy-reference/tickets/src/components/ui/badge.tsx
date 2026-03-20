import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Status variants — per ClientPortal_Status_Priority_Color_System_FINAL
        open: "border-transparent bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
        in_progress: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
        needs_attention: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
        approved: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
        done: "border-transparent bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
        on_hold: "border-transparent bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
        cancelled: "border-transparent bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
    )
  }
)

Badge.displayName = "Badge"

export { Badge, badgeVariants }
