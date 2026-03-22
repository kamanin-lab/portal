import { cn } from "@/shared/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--r-sm)] bg-surface-active", className)}
      {...props}
    />
  )
}

export { Skeleton }
