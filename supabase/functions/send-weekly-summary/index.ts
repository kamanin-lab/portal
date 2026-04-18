// ============ DEPLOYMENT VERSION ============
// Version: 2026-04-18-v1-weekly-summary-mvp
// Feature: Weekly summary email — Monday 09:00 CET, 6-day cooldown, org-admin only
// Phase 1 MVP — 4 content blocks: completed this week, waiting for client,
// open recommendations, unread message count. Skips send when all blocks empty.
// =============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEmailCopy, type EmailLocale } from "../_shared/emailCopy.ts";

interface SummaryTaskItem {
  taskId: string;
  taskName: string;
  daysPending?: number;
}

interface WeeklySummaryData {
  completed: SummaryTaskItem[];
  waitingForClient: SummaryTaskItem[];
  openRecommendations: SummaryTaskItem[];
  unreadCount: number;
}

const logoUrl = "https://portal.kamanin.at/favicon.png";
const portalUrl = Deno.env.get("PORTAL_URL") ?? "https://portal.kamanin.at";

const styles = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px 0; background-color: #f5f5f5; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 0 20px; }
    .logo-section { text-align: left; padding: 20px 0; }
    .logo-section img { height: 50px; width: auto; max-height: 50px; max-width: 50px; }
    .card { background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 40px; text-align: left; }
    .title { color: #1a1a1a; font-size: 22px; font-weight: 600; margin: 0 0 16px 0; text-align: center; }
    .text { color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; }
    .section { margin: 24px 0 8px 0; }
    .section-title { color: #1a1a1a; font-size: 15px; font-weight: 600; margin: 0 0 12px 0; }
    .task-list { background-color: #f9f9f9; border-radius: 8px; padding: 16px 20px; margin: 0 0 8px 0; }
    .task-item { padding: 8px 0; border-bottom: 1px solid #e5e5e5; }
    .task-item:last-child { border-bottom: none; }
    .task-name { color: #1a1a1a; font-weight: 500; }
    .meta { color: #666; font-size: 14px; }
    .cta-wrapper { text-align: center; margin: 24px 0 8px 0; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; font-size: 15px; }
    .footer { text-align: center; padding: 24px 0; }
    .footer-text { color: #999; font-size: 12px; margin: 0; }
    .muted { font-size: 13px; color: #888; margin: 8px 0 0 0; }
  </style>
`;

function getISOWeek(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function renderTaskList(items: SummaryTaskItem[], showDays: boolean): string {
  return items
    .map((t) => {
      const metaHtml = showDays && typeof t.daysPending === "number"
        ? `<span class="meta"> &mdash; seit ${t.daysPending} ${t.daysPending === 1 ? "Tag" : "Tagen"}</span>`
        : "";
      return `<div class="task-item"><span class="task-name">${t.taskName}</span>${metaHtml}</div>`;
    })
    .join("");
}

function buildWeeklySummaryHtml(
  data: WeeklySummaryData,
  firstName: string | null,
  locale: EmailLocale = "de",
): { subject: string; html: string } {
  const copy = getEmailCopy("weekly_summary", locale);
  const isoWeek = getISOWeek();
  const greeting = typeof copy.greeting === "function"
    ? copy.greeting(firstName || undefined)
    : copy.greeting;
  const subject = typeof copy.subject === "function"
    ? copy.subject(isoWeek)
    : copy.subject;

  const sections: string[] = [];

  if (data.completed.length > 0) {
    sections.push(`
      <div class="section">
        <h2 class="section-title">✓ Abgeschlossen diese Woche (${data.completed.length})</h2>
        <div class="task-list">${renderTaskList(data.completed, false)}</div>
      </div>
    `);
  }

  if (data.waitingForClient.length > 0) {
    sections.push(`
      <div class="section">
        <h2 class="section-title">⏳ Warten auf Ihre Freigabe (${data.waitingForClient.length})</h2>
        <div class="task-list">${renderTaskList(data.waitingForClient, true)}</div>
      </div>
    `);
  }

  if (data.openRecommendations.length > 0) {
    sections.push(`
      <div class="section">
        <h2 class="section-title">💡 Offene Empfehlungen (${data.openRecommendations.length})</h2>
        <div class="task-list">${renderTaskList(data.openRecommendations, true)}</div>
      </div>
    `);
  }

  if (data.unreadCount > 0) {
    const label = data.unreadCount === 1
      ? "Sie haben <strong>1 ungelesene Nachricht</strong>."
      : `Sie haben <strong>${data.unreadCount} ungelesene Nachrichten</strong>.`;
    sections.push(`
      <div class="section">
        <h2 class="section-title">✉️ Ungelesene Nachrichten</h2>
        <p class="text" style="margin: 0;">${label}</p>
      </div>
    `);
  }

  const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") ?? "";

  const html = `<!DOCTYPE html><html><head>${styles}</head><body>
    <div class="wrapper">
      <div class="logo-section">
        <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height: 50px; width: 50px; max-height: 50px; max-width: 50px; display: block;" />
      </div>
      <div class="card">
        <h1 class="title">${copy.title}</h1>
        <p class="text">${greeting}</p>
        <p class="text">${copy.body as string}</p>
        ${sections.join("")}
        <div class="cta-wrapper">
          <a href="${portalUrl}" class="button">${copy.cta}</a>
        </div>
        ${notesHtml}
      </div>
      <div class="footer">
        <p class="footer-text">KAMANIN Client Portal</p>
      </div>
    </div></body></html>`;

  return { subject, html };
}

async function sendMailjet(
  to: { email: string; name?: string },
  subject: string,
  htmlContent: string,
  log: ReturnType<typeof createLogger>,
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
        Messages: [{
          From: { Email: "notifications@kamanin.at", Name: "KAMANIN Portal" },
          To: [{ Email: to.email, Name: to.name || to.email }],
          Subject: subject,
          HTMLPart: htmlContent,
        }],
      }),
    });

    const result = await response.json();
    if (response.ok && result.Messages?.[0]?.Status === "success") {
      log.info("Weekly summary email sent", { recipient: "[REDACTED]" });
      return true;
    }

    log.error("Mailjet send failed", { status: response.status });
    return false;
  } catch (error) {
    log.error("Mailjet request error", { error: String(error) });
    return false;
  }
}

async function collectSummaryForAdmin(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  listIds: string[],
  supportTaskId: string | null,
): Promise<WeeklySummaryData> {
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Completed this week
  const { data: completedRows } = await supabase
    .from("task_cache")
    .select("clickup_id, name, last_activity_at")
    .eq("profile_id", profileId)
    .in("list_id", listIds)
    .in("status", ["done", "approved", "complete"])
    .gte("last_activity_at", sevenDaysAgoIso)
    .eq("is_visible", true)
    .order("last_activity_at", { ascending: false })
    .limit(20);

  const completed: SummaryTaskItem[] = ((completedRows ?? []) as Array<
    { clickup_id: string; name: string; last_activity_at: string | null }
  >).map((r) => ({ taskId: r.clickup_id, taskName: r.name }));

  // 2. Waiting for client — both "client review" (status approvals) and
  // "awaiting approval" (credit approvals). Matches send-reminders scope.
  const { data: waitingRows } = await supabase
    .from("task_cache")
    .select("clickup_id, name, last_activity_at")
    .eq("profile_id", profileId)
    .in("list_id", listIds)
    .in("status", ["client review", "awaiting approval"])
    .eq("is_visible", true)
    .order("last_activity_at", { ascending: true })
    .limit(20);

  const waitingForClient: SummaryTaskItem[] = ((waitingRows ?? []) as Array<
    { clickup_id: string; name: string; last_activity_at: string | null }
  >).map((r) => ({
    taskId: r.clickup_id,
    taskName: r.name,
    daysPending: daysSince(r.last_activity_at),
  }));

  // 3. Open recommendations (status = to do, tagged "recommendation").
  // tags live under raw_data.tags (jsonb), not a top-level column.
  const { data: recRows } = await supabase
    .from("task_cache")
    .select("clickup_id, name, last_activity_at, raw_data")
    .eq("profile_id", profileId)
    .in("list_id", listIds)
    .eq("status", "to do")
    .eq("is_visible", true)
    .order("last_activity_at", { ascending: true })
    .limit(20);

  const openRecommendations: SummaryTaskItem[] = ((recRows ?? []) as Array<
    { clickup_id: string; name: string; last_activity_at: string | null; raw_data: unknown }
  >)
    .filter((r) => {
      const rd = r.raw_data as { tags?: unknown } | null;
      const tags = rd?.tags;
      return Array.isArray(tags) && (tags as { name: string }[]).some((t) => t.name === "recommendation");
    })
    .map((r) => ({
      taskId: r.clickup_id,
      taskName: r.name,
      daysPending: daysSince(r.last_activity_at),
    }));

  // 4. Unread messages count (profile-scoped)
  const { data: comments } = await supabase
    .from("comment_cache")
    .select("task_id, clickup_created_at")
    .eq("profile_id", profileId)
    .eq("is_from_portal", false)
    .gt("clickup_created_at", sixtyDaysAgoIso);

  let unreadCount = 0;
  if (comments && comments.length > 0) {
    const { data: receipts } = await supabase
      .from("read_receipts")
      .select("context_type, last_read_at")
      .eq("profile_id", profileId);

    const receiptMap = new Map<string, string>();
    for (const r of (receipts ?? []) as { context_type: string; last_read_at: string }[]) {
      receiptMap.set(r.context_type, r.last_read_at);
    }

    for (const c of comments as { task_id: string; clickup_created_at: string }[]) {
      const isSupport = supportTaskId !== null && c.task_id === supportTaskId;
      const contextType = isSupport ? "support" : `task:${c.task_id}`;
      const lastRead = receiptMap.get(contextType);
      if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
        unreadCount++;
      }
    }
  }

  return { completed, waitingForClient, openRecommendations, unreadCount };
}

async function sendWeeklySummaries(
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>,
): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const { data: adminRows, error: adminErr } = await supabase
    .from("org_members")
    .select(`
      organization_id,
      profile_id,
      organizations!inner (
        id,
        name,
        clickup_list_ids,
        support_task_id
      ),
      profiles!inner (
        id,
        email,
        full_name,
        email_notifications,
        notification_preferences,
        last_weekly_summary_sent_at
      )
    `)
    .eq("role", "admin");

  if (adminErr) {
    log.error("Failed to fetch org admins", { error: adminErr.message });
    return { sent: 0, skipped: 0, errors: 1 };
  }

  const cooldownMs = 6 * 24 * 60 * 60 * 1000; // 6 days
  const cooldownBoundary = new Date(Date.now() - cooldownMs).toISOString();

  for (const row of adminRows ?? []) {
    const org = (row as unknown as {
      organizations: {
        id: string;
        name: string;
        clickup_list_ids: unknown;
        support_task_id: string | null;
      };
    }).organizations;
    const profile = (row as unknown as {
      profiles: {
        id: string;
        email: string;
        full_name: string | null;
        email_notifications: boolean;
        notification_preferences: Record<string, boolean> | null;
        last_weekly_summary_sent_at: string | null;
      };
    }).profiles;

    if (!profile.email_notifications) { skipped++; continue; }

    const prefs = profile.notification_preferences ?? {};
    if (prefs.weekly_summary === false) { skipped++; continue; }

    // Cooldown pre-check (avoids doing all data queries if not due)
    if (profile.last_weekly_summary_sent_at) {
      const age = Date.now() - new Date(profile.last_weekly_summary_sent_at).getTime();
      if (age < cooldownMs) { skipped++; continue; }
    }

    const listIds: string[] = Array.isArray(org.clickup_list_ids)
      ? (org.clickup_list_ids as string[])
      : [];
    if (listIds.length === 0) { skipped++; continue; }

    try {
      const summary = await collectSummaryForAdmin(supabase, profile.id, listIds, org.support_task_id);

      const isEmpty = summary.completed.length === 0
        && summary.waitingForClient.length === 0
        && summary.openRecommendations.length === 0
        && summary.unreadCount === 0;

      if (isEmpty) {
        log.info("Weekly summary: skipping empty", { orgId: org.id });
        skipped++;
        continue;
      }

      // Atomic claim on cooldown column (prevents double-send under concurrent runs)
      const { data: claimed, error: claimErr } = await supabase
        .from("profiles")
        .update({ last_weekly_summary_sent_at: new Date().toISOString() })
        .eq("id", profile.id)
        .or(`last_weekly_summary_sent_at.is.null,last_weekly_summary_sent_at.lt.${cooldownBoundary}`)
        .select("id");

      if (claimErr) {
        log.error("Weekly summary: claim error", { error: claimErr.message });
        errors++;
        continue;
      }

      if (!claimed || claimed.length === 0) {
        // Another concurrent run already claimed — safe to skip
        skipped++;
        continue;
      }

      const firstName = profile.full_name?.split(" ")[0] ?? null;
      const { subject, html } = buildWeeklySummaryHtml(summary, firstName, "de");

      const success = await sendMailjet(
        { email: profile.email, name: profile.full_name || undefined },
        subject,
        html,
        log,
      );

      if (success) {
        sent++;
      } else {
        // Send failed but we already claimed the cooldown.
        // Revert claim so next run can retry. Best-effort — do not block.
        await supabase
          .from("profiles")
          .update({ last_weekly_summary_sent_at: profile.last_weekly_summary_sent_at })
          .eq("id", profile.id);
        errors++;
      }
    } catch (e) {
      log.error("Weekly summary send failed", {
        orgId: org.id,
        error: (e as Error).message,
      });
      errors++;
    }
  }

  return { sent, skipped, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("send-weekly-summary", requestId);

  // Auth: verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    log.warn("Unauthorized request");
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Invalid or missing CRON_SECRET" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    log.info("Starting weekly summary job");

    const stats = await sendWeeklySummaries(supabase, log);
    log.info("Weekly summary job complete", stats);

    return new Response(
      JSON.stringify({
        ok: true,
        code: "WEEKLY_SUMMARIES_SENT",
        message: `Sent: ${stats.sent}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`,
        correlationId: requestId,
        ...stats,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    log.error("Unexpected error", { error: String(error) });
    return new Response(
      JSON.stringify({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unexpected error",
        correlationId: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
