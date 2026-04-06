import { describe, it, expect } from 'vitest';

// Pure helper — will be extracted from handleTaskCreated in clickup-webhook/index.ts
// Tests the list-ID filtering logic for TRIAGE_ENABLED_LIST_IDS env var
function isListMonitored(listId: string, enabledListIds: string): boolean {
  if (!enabledListIds || !listId) return false;
  const ids = enabledListIds.split(',').map(id => id.trim()).filter(Boolean);
  return ids.includes(listId);
}

describe('triage list-ID filter', () => {
  it('returns true when list ID is in comma-separated env var', () => {
    expect(isListMonitored('901305442177', '901305442177')).toBe(true);
  });

  it('returns true when list ID is one of multiple IDs', () => {
    expect(isListMonitored('901305442177', '111111,901305442177,222222')).toBe(true);
  });

  it('returns false when list ID is not in the list', () => {
    expect(isListMonitored('999999', '901305442177,111111')).toBe(false);
  });

  it('returns false when env var is empty string', () => {
    expect(isListMonitored('901305442177', '')).toBe(false);
  });

  it('handles whitespace around IDs', () => {
    expect(isListMonitored('901305442177', ' 901305442177 , 111111 ')).toBe(true);
  });

  it('returns false when list ID is empty', () => {
    expect(isListMonitored('', '901305442177')).toBe(false);
  });
});
