import { afterEach, describe, expect, test, vi } from 'vitest';
import { getMemoryOperatorEmails, isMemoryOperator } from '../lib/memory-access';

describe('memory-access', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('parses configured operator emails from VITE env', () => {
    vi.stubEnv('VITE_MEMORY_OPERATOR_EMAILS', 'ops@example.com, second@example.com ');
    expect(getMemoryOperatorEmails()).toEqual(['ops@example.com', 'second@example.com']);
  });

  test('matches signed-in operator email against allow-list', () => {
    vi.stubEnv('VITE_MEMORY_OPERATOR_EMAILS', 'ops@example.com');
    expect(isMemoryOperator({ email: 'ops@example.com' } as never)).toBe(true);
    expect(isMemoryOperator({ email: 'client@example.com' } as never)).toBe(false);
  });
});
