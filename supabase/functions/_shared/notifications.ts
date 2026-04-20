/**
 * Shared notification helpers for bell (in-app) notification gating.
 * Mirrors the pattern of shouldSendEmail in clickup-webhook/index.ts.
 *
 * Used by: clickup-webhook, post-task-comment
 */

/**
 * Maps bell notification events to notification_preferences JSONB keys.
 * If a bell event is NOT in this mapping, shouldCreateBell will fail-open (always create).
 */
export const BELL_EVENT_TO_PREF_KEY: Record<string, string> = {
  // Tasks (tickets module)
  task_review: "task_review",
  task_completed: "task_completed",
  task_in_progress: "task_review",
  credit_approval: "task_review",
  team_question: "team_comment",
  peer_message: "peer_messages",
  new_recommendation: "new_recommendation",
  support_response: "support_response",
  // Projects module
  step_ready: "project_task_ready",
  step_completed: "project_step_completed",
  step_in_progress: "project_task_ready",
  chapter_completed: "project_step_completed",
  project_step_status: "project_task_ready",
  project_reply: "project_messages",
};

/**
 * Determine whether an in-app (bell) notification should be created for a profile.
 *
 * Logic:
 * 1. If bellEvent has a mapped prefKey AND prefs object contains that key → use it.
 * 2. If bellEvent is NOT in the mapping → always create (fail-open for new event types).
 * 3. If prefs object exists but doesn't contain the prefKey → fall back to legacy email_notifications boolean.
 * 4. If notification_preferences is null/undefined → fall back to legacy email_notifications boolean.
 *
 * @param profile - Object with optional notification_preferences and email_notifications
 * @param bellEvent - The bell event identifier (e.g. "task_review", "peer_message")
 * @returns true if the bell notification should be created
 */
export function shouldCreateBell(
  profile: {
    notification_preferences?: Record<string, boolean> | null;
    email_notifications?: boolean;
  },
  bellEvent: string,
): boolean {
  const prefKey = BELL_EVENT_TO_PREF_KEY[bellEvent];

  // Event not in mapping → fail-open (always create)
  if (!prefKey) return true;

  const prefs = profile.notification_preferences;

  // If granular preferences exist and contain the key, use them
  if (prefs && typeof prefs === "object" && prefKey in prefs) {
    return !!prefs[prefKey];
  }

  // Backward compat: fall back to legacy email_notifications boolean
  return profile.email_notifications !== false;
}
