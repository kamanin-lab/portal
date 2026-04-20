import type {
  Chapter,
  Project,
  ProjectAttentionItem,
  ProjectQuickAction,
  QuickActionConfigRow,
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
  chapterOrder: number;
  stepOrder: number;
};

function compareAttentionItems(a: RankedAttentionItem, b: RankedAttentionItem): number {
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

/** Map a config row key to a destinationKind */
function resolveDestinationKind(row: QuickActionConfigRow): ProjectQuickAction['destinationKind'] {
  if (row.url) return 'external_link';
  return 'external_link';
}

/** Build quick actions from DB config rows */
function buildQuickActionsFromConfig(rows: QuickActionConfigRow[]): ProjectQuickAction[] {
  return rows.map(row => ({
    key: row.key,
    label: row.label,
    subtitle: row.subtitle,
    iconToken: row.icon,
    destinationKind: resolveDestinationKind(row),
    count: null,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
    url: row.url,
  }));
}

function buildQuickActions(project: Project): ProjectQuickAction[] {
  if (project.quickActionsConfig && project.quickActionsConfig.length > 0) {
    return buildQuickActionsFromConfig(project.quickActionsConfig);
  }
  return [];
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
    quickActions: buildQuickActions(project),
  };
}
