import { describe, test, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from '../lib/date-utils';

// Pin "now" to a fixed instant so relative calculations are deterministic.
const NOW = new Date('2026-04-14T12:00:00.000Z');

function isoSecondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return isoSecondsAgo(minutes * 60);
}

function isoHoursAgo(hours: number): string {
  return isoMinutesAgo(hours * 60);
}

function isoDaysAgo(days: number): string {
  return isoHoursAgo(days * 24);
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns "gerade eben" for timestamps less than 1 minute ago', () => {
    expect(formatRelativeTime(isoSecondsAgo(30))).toBe('gerade eben');
    expect(formatRelativeTime(isoSecondsAgo(0))).toBe('gerade eben');
  });

  test('returns "vor N Min." for timestamps 1–59 minutes ago', () => {
    expect(formatRelativeTime(isoMinutesAgo(1))).toBe('vor 1 Min.');
    expect(formatRelativeTime(isoMinutesAgo(30))).toBe('vor 30 Min.');
    expect(formatRelativeTime(isoMinutesAgo(59))).toBe('vor 59 Min.');
  });

  test('returns "vor N Std." for timestamps 1–23 hours ago', () => {
    expect(formatRelativeTime(isoHoursAgo(1))).toBe('vor 1 Std.');
    expect(formatRelativeTime(isoHoursAgo(12))).toBe('vor 12 Std.');
    expect(formatRelativeTime(isoHoursAgo(23))).toBe('vor 23 Std.');
  });

  test('returns "vor 1 Tag" (singular) for exactly 1 day ago', () => {
    expect(formatRelativeTime(isoDaysAgo(1))).toBe('vor 1 Tag');
  });

  test('returns "vor N Tagen" (plural) for 2–6 days ago', () => {
    expect(formatRelativeTime(isoDaysAgo(2))).toBe('vor 2 Tagen');
    expect(formatRelativeTime(isoDaysAgo(6))).toBe('vor 6 Tagen');
  });

  test('returns a formatted date string for timestamps 7+ days ago', () => {
    // 7 days ago → full date in de-DE format (dd.mm.yyyy)
    const result = formatRelativeTime(isoDaysAgo(7));
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  test('returns a properly formatted de-DE date for an old date', () => {
    expect(formatRelativeTime('2026-01-05T00:00:00.000Z')).toMatch(/^\d{2}\.\d{2}\.2026$/);
  });

  test('returns the raw input string when the date is invalid', () => {
    const invalid = 'not-a-date';
    expect(formatRelativeTime(invalid)).toBe(invalid);
  });
});
