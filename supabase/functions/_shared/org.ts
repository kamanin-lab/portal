// Shared org resolution helpers for Phase 10 Edge Functions.
// All functions require a service role client — org_members and organizations
// have NO client-facing RLS read policies (Phase 9 deferred). Using an anon
// client will silently return empty rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "./logger.ts";

export interface OrgConfig {
  organization_id: string;
  clickup_list_ids: string[];
  nextcloud_client_root: string | null;
  support_task_id: string | null;
  clickup_chat_channel_id: string | null;
}

/**
 * Resolves org configuration for a given user via org_members JOIN organizations.
 * Uses service role client to bypass RLS.
 * Returns null if user has no org_members row — caller must fall back to profiles.
 */
export async function getOrgForUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<OrgConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("org_members")
    .select(`
      organization_id,
      organizations!inner (
        clickup_list_ids,
        nextcloud_client_root,
        support_task_id,
        clickup_chat_channel_id
      )
    `)
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const org = (data as { organizations: {
    clickup_list_ids: unknown;
    nextcloud_client_root: string | null;
    support_task_id: string | null;
    clickup_chat_channel_id: string | null;
  } }).organizations;

  // clickup_list_ids is jsonb in organizations — coerce to string[]
  const listIds: string[] = Array.isArray(org.clickup_list_ids)
    ? (org.clickup_list_ids as string[])
    : [];

  return {
    organization_id: (data as { organization_id: string }).organization_id,
    clickup_list_ids: listIds,
    nextcloud_client_root: org.nextcloud_client_root ?? null,
    support_task_id: org.support_task_id ?? null,
    clickup_chat_channel_id: org.clickup_chat_channel_id ?? null,
  };
}

/**
 * Returns all profile_ids in the given org.
 * Used by clickup-webhook for fan-out.
 */
export async function getOrgMemberIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("profile_id")
    .eq("organization_id", organizationId);

  return (data ?? []).map((row: { profile_id: string }) => row.profile_id);
}

/**
 * Returns org role for the given user, or null if no org_members row.
 * Legacy users (no row) → null → callers treat as 'member' (permissive).
 */
export async function getUserOrgRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("role")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  return (data as { role: string } | null)?.role ?? null;
}

/**
 * Finds the org whose clickup_list_ids jsonb array contains listId.
 * Returns null if no match OR if >1 orgs match (ambiguous).
 * Used by clickup-webhook findProfilesForTask.
 */
export async function findOrgByListId(
  supabaseAdmin: ReturnType<typeof createClient>,
  listId: string,
): Promise<{ organizationId: string; profileIds: string[] } | null> {
  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .contains("clickup_list_ids", [listId]);

  if (!orgs || orgs.length === 0) return null;
  if (orgs.length > 1) return null;

  const organizationId = (orgs[0] as { id: string }).id;
  const profileIds = await getOrgMemberIds(supabaseAdmin, organizationId);
  return { organizationId, profileIds };
}

/**
 * Finds the org that owns the given support_task_id.
 * Used by clickup-webhook support chat fan-out.
 */
export async function findOrgBySupportTaskId(
  supabaseAdmin: ReturnType<typeof createClient>,
  taskId: string,
): Promise<{ organizationId: string; profileIds: string[] } | null> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("support_task_id", taskId)
    .maybeSingle();

  if (!data) return null;

  const organizationId = (data as { id: string }).id;
  const profileIds = await getOrgMemberIds(supabaseAdmin, organizationId);
  return { organizationId, profileIds };
}

/**
 * Returns the subset of profileIds whose org_members.role is 'admin' or 'member'.
 * Profiles with no org_members row (legacy users) are treated as non-viewer and included.
 * On query failure: returns original profileIds (permissive fallback).
 */
