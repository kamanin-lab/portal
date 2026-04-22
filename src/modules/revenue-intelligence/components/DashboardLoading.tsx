import { Skeleton } from '@/shared/components/ui/skeleton'

export function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-6 p-8">
      <div className="w-full max-w-3xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl mt-4" />
      </div>
      <p className="text-sm text-text-secondary">
        Umsatz-Intelligenz wird geladen...
      </p>
    </div>
  )
}
