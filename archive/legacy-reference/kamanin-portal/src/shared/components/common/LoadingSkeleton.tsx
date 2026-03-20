interface LoadingSkeletonProps {
  lines?: number;
  height?: string;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, height = '20px', className }: LoadingSkeletonProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            borderRadius: 'var(--r-sm, 4px)',
            background: 'linear-gradient(90deg, var(--surface-active) 25%, var(--surface-hover) 50%, var(--surface-active) 75%)',
            backgroundSize: '200% 100%',
            animation: 'skeleton-shimmer 1.5s infinite',
            opacity: 1 - i * 0.15,
          }}
        />
      ))}
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
