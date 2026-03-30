import type { ClickUpTask } from '../types/tasks';

export function useRecommendations(tasks: ClickUpTask[]) {
  const recommendations = tasks.filter(t =>
    t.tags?.some(tag => tag.name.toLowerCase() === 'recommendation') &&
    t.status.toLowerCase() === 'to do'
  );
  return { recommendations, count: recommendations.length };
}
