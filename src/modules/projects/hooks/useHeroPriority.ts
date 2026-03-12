import type { Project } from '../types/project';
import { getNextCheckpoint, getNextUpcomingStep } from '../lib/helpers';

export type HeroPriority = 1 | 2 | 3 | 4;

export function useHeroPriority(project: Project): HeroPriority {
  if (getNextCheckpoint(project)) return 1;
  if (project.tasksSummary.needsAttention > 0) return 2;
  if (getNextUpcomingStep(project)) return 3;
  return 4;
}