export async function getNonViewerProfileIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  profileIds: string[],
): Promise<string[]> {
  if (profileIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("org_members")
    .select("profile_id, role")
    .in("profile_id", profileIds);

  if (error || !data) {
    console.warn("[getNonViewerProfileIds] role lookup failed, sending to all", { error });
    return profileIds;
  }

  // Build a map: profileId → role. Profiles not in org_members get no entry.
  const roleMap = new Map<string, string>(
    (data as { profile_id: string; role: string }[]).map(row => [row.profile_id, row.role]),
  );

  // Include: explicit admin/member, OR legacy (no org_members row → not in map)
  return profileIds.filter(id => {
    const role = roleMap.get(id);
    return role === undefined || role === "admin" || role === "member";
  });
}

export interface OrgTaskContext {
  orgId: string | null;
  surface: "ticket" | "project_task" | null;
  memberProfileIds: string[];
  projectConfigId: string | null;
}

/**
 * Resolves org context for a given ClickUp task ID.
 * Checks task_cache first (ticket surface), then project_task_cache (project surface).
 * Returns empty/null values on any failure (graceful degradation).
 */
export async function getOrgContextForTask(
  supabaseAdmin: ReturnType<typeof createClient>,
  taskId: string,
  log: ReturnType<typeof createLogger>,
): Promise<OrgTaskContext> {
  const empty: OrgTaskContext = { orgId: null, surface: null, memberProfileIds: [], projectConfigId: null };

  try {
    // 1. Check task_cache (ticket surface)
    const { data: taskCacheRow } = await supabaseAdmin
      .from("task_cache")
      .select("list_id")
      .eq("clickup_id", taskId)
      .limit(1)
      .maybeSingle();

    if (taskCacheRow?.list_id) {
      const orgResult = await findOrgByListId(supabaseAdmin, taskCacheRow.list_id);
      if (orgResult && orgResult.profileIds.length > 0) {
        log.info("Org context resolved via task_cache", { taskId, orgId: orgResult.organizationId });
        return {
          orgId: orgResult.organizationId,
          surface: "ticket",
          memberProfileIds: orgResult.profileIds,
          projectConfigId: null,
        };
      }
    }

    // 2. Check project_task_cache (project surface)
    const { data: projectTaskRow } = await supabaseAdmin
      .from("project_task_cache")
      .select("project_config_id")
      .eq("clickup_id", taskId)
      .limit(1)
      .maybeSingle();

    if (projectTaskRow?.project_config_id) {
      // Get org from project_config → organization_id
      const { data: projectConfig } = await supabaseAdmin
        .from("project_config")
        .select("organization_id, clickup_list_id")
        .eq("id", projectTaskRow.project_config_id)
        .limit(1)
        .maybeSingle();

      if (projectConfig) {
        let orgId: string | null = projectConfig.organization_id ?? null;
        let memberIds: string[] = [];

        if (orgId) {
          memberIds = await getOrgMemberIds(supabaseAdmin, orgId);
        } else if (projectConfig.clickup_list_id) {
          // Fallback: resolve org via list_id on project_config
          const orgResult = await findOrgByListId(supabaseAdmin, projectConfig.clickup_list_id);
          if (orgResult) {
            orgId = orgResult.organizationId;
            memberIds = orgResult.profileIds;
          }
        }

        if (orgId && memberIds.length > 0) {
          log.info("Org context resolved via project_task_cache", { taskId, orgId });
          return {
            orgId,
            surface: "project_task",
            memberProfileIds: memberIds,
            projectConfigId: projectTaskRow.project_config_id,
          };
        }
      }
    }

    log.debug("No org context found for task", { taskId });
    return empty;
  } catch (error) {
    log.error("Error resolving org context for task", { error: String(error) });
    return empty;
  }
}

export interface OrgUserTaskContext {
  orgId: string | null;
  surface: "ticket" | "project_task" | null;
  memberProfileIds: string[];
  projectConfigId: string | null;
  taskBelongsToOrg: boolean;
}

/**
 * Resolves org context from the *caller* (userId → org_members) and validates
 * that the target task actually belongs to that org. This is the primary
 * fan-out resolver for post-task-comment: it works even when the task is not
 * yet in cache (brand-new tasks), and prevents cross-org fan-out when a task
 * belongs to a different organization.
 *
 * Resolution order:
 * 1. Resolve org from userId via org_members. No row → legacy user, return all-null.
 * 2. Get all member profile IDs for that org.
 * 3. Determine surface: task_cache (ticket) or project_task_cache (project_task).
 *    If neither → surface=null, taskBelongsToOrg=false.
 * 4. Validate task actually belongs to the caller's org:
 *    - Ticket: task's list_id must be in organizations.clickup_list_ids.
 *    - Project task: project_config.organization_id must match.
 * 5. Return all fields.
 */
export async function getOrgContextForUserAndTask(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  taskId: string,
  log: ReturnType<typeof createLogger>,
): Promise<OrgUserTaskContext> {
  const empty: OrgUserTaskContext = {
    orgId: null,
    surface: null,
    memberProfileIds: [],
    projectConfigId: null,
    taskBelongsToOrg: false,
  };

  try {
    // 1. Resolve org from the caller (always reliable — authenticated user has an org_members row)
    const { data: memberRow } = await supabaseAdmin
      .from("org_members")
      .select("organization_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle();

    if (!memberRow?.organization_id) {
      // Legacy user without org_members row — skip fan-out silently
      log.debug("No org_members row for user, skipping fan-out", { userId });
      return empty;
    }

    const orgId = memberRow.organization_id as string;

    // 2. Get all member profile IDs for this org
    const memberProfileIds = await getOrgMemberIds(supabaseAdmin, orgId);

    // 3. Determine surface by looking up the task in caches
    // Check task_cache first (ticket surface)
    const { data: taskCacheRow } = await supabaseAdmin
      .from("task_cache")
      .select("list_id")
      .eq("clickup_id", taskId)
      .limit(1)
      .maybeSingle();

    if (taskCacheRow) {
      // Task found in task_cache → ticket surface
      // 4a. Validate: task's list_id must be in org's clickup_list_ids
      let taskBelongsToOrg = false;
      if (taskCacheRow.list_id) {
        const { data: orgRow } = await supabaseAdmin
          .from("organizations")
          .select("clickup_list_ids")
          .eq("id", orgId)
          .limit(1)
          .maybeSingle();

        if (orgRow) {
          const listIds: string[] = Array.isArray(orgRow.clickup_list_ids)
            ? (orgRow.clickup_list_ids as string[])
            : [];
          taskBelongsToOrg = listIds.includes(taskCacheRow.list_id);
        }
      }

      if (!taskBelongsToOrg) {
        log.warn("Task does not belong to caller's org (ticket)", { taskId, orgId });
      }

      return {
        orgId,
        surface: "ticket",
        memberProfileIds,
        projectConfigId: null,
        taskBelongsToOrg,
      };
    }

    // Check project_task_cache (project surface)
    const { data: projectTaskRow } = await supabaseAdmin
      .from("project_task_cache")
      .select("project_config_id")
      .eq("clickup_id", taskId)
      .limit(1)
      .maybeSingle();

    if (projectTaskRow?.project_config_id) {
      // 4b. Validate: project_config.organization_id must match caller's org
      let taskBelongsToOrg = false;
      const { data: projectConfig } = await supabaseAdmin
        .from("project_config")
        .select("organization_id")
        .eq("id", projectTaskRow.project_config_id)
        .limit(1)
        .maybeSingle();

      if (projectConfig) {
        taskBelongsToOrg = projectConfig.organization_id === orgId;
      }

      if (!taskBelongsToOrg) {
        log.warn("Task does not belong to caller's org (project)", { taskId, orgId });
      }

      return {
        orgId,
        surface: "project_task",
        memberProfileIds,
        projectConfigId: projectTaskRow.project_config_id,
        taskBelongsToOrg,
      };
    }

    // Task not found in either cache — could be brand-new or misconfigured
    log.warn("Task not found in any cache, cannot validate org ownership", { taskId, orgId });
    return {
      orgId,
      surface: null,
      memberProfileIds,
      projectConfigId: null,
      taskBelongsToOrg: false,
    };
  } catch (error) {
    log.error("Error resolving org context for user+task", { error: String(error) });
    return empty;
  }
}
