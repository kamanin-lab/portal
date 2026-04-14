import { describe, test, expect } from 'vitest';
import { mapStepStatus } from '../lib/step-status-mapping';

describe('mapStepStatus', () => {
  test.each([
    ['client review', 'awaiting_input'],
    ['approved',      'committed'],
    ['complete',      'committed'],
    ['done',          'committed'],
  ] as const)('maps "%s" → "%s"', (raw, expected) => {
    expect(mapStepStatus(raw)).toBe(expected);
  });

  test('normalizes input to lowercase before matching', () => {
    expect(mapStepStatus('CLIENT REVIEW')).toBe('awaiting_input');
    expect(mapStepStatus('APPROVED')).toBe('committed');
    expect(mapStepStatus('Complete')).toBe('committed');
  });

  test('trims whitespace before matching', () => {
    expect(mapStepStatus('  client review  ')).toBe('awaiting_input');
    expect(mapStepStatus(' done ')).toBe('committed');
  });

  test('returns upcoming_locked for any unknown status', () => {
    expect(mapStepStatus('in progress')).toBe('upcoming_locked');
    expect(mapStepStatus('to do')).toBe('upcoming_locked');
    expect(mapStepStatus('')).toBe('upcoming_locked');
    expect(mapStepStatus('some random status')).toBe('upcoming_locked');
  });
});
