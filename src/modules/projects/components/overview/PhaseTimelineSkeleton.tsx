import { Skeleton } from '@/shared/components/ui/skeleton';

export function PhaseTimelineSkeleton() {
  return (
    <div className="mb-3 px-3 py-2 bg-[var(--surface)] border border-[var(--border-light)] rounded-[var(--r-md)]">
      <div className="flex">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-start gap-1.5 py-1 pr-3">
            <Skeleton data-testid="skeleton-node" className="w-[28px] h-[28px] rounded-full" />
            <Skeleton className="w-14 h-2.5 rounded" />
            <Skeleton className="w-10 h-2 rounded" />
            <Skeleton className="w-12 h-4 rounded-full mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
