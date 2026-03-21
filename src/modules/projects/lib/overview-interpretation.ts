import type {
  Chapter,
  Project,
  ProjectAttentionItem,
  ProjectQuickAction,
  Step,
  StepWithChapter,
  Update,
} from '../types/project';
import { getCurrentChapter, getNextUpcomingStep, isChapterCompleted } from './helpers';

export interface InterpretedProjectOverview {
  currentChapter: Chapter | null;
  currentCheckpoint: StepWithChapter | null;
  nextMeaningfulStep: StepWithChapter | null;
  currentStateTitle: string;
  currentStateDescription: string;
  waitingOnTeamSummary: string;
  nextStepSummary: string;
  topUpdates: Update[];
  primaryAttention: ProjectAttentionItem | null;
  attentionList: ProjectAttentionItem[];
  quickActions: ProjectQuickAction[];
}

type RankedAttentionItem = ProjectAttentionItem & {
  hasPortalCta: boolean;
  chapterOrder: number;
  stepOrder: number;
};

function compareAttentionItems(a: RankedAttentionItem, b: RankedAttentionItem): number {
  if (a.hasPortalCta !== b.hasPortalCta) return a.hasPortalCta ? -1 : 1;

  const milestoneA = a.milestoneOrder ?? Number.POSITIVE_INFINITY;
  const milestoneB = b.milestoneOrder ?? Number.POSITIVE_INFINITY;
  if (milestoneA !== milestoneB) return milestoneA - milestoneB;

  if (a.chapterOrder !== b.chapterOrder) return a.chapterOrder - b.chapterOrder;
  return a.stepOrder - b.stepOrder;
}

function buildAttentionItem(step: Step, chapter: Chapter, isPrimary: boolean): ProjectAttentionItem {
  return {
    stepId: step.id,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    title: step.title,
    description:
      step.description ||
      'Bitte prüfen Sie diesen Schritt. Ihre Freigabe oder Ihr Feedback hilft uns, ohne Verzögerung weiterzumachen.',
    whyItMatters: step.whyItMatters,
    whatBecomesFixed: step.whatBecomesFixed,
    lastUpdated: step.updatedAt,
    portalCta: step.portalCta,
    milestoneOrder: step.milestoneOrder,
    isPrimary,
  };
}

function resolveAttentionItems(project: Project): ProjectAttentionItem[] {
  const ranked: RankedAttentionItem[] = [];

  project.chapters.forEach((chapter, chapterIndex) => {
    chapter.steps.forEach((step, stepIndex) => {
      if (!step.isClientReview) return;
      ranked.push({
        ...buildAttentionItem(step, chapter, false),
        hasPortalCta: Boolean(step.portalCta),
        chapterOrder: chapter.order ?? chapterIndex,
        stepOrder: stepIndex,
      });
    });
  });

  ranked.sort(compareAttentionItems);

  return ranked.map((item, index) => ({
    stepId: item.stepId,
    chapterId: item.chapterId,
    chapterTitle: item.chapterTitle,
    title: item.title,
    description: item.description,
    whyItMatters: item.whyItMatters,
    whatBecomesFixed: item.whatBecomesFixed,
    lastUpdated: item.lastUpdated,
    portalCta: item.portalCta,
    milestoneOrder: item.milestoneOrder,
    isPrimary: index === 0,
  }));
}

function buildCurrentStateTitle(currentChapter: Chapter | null, primaryAttention: ProjectAttentionItem | null, project: Project): string {
  if (primaryAttention) return `Aktuell in Arbeit: ${primaryAttention.chapterTitle}`;
  if (currentChapter && !isChapterCompleted(currentChapter)) return `Aktuelle Projektphase: ${currentChapter.title}`;
  if (project.teamWorkingOn.task) return 'Aktueller Stand';
  return 'Projektstand';
}

