import type { Project, Chapter, ChapterStatus } from '../types/project';
import {
  getCurrentChapter,
  getChapterStatus,
  getChapterProgress,
  isChapterCompleted,
  getPhaseColorForChapter,
} from '../lib/helpers';

export function useChapterHelpers(project: Project) {
  return {
    currentChapter: getCurrentChapter(project),
    getStatus: (ch: Chapter): ChapterStatus => getChapterStatus(ch, project),
    getProgress: (ch: Chapter): string => getChapterProgress(ch),
    isCompleted: (ch: Chapter): boolean => isChapterCompleted(ch),
    getPhaseColor: (ch: Chapter) => getPhaseColorForChapter(ch),
  };
}
