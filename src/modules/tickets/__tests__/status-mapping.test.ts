import { describe, test, expect } from 'vitest';
import { mapStatus, isTerminal, needsClientAction } from '../lib/status-mapping';

describe('mapStatus', () => {
  test.each([
    ['to do',           'open'],
    ['in progress',     'in_progress'],
    ['internal review', 'in_progress'],
    ['rework',          'in_progress'],
    ['client review',   'needs_attention'],
    ['approved',        'approved'],
    ['complete',        'done'],
    ['on hold',         'on_hold'],
    ['canceled',        'cancelled'],
  ])('maps "%s" → "%s"', (clickup, portal) => {
    expect(mapStatus(clickup)).toBe(portal);
  });

  test('unknown status falls back to open', () => {
    expect(mapStatus('some unknown status')).toBe('open');
  });

  test('is case-insensitive', () => {
    expect(mapStatus('Client Review')).toBe('needs_attention');
    expect(mapStatus('IN PROGRESS')).toBe('in_progress');
  });
});

describe('isTerminal', () => {
  test('done is terminal', () => expect(isTerminal('done')).toBe(true));
  test('cancelled is terminal', () => expect(isTerminal('cancelled')).toBe(true));
  test('in_progress is not terminal', () => expect(isTerminal('in_progress')).toBe(false));
  test('needs_attention is not terminal', () => expect(isTerminal('needs_attention')).toBe(false));
  test('approved is not terminal', () => expect(isTerminal('approved')).toBe(false));
});

describe('needsClientAction', () => {
  test('needs_attention requires client action', () => {
    expect(needsClientAction('needs_attention')).toBe(true);
  });
  test('other statuses do not require client action', () => {
    expect(needsClientAction('in_progress')).toBe(false);
    expect(needsClientAction('approved')).toBe(false);
    expect(needsClientAction('done')).toBe(false);
  });
});
