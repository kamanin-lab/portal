import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
}

export function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: 'var(--sp-2xl, 40px) var(--sp-lg, 24px)',
        color: 'var(--text-tertiary)',
        textAlign: 'center',
        fontSize: '14px',
      }}
    >
      {icon && <div style={{ opacity: 0.4, fontSize: '28px' }}>{icon}</div>}
      <span>{message}</span>
    </div>
  );
}
