// ============ DEPLOYMENT VERSION ============
// Version: 2026-03-27-v1-initial
// Feature: Digest email reminders for pending approval tasks (every 5 days)
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
  locale: EmailLocale = "de"
): { subject: string; html: string } {
  const copy = getEmailCopy("pending_reminder", locale);
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
        <a href="${portalUrl}/tickets" class="button">${copy.cta}</a>
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

    log.info("Reminder job complete", { sent, skipped, errors, totalProfiles: profileMap.size });

    return new Response(
      JSON.stringify({ ok: true, code: "REMINDERS_SENT", message: `Sent: ${sent}, Skipped: ${skipped}, Errors: ${errors}`, correlationId: requestId, sent, skipped, errors }),
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