function buildCurrentStateDescription(currentChapter: Chapter | null, primaryAttention: ProjectAttentionItem | null, project: Project): string {
  if (primaryAttention) {
    return `Der nächste freizugebende Schritt ist „${primaryAttention.title}“. Nach Ihrer Rückmeldung können wir in der Phase ${primaryAttention.chapterTitle} sauber weiterarbeiten.`;
  }

  if (currentChapter && !isChapterCompleted(currentChapter)) {
    return currentChapter.narrative || currentChapter.nextNarrative || 'Diese Phase wird aktuell vorbereitet und bearbeitet.';
  }

  if (project.teamWorkingOn.task) {
    return `Unser Team arbeitet aktuell an „${project.teamWorkingOn.task}“. Sobald wir etwas von Ihnen brauchen, erscheint es oben im Aufmerksamkeitsbereich.`;
  }

  return 'Alle aktuell sichtbaren Schritte sind abgeschlossen.';
}

function buildWaitingOnTeamSummary(project: Project): string {
  if (!project.teamWorkingOn.task) {
    return 'Zurzeit gibt es keinen hervorgehobenen internen Arbeitsschritt.';
  }

  return project.teamWorkingOn.lastUpdate
    ? `Unser Team arbeitet gerade an „${project.teamWorkingOn.task}“ (letztes Update: ${project.teamWorkingOn.lastUpdate}).`
    : `Unser Team arbeitet gerade an „${project.teamWorkingOn.task}“.`;
}

function buildNextStepSummary(nextMeaningfulStep: StepWithChapter | null): string {
  if (!nextMeaningfulStep) {
    return 'Der nächste sinnvolle Schritt wird sichtbar, sobald neue Aktivität oder ein neuer Freigabepunkt vorliegt.';
  }

  const { chapter, step } = nextMeaningfulStep;
  return `Als Nächstes relevant: „${step.title}“ in ${chapter.title}.`;
}

function buildQuickActions(project: Project, primaryAttention: ProjectAttentionItem | null): ProjectQuickAction[] {
  return [
    {
      key: 'primary-cta',
      label: primaryAttention ? 'Freigabe / Prüfung öffnen' : 'Aufgabe erstellen',
      subtitle: primaryAttention
        ? `Jetzt relevant: ${primaryAttention.title}`
        : `${project.tasksSummary.total} Aufgaben insgesamt`,
      iconToken: 'primary_cta',
      destinationKind: primary_ctaDestinationKind(primaryAttention),
      count: primaryAttention ? 1 : null,
      isEnabled: true,
      sortOrder: 10,
    },
    {
      key: 'send-message',
      label: 'Nachricht senden',
      subtitle: 'Direkter Kontakt zum Team',
      iconToken: 'general_message',
      destinationKind: 'general_message',
      count: null,
      isEnabled: true,
      sortOrder: 20,
    },
    {
      key: 'files',
      label: 'Dateien hochladen',
      subtitle: 'Dateien teilen',
      iconToken: 'files',
      destinationKind: 'files',
      count: null,
      isEnabled: true,
      sortOrder: 30,
    },
  ];
}

function primary_ctaDestinationKind(primaryAttention: ProjectAttentionItem | null): 'primary_cta' | 'create_task' {
  return primaryAttention ? 'primary_cta' : 'create_task';
}

export function interpretProjectOverview(project: Project): InterpretedProjectOverview {
  const attentionList = resolveAttentionItems(project);
  const primaryAttention = attentionList[0] ?? null;
  const currentChapter = getCurrentChapter(project);
  const currentCheckpoint = primaryAttention
    ? project.chapters
        .flatMap(chapter => chapter.steps.map(step => ({ step, chapter })))
        .find(item => item.step.id === primaryAttention.stepId) ?? null
    : null;
  const nextUpcoming = getNextUpcomingStep(project);
  const nextMeaningfulStep = currentCheckpoint ?? nextUpcoming;

  return {
    currentChapter,
    currentCheckpoint,
    nextMeaningfulStep,
    currentStateTitle: buildCurrentStateTitle(currentChapter, primaryAttention, project),
    currentStateDescription: buildCurrentStateDescription(currentChapter, primaryAttention, project),
    waitingOnTeamSummary: buildWaitingOnTeamSummary(project),
    nextStepSummary: buildNextStepSummary(nextMeaningfulStep),
    topUpdates: project.updates.slice(0, 3),
    primaryAttention,
    attentionList,
    quickActions: buildQuickActions(project, primaryAttention),
  };
}
