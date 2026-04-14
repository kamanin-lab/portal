import { mapStatus } from '../lib/status-mapping';
import type { ClickUpTask } from '../types/tasks';

export function useRecommendations(tasks: ClickUpTask[]) {
  const recommendations = tasks.filter(t =>
    t.tags?.some(tag => tag.name.toLowerCase() === 'recommendation') &&
    mapStatus(t.status) === 'open'
  );
  return { recommendations, count: recommendations.length };
}
