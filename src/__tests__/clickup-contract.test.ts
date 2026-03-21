import { describe, expect, it } from 'vitest';
import {
  getClientFacingDisplayText,
  getPhaseOptionId,
  getVisibilityFromFields,
  isExplicitPublicTopLevelComment,
  isPortalOriginatedComment,
  resolveChapterConfigId,
  resolveStatusForAction,
} from '../../supabase/functions/_shared/clickup-contract';

describe('clickup contract helpers', () => {
  it('treats missing visibility as hidden by default', () => {
    expect(getVisibilityFromFields(undefined, 'visible-field')).toEqual({ found: false, visible: false });
    expect(getVisibilityFromFields([], 'visible-field')).toEqual({ found: false, visible: false });
  });

  it('reads explicit visibility values consistently', () => {
    expect(getVisibilityFromFields([{ id: 'visible-field', value: true }], 'visible-field')).toEqual({ found: true, visible: true });
    expect(getVisibilityFromFields([{ id: 'visible-field', value: '1' }], 'visible-field')).toEqual({ found: true, visible: true });
    expect(getVisibilityFromFields([{ id: 'visible-field', value: false }], 'visible-field')).toEqual({ found: true, visible: false });
  });

  it('resolves phase option ids from dropdown metadata and strings', () => {
    expect(getPhaseOptionId([
      {
        id: 'phase-field',
        value: 2,
        type_config: { options: [{ id: 'phase-a', orderindex: 1 }, { id: 'phase-b', orderindex: 2 }] },
      },
    ], 'phase-field')).toBe('phase-b');

    expect(getPhaseOptionId([{ id: 'phase-field', value: 'phase-direct' }], 'phase-field')).toBe('phase-direct');
  });

  it('resolves chapter config ids from the shared map', () => {
    const chapterMap = new Map([
      ['phase-a', 'chapter-1'],
      ['phase-b', 'chapter-2'],
    ]);

    expect(resolveChapterConfigId('phase-b', chapterMap)).toBe('chapter-2');
    expect(resolveChapterConfigId('missing', chapterMap)).toBeNull();
  });

  it('classifies public and portal comments through the shared contract', () => {
    expect(isExplicitPublicTopLevelComment('@client: Please review')).toBe(true);
    expect(getClientFacingDisplayText('@client: Please review')).toBe('Please review');
    expect(isPortalOriginatedComment('Yuri Kamanin (via Client Portal):\n\nHello')).toBe(true);
    expect(isExplicitPublicTopLevelComment('Internal only')).toBe(false);
  });

  it('resolves write-status aliases through one shared matcher', () => {
    const available = [
      { status: 'TO DO' },
      { status: 'CLIENT REVIEW' },
      { status: 'REWORK' },
      { status: 'APPROVED' },
    ];

    expect(resolveStatusForAction('approve', available)?.status).toBe('APPROVED');
    expect(resolveStatusForAction('request_changes', available)?.status).toBe('REWORK');
    expect(resolveStatusForAction('cancel', available)).toBeNull();
  });
});
