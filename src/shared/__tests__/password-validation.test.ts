import { describe, test, expect } from 'vitest';
import { PASSWORD_RULES, validatePassword } from '../lib/password-validation';

describe('PASSWORD_RULES', () => {
  test('exports exactly 4 rules with keys: length, uppercase, digit, special', () => {
    const keys = PASSWORD_RULES.map(r => r.key);
    expect(keys).toEqual(['length', 'uppercase', 'digit', 'special']);
  });

  describe('length rule', () => {
    const rule = PASSWORD_RULES.find(r => r.key === 'length')!;

    test('fails for passwords shorter than 8 characters', () => {
      expect(rule.test('abc')).toBe(false);
      expect(rule.test('1234567')).toBe(false);
    });

    test('passes for passwords of exactly 8 characters', () => {
      expect(rule.test('abcdefgh')).toBe(true);
    });

    test('passes for passwords longer than 8 characters', () => {
      expect(rule.test('averylongpassword')).toBe(true);
    });
  });

  describe('uppercase rule', () => {
    const rule = PASSWORD_RULES.find(r => r.key === 'uppercase')!;

    test('fails when no uppercase letter is present', () => {
      expect(rule.test('alllowercase1!')).toBe(false);
    });

    test('passes when at least one uppercase letter is present', () => {
      expect(rule.test('Password1!')).toBe(true);
      expect(rule.test('A')).toBe(true);
    });
  });

  describe('digit rule', () => {
    const rule = PASSWORD_RULES.find(r => r.key === 'digit')!;

    test('fails when no digit is present', () => {
      expect(rule.test('NoDigitsHere!')).toBe(false);
    });

    test('passes when at least one digit is present', () => {
      expect(rule.test('Pass1!')).toBe(true);
    });
  });

  describe('special character rule', () => {
    const rule = PASSWORD_RULES.find(r => r.key === 'special')!;

    test('fails when only alphanumeric characters are present', () => {
      expect(rule.test('Password1')).toBe(false);
    });

    test.each(['!', '@', '#', '$', '-', '_', '.', '€'])('passes for special char: %s', (char) => {
      expect(rule.test(`Pass1${char}`)).toBe(true);
    });
  });
});

describe('validatePassword', () => {
  test('returns valid: false and all results failed for empty string', () => {
    const { valid, results } = validatePassword('');
    expect(valid).toBe(false);
    expect(results.every(r => !r.passed)).toBe(true);
  });

  test('returns valid: true for a password meeting all rules', () => {
    const { valid, results } = validatePassword('Secret1!');
    expect(valid).toBe(true);
    expect(results.every(r => r.passed)).toBe(true);
  });

  test('returns valid: false when only the length rule fails', () => {
    const { valid, results } = validatePassword('Se1!');
    expect(valid).toBe(false);
    const lengthResult = results.find(r => r.key === 'length')!;
    expect(lengthResult.passed).toBe(false);
  });

  test('returns valid: false when only the uppercase rule fails', () => {
    const { valid, results } = validatePassword('secret1!x');
    expect(valid).toBe(false);
    const upperResult = results.find(r => r.key === 'uppercase')!;
    expect(upperResult.passed).toBe(false);
  });

  test('returns valid: false when only the digit rule fails', () => {
    const { valid, results } = validatePassword('SecretPass!');
    expect(valid).toBe(false);
    const digitResult = results.find(r => r.key === 'digit')!;
    expect(digitResult.passed).toBe(false);
  });

  test('returns valid: false when only the special char rule fails', () => {
    const { valid, results } = validatePassword('Secret123');
    expect(valid).toBe(false);
    const specialResult = results.find(r => r.key === 'special')!;
    expect(specialResult.passed).toBe(false);
  });

  test('results array includes one entry per rule, in order', () => {
    const { results } = validatePassword('anything');
    expect(results.map(r => r.key)).toEqual(['length', 'uppercase', 'digit', 'special']);
  });
});
