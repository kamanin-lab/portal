import type { ReactNode } from 'react';
import { motion } from 'motion/react';

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
}

export function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: 'var(--sp-2xl, 40px) var(--sp-lg, 24px)',
        color: 'var(--text-secondary)',
        textAlign: 'center',
        fontSize: '14px',
      }}
    >
      {icon && <div style={{ opacity: 0.5, fontSize: '32px' }}>{icon}</div>}
      <span>{message}</span>
    </motion.div>
  );
}
