// ============ DEPLOYMENT VERSION ============
// Version: 2026-04-14-v2-unread-digest
// Feature: Digest email reminders for pending approval tasks (every 5 days)
// Feature: Daily unread message digest — reminds clients with unread task chat messages (24h cooldown)
// =============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEmailCopy, type EmailLocale } from "../_shared/emailCopy.ts";

interface ReminderTaskItem {
  taskId: string;
  taskName: string;
  status: string;
  daysPending: number;
}

interface PendingTaskRow {
  profile_id: string;
  email: string;
  full_name: string | null;
  notification_preferences: Record<string, boolean> | null;
  email_notifications: boolean;
  last_reminder_sent_at: string | null;
  clickup_id: string;
  task_name: string;
  status: string;
  last_activity_at: string | null;
}

// Status label mapping (ClickUp raw status -> German label)
const STATUS_LABELS: Record<string, string> = {
  "client review": "Ihre R\u00fcckmeldung",
  "awaiting approval": "Kostenfreigabe",
};

// Email HTML template (reuses same CSS as send-mailjet-email)
const styles = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px 0; background-color: #f5f5f5; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 0 20px; }
    .logo-section { text-align: left; padding: 20px 0; }
    .logo-section img { height: 50px; width: auto; max-height: 50px; max-width: 50px; }
    .card { background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 40px; text-align: center; }
    .title { color: #1a1a1a; font-size: 22px; font-weight: 600; margin: 0 0 24px 0; }
    .text { color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; }
    .task-list { background-color: #f9f9f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; text-align: left; }
    .task-item { padding: 8px 0; border-bottom: 1px solid #e5e5e5; }
    .task-item:last-child { border-bottom: none; }
    .task-name { color: #1a1a1a; font-weight: 500; }
    .reply-count { color: #666; font-size: 14px; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; font-size: 15px; margin: 24px 0 8px 0; }
    .footer { text-align: center; padding: 24px 0; }
    .footer-text { color: #999; font-size: 12px; margin: 0; }
    .muted { font-size: 13px; color: #888; margin: 8px 0 0 0; }
  </style>
`;

const logoUrl = "https://portal.kamanin.at/favicon.png";
const portalUrl = "https://portal.kamanin.at";

function buildReminderHtml(
  tasks: ReminderTaskItem[],
  firstName: string | null,
  locale: EmailLocale = "de",
  emailType: "pending_reminder" | "project_reminder" | "recommendation_reminder" = "pending_reminder",
  ctaUrl: string = `${portalUrl}/tickets`
): { subject: string; html: string } {
  const copy = getEmailCopy(emailType, locale);
  const greeting = typeof copy.greeting === "function"
    ? copy.greeting(firstName || undefined)
    : copy.greeting;
  const subject = typeof copy.subject === "function"
    ? copy.subject(tasks.length)
    : copy.subject;

  const taskListHtml = tasks
    .map(
      (t) => `<div class="task-item">
        <span class="task-name">${t.taskName}</span>
        <span class="reply-count"> &mdash; ${t.status} (seit ${t.daysPending} ${t.daysPending === 1 ? "Tag" : "Tagen"})</span>
      </div>`
    )
    .join("");

  const notesHtml = copy.notes
    ?.map((n) => `<p class="muted">${n}</p>`)
    .join("") || "";

  const html = `<!DOCTYPE html><html><head>${styles}</head><body>
    <div class="wrapper">
      <div class="logo-section">
        <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height: 50px; width: 50px; max-height: 50px; max-width: 50px; display: block;" />
      </div>
      <div class="card">
        <h1 class="title">${copy.title}</h1>
        <p class="text">${greeting}</p>
        <p class="text">${copy.body as string}</p>
        <div class="task-list">${taskListHtml}</div>
        <a href="${ctaUrl}" class="button">${copy.cta}</a>
        ${notesHtml}
      </div>
      <div class="footer">
        <p class="footer-text">KAMANIN Client Portal</p>
      </div>
    </div></body></html>`;

  return { subject, html };
}

interface UnreadTaskItem {
  taskId: string;
  taskName: string;
  unreadCount: number;
  isSupport: boolean;
}

function buildUnreadDigestHtml(
  items: UnreadTaskItem[],
  firstName: string | null,
  locale: EmailLocale = "de"
): { subject: string; html: string } {
  const copy = getEmailCopy("unread_digest", locale);
  const greeting = typeof copy.greeting === "function"
    ? copy.greeting(firstName || undefined)
    : copy.greeting;
  const totalCount = items.reduce((sum, i) => sum + i.unreadCount, 0);
  const subject = typeof copy.subject === "function"
    ? copy.subject(totalCount)
    : copy.subject;

  const taskListHtml = items
    .map((item) => {
      const countLabel = item.unreadCount === 1
        ? "1 neue Nachricht"
        : `${item.unreadCount} neue Nachrichten`;
      return `<div class="task-item">
        <span class="task-name">${item.taskName}</span>
        <span class="reply-count"> &mdash; ${countLabel}</span>
      </div>`;
    })
    .join("");

  const notesHtml = copy.notes
    ?.map((n) => `<p class="muted">${n}</p>`)
    .join("") ?? "";

  const html = `<!DOCTYPE html><html><head>${styles}</head><body>
    <div class="wrapper">
      <div class="logo-section">
        <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height: 50px; width: 50px; max-height: 50px; max-width: 50px; display: block;" />
      </div>
      <div class="card">
        <h1 class="title">${copy.title}</h1>
        <p class="text">${greeting}</p>
        <p class="text">${copy.body as string}</p>
        <div class="task-list">${taskListHtml}</div>
        <a href="${portalUrl}/tickets" class="button">${copy.cta}</a>
        ${notesHtml}
      </div>
      <div class="footer">
        <p class="footer-text">KAMANIN Client Portal</p>
      </div>
    </div></body></html>`;

  return { subject, html };
}

async function sendUnreadMessageReminders(
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>
): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;

  // 1. Fetch all profiles with email enabled
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name, email_notifications, notification_preferences, last_unread_digest_sent_at, support_task_id")
    .eq("email_notifications", true);

  if (profilesError || !profiles?.length) {
    log.warn("Unread digest: no eligible profiles", { error: String(profilesError) });
    return { sent, skipped, errors };
  }

  // 2. Bulk fetch team comments from last 60 days
  const since60Days = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: teamComments } = await supabase
    .from("comment_cache")
    .select("profile_id, task_id, clickup_created_at")
    .eq("is_from_portal", false)
    .gt("clickup_created_at", since60Days)
    .in("profile_id", profiles.map((p: Record<string, unknown>) => p.id));

  if (!teamComments?.length) {
    log.info("Unread digest: no team comments in last 60 days");
    return { sent, skipped: profiles.length, errors };
  }

  // 3. Bulk fetch read receipts for all eligible profiles
  const { data: readReceipts } = await supabase
    .from("read_receipts")
    .select("profile_id, context_type, last_read_at")
    .in("profile_id", profiles.map((p: Record<string, unknown>) => p.id));

  // Build receipt lookup: `${profile_id}:${context_type}` -> last_read_at
  const receiptMap = new Map<string, string>();
  for (const r of (readReceipts ?? []) as Record<string, string>[]) {
    receiptMap.set(`${r.profile_id}:${r.context_type}`, r.last_read_at);
  }

  // 4. Compute unread counts per (profile_id, task_id)
  const profileUnread = new Map<string, Map<string, number>>();
  for (const comment of teamComments as Record<string, string>[]) {
    const profile = (profiles as Record<string, unknown>[]).find((p) => p.id === comment.profile_id);
    if (!profile) continue;

    const isSupport = profile.support_task_id === comment.task_id;
    const contextType = isSupport ? "support" : `task:${comment.task_id}`;
    const lastRead = receiptMap.get(`${comment.profile_id}:${contextType}`);
    const isUnread = !lastRead || new Date(comment.clickup_created_at) > new Date(lastRead);

    if (isUnread) {
      if (!profileUnread.has(comment.profile_id)) {
        profileUnread.set(comment.profile_id, new Map());
      }
      const taskMap = profileUnread.get(comment.profile_id)!;
      taskMap.set(comment.task_id, (taskMap.get(comment.task_id) ?? 0) + 1);
    }
  }

  if (!profileUnread.size) {
    log.info("Unread digest: all messages are read");
    return { sent, skipped: profiles.length, errors };
  }

  // 5. Collect all unread task IDs for bulk name lookup
  const allUnreadTaskIds = new Set<string>();
  for (const taskMap of profileUnread.values()) {
    for (const taskId of taskMap.keys()) {
      allUnreadTaskIds.add(taskId);
    }
  }

  const { data: taskRows } = await supabase
    .from("task_cache")
    .select("clickup_id, name")
    .in("clickup_id", [...allUnreadTaskIds]);

  const taskNameMap = new Map<string, string>();
  for (const t of (taskRows ?? []) as Record<string, string>[]) {
    taskNameMap.set(t.clickup_id, t.name);
  }

  // 6. For each profile with unread messages: check prefs + cooldown, then send
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (const profile of profiles as Record<string, unknown>[]) {
    const taskMap = profileUnread.get(profile.id as string);
    if (!taskMap?.size) { skipped++; continue; }

    // Preference checks
    const prefs = profile.notification_preferences as Record<string, boolean> | null;
    const remindersEnabled = prefs?.reminders !== false;
    const teamCommentEnabled = prefs?.team_comment !== false;
    const supportEnabled = prefs?.support_response !== false;

    if (!remindersEnabled || (!teamCommentEnabled && !supportEnabled)) {
      skipped++; continue;
    }

    // 24h cooldown check
    if (profile.last_unread_digest_sent_at) {
      const lastSent = new Date(profile.last_unread_digest_sent_at as string).getTime();
      if (Date.now() - lastSent < oneDayMs) { skipped++; continue; }
    }

    // Build per-pref-filtered task list
    const unreadItems: UnreadTaskItem[] = [];
    for (const [taskId, count] of taskMap) {
      const isSupport = profile.support_task_id === taskId;
      if (isSupport && !supportEnabled) continue;
      if (!isSupport && !teamCommentEnabled) continue;
      unreadItems.push({
        taskId,
        taskName: isSupport ? "Support-Chat" : (taskNameMap.get(taskId) ?? taskId),
        unreadCount: count,
        isSupport,
      });
    }

    if (!unreadItems.length) { skipped++; continue; }

    const firstName = (profile.full_name as string | null)?.split(" ")[0] ?? null;
    const { subject, html } = buildUnreadDigestHtml(unreadItems, firstName);

    const success = await sendMailjet(
      { email: profile.email as string, name: (profile.full_name as string) || undefined },
      subject,
      html,
      log
    );

    if (success) {
      // Atomic update with cooldown guard (prevents double-send on concurrent runs)
      const oneDayAgo = new Date(Date.now() - oneDayMs).toISOString();
      await supabase
        .from("profiles")
        .update({ last_unread_digest_sent_at: new Date().toISOString() })
        .eq("id", profile.id)
        .or(`last_unread_digest_sent_at.is.null,last_unread_digest_sent_at.lt.${oneDayAgo}`);
      sent++;
    } else {
      errors++;
    }
  }

  return { sent, skipped, errors };
}

async function sendRecommendationReminders(
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>
): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;

  // 1. Fetch profiles with email notifications enabled
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name, email_notifications, notification_preferences, last_recommendation_reminder_sent_at")
    .eq("email_notifications", true);

  if (profilesError || !profiles?.length) {
    log.warn("Recommendation reminder: no eligible profiles", { error: String(profilesError) });
    return { sent, skipped, errors };
  }

  // 2. Fetch candidate tasks: status=to do, is_visible=true, last_activity_at older than 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: candidateTasks } = await supabase
    .from("task_cache")
    .select("clickup_id, name, profile_id, last_activity_at, status, tags")
    .eq("status", "to do")
    .eq("is_visible", true)
    .lt("last_activity_at", threeDaysAgo)
    .in("profile_id", profiles.map((p: Record<string, unknown>) => p.id));

  // 3. JS-side tag filter: keep only tasks tagged "recommendation"
  const recommendations = (candidateTasks ?? []).filter((t: Record<string, unknown>) =>
    Array.isArray(t.tags) && (t.tags as { name: string }[]).some((tag) => tag.name === "recommendation")
  );

  if (!recommendations.length) {
    log.info("Recommendation reminder: no pending recommendations older than 3 days");
    return { sent, skipped: profiles.length, errors };
  }

  // 4. Group recommendations by profile_id
  const profileRecMap = new Map<string, ReminderTaskItem[]>();
  for (const task of recommendations as Record<string, unknown>[]) {
    const pid = task.profile_id as string;
    if (!profileRecMap.has(pid)) {
      profileRecMap.set(pid, []);
    }
    const lastActivity = task.last_activity_at as string | null;
    const daysPending = lastActivity
      ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
      : 0;
    profileRecMap.get(pid)!.push({
      taskId: task.clickup_id as string,
      taskName: task.name as string,
      status: "Offen",
      daysPending: Math.max(daysPending, 0),
    });
  }

  // 5. Per-profile loop with atomic claim (5-day cooldown)
  const portalUrlEnv = Deno.env.get("PORTAL_URL") ?? "https://portal.kamanin.at";
  const cooldownBoundary = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  for (const profile of profiles as Record<string, unknown>[]) {
    const tasksForProfile = profileRecMap.get(profile.id as string);
    if (!tasksForProfile?.length) { skipped++; continue; }

    // Skip if reminders preference is explicitly disabled
    const prefs = profile.notification_preferences as Record<string, boolean> | null;
    if (prefs?.reminders === false) { skipped++; continue; }

    // Atomic claim: only proceed if cooldown has expired (prevents double-send)
    const { data: claimed, error: claimError } = await supabase
      .from("profiles")
      .update({ last_recommendation_reminder_sent_at: new Date().toISOString() })
      .eq("id", profile.id)
      .or(`last_recommendation_reminder_sent_at.is.null,last_recommendation_reminder_sent_at.lt.${cooldownBoundary}`)
      .select("id");

    if (claimError) {
      log.error("Recommendation reminder: claim error", { error: String(claimError) });
      errors++;
      continue;
    }

    if (!claimed?.length) {
      // Cooldown not expired or another execution claimed first
      skipped++;
      continue;
    }

    try {
      const firstName = (profile.full_name as string | null)?.split(" ")[0] ?? null;
      const { subject, html } = buildReminderHtml(
        tasksForProfile,
        firstName,
        "de",
        "recommendation_reminder",
        `${portalUrlEnv}/meine-aufgaben`
      );

      await sendMailjet(
        { email: profile.email as string, name: (profile.full_name as string) || undefined },
        subject,
        html,
        log
      );
      sent++;
    } catch (err) {
      log.error("Recommendation reminder: send failed", { error: String(err) });
      errors++;
    }
  }

  return { sent, skipped, errors };
}

async function sendMailjet(
  to: { email: string; name?: string },
  subject: string,
  htmlContent: string,
  log: ReturnType<typeof createLogger>
): Promise<boolean> {
  const apiKey = Deno.env.get("MAILJET_API_KEY");
  const apiSecret = Deno.env.get("MAILJET_API_SECRET");

  if (!apiKey || !apiSecret) {
    log.error("Mailjet credentials not configured");
    return false;
  }

  const credentials = btoa(`${apiKey}:${apiSecret}`);

  try {
    const response = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: "notifications@kamanin.at", Name: "KAMANIN Portal" },
            To: [{ Email: to.email, Name: to.name || to.email }],
            Subject: subject,
            HTMLPart: htmlContent,
          },
        ],
      }),
    });

    const result = await response.json();
    if (response.ok && result.Messages?.[0]?.Status === "success") {
      log.info("Reminder email sent", { recipient: "[REDACTED]" });
      return true;
    }

    log.error("Mailjet send failed", { status: response.status });
    return false;
  } catch (error) {
    log.error("Mailjet request error", { error: String(error) });
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("send-reminders", requestId);

  // Auth: verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    log.warn("Unauthorized request");
    return new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Invalid or missing CRON_SECRET" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    log.info("Starting reminder job");

    // Query pending tasks with eligible profiles (5-day cooldown)
    const { data: rows, error: queryError } = await supabase.rpc("get_pending_reminder_tasks");

    // Fallback: if RPC doesn't exist yet, use direct query
    let pendingRows: PendingTaskRow[];
    if (queryError) {
      log.warn("RPC not found, using direct query", { error: String(queryError) });
      const { data, error } = await supabase
        .from("task_cache")
        .select(`
          clickup_id,
          name,
          status,
          last_activity_at,
          profile_id,
          profiles!inner (
            id,
            email,
            full_name,
            notification_preferences,
            email_notifications,
            last_reminder_sent_at
          )
        `)
        .in("status", ["client review", "awaiting approval"])
        .eq("is_visible", true);

      if (error) {
        log.error("Query failed", { error: String(error) });
        return new Response(
          JSON.stringify({ ok: false, code: "QUERY_ERROR", message: "Failed to query pending tasks", correlationId: requestId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Map joined result to flat rows
      pendingRows = (data || []).map((row: Record<string, unknown>) => {
        const profile = row.profiles as Record<string, unknown>;
        return {
          profile_id: profile.id as string,
          email: profile.email as string,
          full_name: profile.full_name as string | null,
          notification_preferences: profile.notification_preferences as Record<string, boolean> | null,
          email_notifications: profile.email_notifications as boolean,
          last_reminder_sent_at: profile.last_reminder_sent_at as string | null,
          clickup_id: row.clickup_id as string,
          task_name: row.name as string,
          status: row.status as string,
          last_activity_at: row.last_activity_at as string | null,
        };
      });
    } else {
      pendingRows = (rows || []) as PendingTaskRow[];
    }

    // Group by profile
    const profileMap = new Map<string, {
      email: string;
      fullName: string | null;
      prefs: Record<string, boolean> | null;
      emailEnabled: boolean;
      lastReminder: string | null;
      tasks: ReminderTaskItem[];
    }>();

    for (const row of pendingRows) {
      if (!profileMap.has(row.profile_id)) {
        profileMap.set(row.profile_id, {
          email: row.email,
          fullName: row.full_name,
          prefs: row.notification_preferences,
          emailEnabled: row.email_notifications,
          lastReminder: row.last_reminder_sent_at,
          tasks: [],
        });
      }

      const daysPending = row.last_activity_at
        ? Math.floor((Date.now() - new Date(row.last_activity_at).getTime()) / 86_400_000)
        : 0;

      profileMap.get(row.profile_id)!.tasks.push({
        taskId: row.clickup_id,
        taskName: row.task_name,
        status: STATUS_LABELS[row.status] || row.status,
        daysPending: Math.max(daysPending, 0),
      });
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const [profileId, profile] of profileMap) {
      // Check opt-out: reminders preference (default true) + global email toggle
      const remindersEnabled = profile.prefs?.reminders !== false;
      if (!remindersEnabled || !profile.emailEnabled) {
        skipped++;
        continue;
      }

      // Check 5-day cooldown
      if (profile.lastReminder) {
        const lastSent = new Date(profile.lastReminder).getTime();
        const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
        if (Date.now() - lastSent < fiveDaysMs) {
          skipped++;
          continue;
        }
      }

      // Extract first name for greeting
      const firstName = profile.fullName?.split(" ")[0] || null;
      const { subject, html } = buildReminderHtml(profile.tasks, firstName);

      const success = await sendMailjet(
        { email: profile.email, name: profile.fullName || undefined },
        subject,
        html,
        log
      );

      if (success) {
        // Update last_reminder_sent_at
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq("id", profileId);

        if (updateError) {
          log.warn("Failed to update last_reminder_sent_at", { profileId: "[REDACTED]" });
        }
        sent++;
      } else {
        errors++;
      }
    }

    log.info("Ticket reminder job complete", { sent, skipped, errors, totalProfiles: profileMap.size });

    // ===== PROJECT TASK REMINDERS (3-day cooldown) =====
    let projectSent = 0;
    let projectSkipped = 0;

    const { data: projectRows, error: projectQueryError } = await supabase
      .from("project_task_cache")
      .select(`
        clickup_id,
        name,
        status,
        last_activity_at,
        project_config_id
      `)
      .eq("status", "client review")
      .eq("is_visible", true)
      .lt("last_activity_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());

    if (projectQueryError) {
      log.warn("Project task query failed", { error: String(projectQueryError) });
    } else if (projectRows && projectRows.length > 0) {
      // Get unique project_config_ids
      const projectConfigIds = [...new Set(projectRows.map((r: Record<string, unknown>) => r.project_config_id as string).filter(Boolean))];

      // Get all profile_ids with access to these projects
      const { data: accessRows } = await supabase
        .from("project_access")
        .select("profile_id, project_config_id")
        .in("project_config_id", projectConfigIds);

      // Get profile details for these users
      const projectProfileIds = [...new Set((accessRows || []).map((r: Record<string, unknown>) => r.profile_id as string))];

      const { data: projectProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, email_notifications, notification_preferences, last_project_reminder_sent_at")
        .in("id", projectProfileIds);

      // Build project_config_id -> profile_ids map
      const projectToProfiles = new Map<string, string[]>();
      for (const row of (accessRows || []) as Record<string, unknown>[]) {
        const pcId = row.project_config_id as string;
        const pId = row.profile_id as string;
        if (!projectToProfiles.has(pcId)) {
          projectToProfiles.set(pcId, []);
        }
        projectToProfiles.get(pcId)!.push(pId);
      }

      // Build per-profile task list
      const projectProfileMap = new Map<string, {
        email: string;
        fullName: string | null;
        emailEnabled: boolean;
        prefs: Record<string, boolean> | null;
        lastReminder: string | null;
        tasks: ReminderTaskItem[];
      }>();

      for (const row of projectRows as Record<string, unknown>[]) {
        const profileIdsForProject = projectToProfiles.get(row.project_config_id as string) || [];
        for (const pid of profileIdsForProject) {
          if (!projectProfileMap.has(pid)) {
            const p = (projectProfiles || []).find((pp: Record<string, unknown>) => pp.id === pid) as Record<string, unknown> | undefined;
            if (!p) continue;
            projectProfileMap.set(pid, {
              email: p.email as string,
              fullName: p.full_name as string | null,
              emailEnabled: p.email_notifications as boolean,
              prefs: p.notification_preferences as Record<string, boolean> | null,
              lastReminder: p.last_project_reminder_sent_at as string | null,
              tasks: [],
            });
          }
          const lastActivity = row.last_activity_at as string | null;
          const daysPending = lastActivity
            ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
            : 0;
          projectProfileMap.get(pid)!.tasks.push({
            taskId: row.clickup_id as string,
            taskName: row.name as string,
            status: "Ihre Rückmeldung",
            daysPending: Math.max(daysPending, 0),
          });
        }
      }

      for (const [profileId, profile] of projectProfileMap) {
        const remindersEnabled = profile.prefs?.reminders !== false;
        if (!remindersEnabled || !profile.emailEnabled) { projectSkipped++; continue; }

        // Attempt atomic claim: only update if cooldown has expired
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: claimed } = await supabase
          .from("profiles")
          .update({ last_project_reminder_sent_at: new Date().toISOString() })
          .eq("id", profileId)
          .or(`last_project_reminder_sent_at.is.null,last_project_reminder_sent_at.lt.${threeDaysAgo}`)
          .select("id");

        if (!claimed || claimed.length === 0) {
          // Another execution claimed this profile first, or cooldown not expired
          projectSkipped++;
          continue;
        }

        const firstName = profile.fullName?.split(" ")[0] || null;
        const { subject, html } = buildReminderHtml(
          profile.tasks,
          firstName,
          "de",
          "project_reminder",
          `${portalUrl}/projekte`
        );

        const success = await sendMailjet(
          { email: profile.email, name: profile.fullName || undefined },
          subject,
          html,
          log
        );

        if (success) {
          projectSent++;
        } else {
          // Email failed but claim was already set — log warning
          log.warn("Project reminder email failed after atomic claim", { profileId: "[REDACTED]" });
        }
      }

      log.info("Project reminder job complete", { projectSent, projectSkipped });
    }

    // ===== UNREAD MESSAGE DIGEST (24h cooldown) =====
    const unreadStats = await sendUnreadMessageReminders(supabase, log);
    log.info("Unread digest job complete", unreadStats);

    // ===== RECOMMENDATION REMINDERS (5-day cooldown) =====
    const recStats = await sendRecommendationReminders(supabase, log);
    log.info("recommendation_reminder stats", recStats);

    return new Response(
      JSON.stringify({
        ok: true,
        code: "REMINDERS_SENT",
        message: `Tickets - Sent: ${sent}, Skipped: ${skipped}, Errors: ${errors}. Projects - Sent: ${projectSent}, Skipped: ${projectSkipped}. Unread digest - Sent: ${unreadStats.sent}, Skipped: ${unreadStats.skipped}, Errors: ${unreadStats.errors}. Recommendations - Sent: ${recStats.sent}, Skipped: ${recStats.skipped}, Errors: ${recStats.errors}`,
        correlationId: requestId,
        sent, skipped, errors,
        projectSent, projectSkipped,
        unreadSent: unreadStats.sent,
        unreadSkipped: unreadStats.skipped,
        unreadErrors: unreadStats.errors,
        recSent: recStats.sent,
        recSkipped: recStats.skipped,
        recErrors: recStats.errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Unexpected error", { error: String(error) });
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", message: "Unexpected error", correlationId: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
