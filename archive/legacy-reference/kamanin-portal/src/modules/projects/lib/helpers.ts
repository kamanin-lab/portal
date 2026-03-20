import type { Project, Chapter, Step, ProjectTask, StepWithChapter, ChapterStatus } from '../types/project';
import { getPhaseColor, type PhaseColor } from './phase-colors';

export function getNextCheckpoint(project: Project): StepWithChapter | null {
  for (const chapter of project.chapters) {
    for (const step of chapter.steps) {
      if (step.status === 'awaiting_input') return { step, chapter };
    }
  }
  return null;
}

export function getNextUpcomingStep(project: Project): StepWithChapter | null {
  for (const chapter of project.chapters) {
    for (const step of chapter.steps) {
      if (step.status === 'upcoming_locked') return { step, chapter };
    }
  }
  return null;
}

export function getCurrentChapter(project: Project): Chapter | null {
  const next = getNextCheckpoint(project);
  if (next) return next.chapter;
  return project.chapters[project.chapters.length - 1] ?? null;
}

export function isChapterCompleted(chapter: Chapter): boolean {
  return chapter.steps.every(s => s.status === 'committed');
}

export function getChapterStatus(chapter: Chapter, project: Project): ChapterStatus {
  if (isChapterCompleted(chapter)) return 'completed';
  const currentCh = getCurrentChapter(project);
  if (currentCh && chapter.id === currentCh.id) return 'current';
  return 'upcoming';
}

export function getChapterProgress(chapter: Chapter): string {
  const done = chapter.steps.filter(s => s.status === 'committed').length;
  return `${done}/${chapter.steps.length}`;
}

export function getPhaseColorForChapter(chapter: Chapter): PhaseColor {
  return getPhaseColor(chapter.order);
}

export function generateNarrative(project: Project): string {
  const completedChapters = project.chapters.filter(isChapterCompleted);
  const currentCh = getCurrentChapter(project);
  const next = getNextCheckpoint(project);

  // Special case: first checkpoint
  if (completedChapters.length === 0 && next) {
    return `Wir haben Ihre Anforderungen gesammelt und den Projektbrief bestätigt. Als Nächstes legen wir den Scope fest — danach starten wir mit der Struktur Ihrer Website.`;
  }

  let narrative = '';

  if (completedChapters.length > 0) {
    const names = completedChapters.map(c => c.title).join(' und ');
    narrative += `Wir haben die Phase „${names}" abgeschlossen. `;
  }

  if (next) {
    narrative += `Aktuell: ${next.step.title}. `;
  }

  const curIdx = project.chapters.findIndex(c => c.id === currentCh?.id);
  if (curIdx >= 0 && curIdx < project.chapters.length - 1) {
    narrative += `Danach starten wir mit: ${project.chapters[curIdx + 1].title}.`;
  } else if (curIdx === project.chapters.length - 1) {
    narrative += 'Wir nähern uns dem Abschluss.';
  }

  return narrative;
}

export function getTasksForStep(stepId: string, project: Project): ProjectTask[] {
  return project.tasks.filter(t => t.stepId === stepId);
}

export function getStepById(stepId: string, project: Project): { step: Step; chapter: Chapter } | null {
  for (const chapter of project.chapters) {
    const step = chapter.steps.find(s => s.id === stepId);
    if (step) return { step, chapter };
  }
  return null;
}

export function statusLabel(status: Step['status']): string {
  const map: Record<string, string> = {
    committed: 'Bestätigt',
    awaiting_input: 'Wartet auf Sie',
    upcoming_locked: 'Bald',
  };
  return map[status] ?? status;
}

export function taskStatusLabel(status: string): string {
  const map: Record<string, string> = {
    'needs-attention': 'Offen',
    'in-progress': 'In Arbeit',
    done: 'Erledigt',
  };
  return map[status] ?? status;
}
