/**
 * Department-based ticket visibility predicate.
 * Pure function mirroring the SQL function `can_user_see_task`.
 * Single source of truth for client-side visibility checks.
 *
 * Rules (tightened 2026-04-21):
 *   1. Admin sees all
 *   2. Member with empty departments → sees all (legacy fallback, zero regression)
 *   3. Array overlap between member.departments and task.departments
 *   4. Creator override: task creator always sees their own task
 *
 * Untagged tasks are NOT public for scoped members — a member with non-empty
 * departments must have overlap or be the creator. This prevents the UX bug
 * where a newly scoped member still saw every pre-existing (untagged) ticket.
 */
export function canUserSeeTask(
  userRole: 'admin' | 'member' | 'viewer',
  userDepartments: string[],
  taskDepartments: string[],
  taskCreatorId: string | null,
  userId: string,
): boolean {
  // Admin sees everything
  if (userRole === 'admin') return true

  // Member with no departments assigned → legacy fallback, sees all
  if (userDepartments.length === 0) return true

  // Array overlap check
  if (taskDepartments.some(d => userDepartments.includes(d))) return true

  // Creator override
  if (taskCreatorId && taskCreatorId === userId) return true

  return false
}

/**
 * Resolves a department option ID to its display name.
 * Returns the option_id itself if not found in cache (orphan tolerance).
 */
export interface DepartmentOption {
  id: string
  name: string
  color?: string
}

export function resolveDepartmentName(
  optionId: string,
  departmentsCache: DepartmentOption[],
): string {
  const option = departmentsCache.find(o => o.id === optionId)
  return option?.name ?? optionId
}

/**
 * Filter a list of department IDs from cache to only those that still exist.
 * Used to detect orphan option_ids.
 */
export function getValidDepartmentIds(
  departmentIds: string[],
  departmentsCache: DepartmentOption[],
): string[] {
  const cacheIds = new Set(departmentsCache.map(o => o.id))
  return departmentIds.filter(id => cacheIds.has(id))
}
