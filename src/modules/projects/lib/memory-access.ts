import type { Profile } from '@/shared/types/common';

function parseCsvEnv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getMemoryOperatorEmails() {
  return parseCsvEnv(import.meta.env.VITE_MEMORY_OPERATOR_EMAILS as string | undefined);
}

export function isMemoryOperator(profile: Profile | null | undefined) {
  const email = profile?.email?.trim().toLowerCase();
  if (!email) return false;
  return getMemoryOperatorEmails().includes(email);
}
