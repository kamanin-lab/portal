import { describe, it, expect } from 'vitest';

// These regex patterns will be implemented in clickup-webhook/index.ts handleTriageHitl
// Defined here for testability outside Deno runtime
const APPROVE_PATTERN = /^\[approve\]$/i;
const APPROVE_WITH_CORRECTIONS_PATTERN = /^\[approve:\s*(\d+(?:\.\d+)?)h\s+(\d+(?:\.\d+)?)cr\]$/i;
const REJECT_PATTERN = /^\[reject:\s*(.+)\]$/i;

describe('HITL regex patterns', () => {
  describe('[approve] pattern', () => {
    it('matches exact [approve]', () => {
      expect(APPROVE_PATTERN.test('[approve]')).toBe(true);
    });
    it('matches case-insensitive [APPROVE]', () => {
      expect(APPROVE_PATTERN.test('[APPROVE]')).toBe(true);
    });
    it('does not match [approve: 3h 5cr]', () => {
      expect(APPROVE_PATTERN.test('[approve: 3h 5cr]')).toBe(false);
    });
    it('does not match partial text', () => {
      expect(APPROVE_PATTERN.test('I [approve] this')).toBe(false);
    });
  });

  describe('[approve: Xh Ycr] pattern', () => {
    it('matches [approve: 3h 5cr]', () => {
      const m = '[approve: 3h 5cr]'.match(APPROVE_WITH_CORRECTIONS_PATTERN);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('3');
      expect(m![2]).toBe('5');
    });
    it('matches decimal values [approve: 2.5h 3.5cr]', () => {
      const m = '[approve: 2.5h 3.5cr]'.match(APPROVE_WITH_CORRECTIONS_PATTERN);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('2.5');
      expect(m![2]).toBe('3.5');
    });
    it('matches with extra spaces [approve:  4h  6cr]', () => {
      expect(APPROVE_WITH_CORRECTIONS_PATTERN.test('[approve:  4h  6cr]')).toBe(true);
    });
    it('does not match missing cr [approve: 3h]', () => {
      expect(APPROVE_WITH_CORRECTIONS_PATTERN.test('[approve: 3h]')).toBe(false);
    });
  });

  describe('[reject: reason] pattern', () => {
    it('matches [reject: need more details]', () => {
      const m = '[reject: need more details]'.match(REJECT_PATTERN);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('need more details');
    });
    it('matches [reject: out of scope]', () => {
      expect(REJECT_PATTERN.test('[reject: out of scope]')).toBe(true);
    });
    it('does not match empty reason [reject:]', () => {
      expect(REJECT_PATTERN.test('[reject:]')).toBe(false);
    });
    it('does not match partial text', () => {
      expect(REJECT_PATTERN.test('I said [reject: reason] here')).toBe(false);
    });
  });

  describe('no match cases', () => {
    it('returns no match for plain comment text', () => {
      const text = 'Looks good to me!';
      expect(APPROVE_PATTERN.test(text)).toBe(false);
      expect(APPROVE_WITH_CORRECTIONS_PATTERN.test(text)).toBe(false);
      expect(REJECT_PATTERN.test(text)).toBe(false);
    });
  });
});
