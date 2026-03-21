import { describe, expect, it } from 'vitest';
import {
  buildChapterConfigMap,
  getClientFacingDisplayText,
  getClientFacingDisplayTextForEvent,
  getPhaseOptionId,
  getVisibilityFromFields,
  isClientFacingCommentEvent,
  isExplicitPublicTopLevelComment,
  isPortalOriginatedComment,
  resolveChapterConfigId,
  resolvePublicThreadRootId,
  resolveStatusForAction,
  resolveTaskChapterConfigId,
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

  it('resolves webhook-style chapter config ids for numeric dropdown and direct string options', () => {
    const chapterMap = buildChapterConfigMap([
      { id: 'chapter-1', clickup_cf_option_id: 'phase-a' },
      { id: 'chapter-2', clickup_cf_option_id: 'phase-b' },
    ]);

    expect(resolveTaskChapterConfigId([
      {
        id: 'phase-field',
        value: 2,
        type_config: { options: [{ id: 'phase-a', orderindex: 1 }, { id: 'phase-b', orderindex: 2 }] },
      },
    ], 'phase-field', chapterMap)).toBe('chapter-2');

    expect(resolveTaskChapterConfigId([
      { id: 'phase-field', value: 'phase-a' },
    ], 'phase-field', chapterMap)).toBe('chapter-1');

    expect(resolveTaskChapterConfigId([
      { id: 'phase-field', value: 'phase-missing' },
    ], 'phase-field', chapterMap)).toBeNull();
  });

  it('preserves the correct chapter assignment across webhook-style project task updates and moves', () => {
    const chapterMap = buildChapterConfigMap([
      { id: 'chapter-discovery', clickup_cf_option_id: 'phase-discovery' },
      { id: 'chapter-build', clickup_cf_option_id: 'phase-build' },
    ]);

    const taskInDiscovery = [
      { id: 'phase-field', value: 'phase-discovery' },
    ];
    const taskMovedToBuild = [
      {
        id: 'phase-field',
        value: 2,
        type_config: {
          options: [
            { id: 'phase-discovery', orderindex: 1 },
            { id: 'phase-build', orderindex: 2 },
          ],
        },
      },
    ];

    expect(resolveTaskChapterConfigId(taskInDiscovery, 'phase-field', chapterMap)).toBe('chapter-discovery');
    expect(resolveTaskChapterConfigId(taskMovedToBuild, 'phase-field', chapterMap)).toBe('chapter-build');
    expect(resolveTaskChapterConfigId(taskMovedToBuild, 'phase-field', chapterMap)).toBe('chapter-build');
  });

  it('classifies public and portal comments through the shared contract', () => {
    expect(isExplicitPublicTopLevelComment('@client: Please review')).toBe(true);
    expect(getClientFacingDisplayText('@client: Please review')).toBe('Please review');
    expect(isPortalOriginatedComment('Yuri Kamanin (via Client Portal):\n\nHello')).toBe(true);
    expect(isExplicitPublicTopLevelComment('Internal only')).toBe(false);
  });

  it('resolves a single public thread root and rejects ambiguous public roots', () => {
    expect(resolvePublicThreadRootId([
      { id: 'internal-1', comment_text: 'Internal only', date: '10' },
      { id: 'public-1', comment_text: '@client: Visible update', date: '20' },
    ])).toEqual({ rootId: 'public-1', reason: 'single' });

    expect(resolvePublicThreadRootId([
      { id: 'public-1', comment_text: '@client: First public thread', date: '20' },
      { id: 'portal-1', comment_text: 'Yuri Kamanin (via Client Portal):\n\nReply', date: '30' },
    ])).toEqual({ rootId: null, reason: 'ambiguous' });

    expect(resolvePublicThreadRootId([
      { id: 'internal-1', comment_text: 'Internal only', date: '10' },
    ])).toEqual({ rootId: null, reason: 'none' });
  });

  it('uses one client-facing comment-event contract for top-level and threaded replies', () => {
    expect(isClientFacingCommentEvent({
      commentText: '@client: Visible update',
      isReply: false,
      isClientFacingThread: false,
    })).toBe(true);

    expect(isClientFacingCommentEvent({
      commentText: 'Reply inside public thread',
      isReply: true,
      isClientFacingThread: true,
    })).toBe(true);

    expect(isClientFacingCommentEvent({
      commentText: '@client: Misleading reply inside internal thread',
      isReply: true,
      isClientFacingThread: false,
    })).toBe(false);

    expect(getClientFacingDisplayTextForEvent({
      commentText: '@client: Visible update',
      isReply: false,
      isClientFacingThread: false,
    })).toBe('Visible update');

    expect(getClientFacingDisplayTextForEvent({
      commentText: 'Reply inside public thread',
      isReply: true,
      isClientFacingThread: true,
    })).toBe('Reply inside public thread');
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
