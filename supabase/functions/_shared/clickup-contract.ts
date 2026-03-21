export interface ClickUpCustomFieldOption {
  id: string;
  name?: string;
  orderindex?: number | string;
}

export interface ClickUpCustomFieldLike {
  id: string;
  name?: string;
  type?: string;
  value?: unknown;
  type_config?: {
    options?: ClickUpCustomFieldOption[];
  };
}

export interface VisibilityResult {
  found: boolean;
  visible: boolean;
}

export const TEST_FOLDER_CONTRACT = {
  approvedFolderUrl: "https://app.clickup.com/90152151415/v/f/901513727289/90159069069",
  visibilityFieldName: "Visible in client portal",
  publicCommentPrefix: "@client:",
  publicThreadRule: "One public top-level thread per task during hardening.",
} as const;

export function isVisibleValue(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

export function getVisibilityFromFields(
  customFields: ClickUpCustomFieldLike[] | undefined,
  visibleFieldId: string,
): VisibilityResult {
  if (!customFields || !Array.isArray(customFields) || !visibleFieldId) {
    return { found: false, visible: false };
  }

  const field = customFields.find((candidate) => candidate.id === visibleFieldId);
  if (!field || field.value === undefined || field.value === null) {
    return { found: false, visible: false };
  }

  return {
    found: true,
    visible: isVisibleValue(field.value),
  };
}

export function isTaskVisible(
  customFields: ClickUpCustomFieldLike[] | undefined,
  visibleFieldId: string,
): boolean {
  return getVisibilityFromFields(customFields, visibleFieldId).visible;
}

export function getPhaseOptionId(
  customFields: ClickUpCustomFieldLike[] | undefined,
  phaseFieldId: string,
): string | null {
  if (!customFields || !phaseFieldId) return null;

  const field = customFields.find((candidate) => candidate.id === phaseFieldId);
  if (!field || field.value === undefined || field.value === null) return null;

  if (field.type_config?.options && typeof field.value === "number") {
    const option = field.type_config.options.find((candidate) => {
      const orderIndex = typeof candidate.orderindex === "string"
        ? Number(candidate.orderindex)
        : candidate.orderindex;
      return orderIndex === field.value;
    });
    return option?.id || null;
  }

  if (typeof field.value === "string") return field.value;
  return null;
}

export function resolveChapterConfigId(
  phaseOptionId: string | null | undefined,
  chapterMap: Map<string, string>,
): string | null {
  if (!phaseOptionId) return null;
  return chapterMap.get(phaseOptionId) || null;
}

export function buildChapterConfigMap(
  chapterRows: Array<{ id: string; clickup_cf_option_id: string | null }> | undefined,
): Map<string, string> {
  const chapterMap = new Map<string, string>();

  for (const row of chapterRows || []) {
    if (row.clickup_cf_option_id) {
      chapterMap.set(row.clickup_cf_option_id, row.id);
    }
  }

  return chapterMap;
}

export function resolveTaskChapterConfigId(
  customFields: ClickUpCustomFieldLike[] | undefined,
  phaseFieldId: string,
  chapterMap: Map<string, string>,
): string | null {
  return resolveChapterConfigId(getPhaseOptionId(customFields, phaseFieldId), chapterMap);
}

export const PORTAL_COMMENT_REGEX = /^(?:\*\*)?(.+?)(?:\*\*)? \(via Client Portal\):/;
export const PUBLIC_COMMENT_PREFIX_REGEX = /^@client:\s*/i;

export function isPortalOriginatedComment(commentText: string): boolean {
  return PORTAL_COMMENT_REGEX.test(commentText);
}

export function isExplicitPublicTopLevelComment(commentText: string): boolean {
  return PUBLIC_COMMENT_PREFIX_REGEX.test(commentText);
}

export function getClientFacingDisplayText(commentText: string): string {
  return isExplicitPublicTopLevelComment(commentText)
    ? commentText.replace(PUBLIC_COMMENT_PREFIX_REGEX, "").trim()
    : commentText;
}

export interface ClickUpCommentLike {
  id: string;
  comment_text?: string;
  comment?: {
    text_content?: string;
  };
  date?: string;
}

export function getCommentText(comment: ClickUpCommentLike): string {
  return typeof comment.comment_text === "string"
    ? comment.comment_text
    : typeof comment.comment?.text_content === "string"
      ? comment.comment.text_content
      : "";
}

export function isPublicCommentThreadRoot(commentText: string): boolean {
  return isPortalOriginatedComment(commentText) || isExplicitPublicTopLevelComment(commentText);
}

export function resolvePublicThreadRootId(comments: ClickUpCommentLike[]): {
  rootId: string | null;
  reason: "none" | "single" | "ambiguous";
} {
  const publicRoots = comments
    .filter((comment) => isPublicCommentThreadRoot(getCommentText(comment)))
    .sort((left, right) => Number(right.date || 0) - Number(left.date || 0));

  if (publicRoots.length === 0) {
    return { rootId: null, reason: "none" };
  }

  if (publicRoots.length === 1) {
    return { rootId: publicRoots[0].id, reason: "single" };
  }

  return { rootId: null, reason: "ambiguous" };
}

const STATUS_ALIASES: Record<string, string[]> = {
  approve: ["approved", "Approved", "APPROVED"],
  request_changes: ["rework", "Rework", "REWORK", "changes requested", "Changes Requested"],
  put_on_hold: ["on hold", "On Hold", "ON HOLD"],
  resume: ["to do", "To Do", "TO DO"],
  cancel: ["canceled", "Canceled", "CANCELED", "cancelled", "Cancelled", "CANCELLED"],
};

export function getStatusAliases(action: string): string[] {
  return STATUS_ALIASES[action] || [];
}

export function resolveStatusForAction(
  action: string,
  availableStatuses: Array<{ status: string }>,
): { status: string } | null {
  const aliases = getStatusAliases(action);
  if (aliases.length === 0) return null;

  return availableStatuses.find((candidate) =>
    aliases.some((alias) => candidate.status.toLowerCase() === alias.toLowerCase())
  ) || null;
}
