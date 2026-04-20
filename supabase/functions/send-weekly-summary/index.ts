// ============ DEPLOYMENT VERSION ============
// Version: 2026-04-18-v1.5-weekly-summary-rich
// Feature: Weekly summary email — Monday 09:00 CET, 6-day cooldown, org-admin only
// v1.5 — "Was wir gemacht haben" first, AI narrative, project block, peer activity.
// Three delivery tiers: SKIP (nothing), LIGHT (only pending), FULL (normal).
// =============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEmailCopy, type EmailLocale } from "../_shared/emailCopy.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryTaskItem {
  taskId: string;
  taskName: string;
  daysPending?: number;
  note?: string;
}

interface TeamCommentsByTask {
  taskId: string;
  taskName: string;
  count: number;
}

interface PeerActivity {
  taskId: string;
  taskName: string;
  count: number;
  authorLabel: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  type: string | null;
  startDate: string | null;
  targetDate: string | null;
  createdWithinWeek: boolean;
  tasks: { name: string; status: string; lastActivityAt: string | null }[];
}

interface WeeklySummaryData {
  completed: SummaryTaskItem[];
  inProgress: SummaryTaskItem[];
  teamCommentsByTask: TeamCommentsByTask[];
  teamCommentsTotal: number;
  peerActivity: PeerActivity[];
  activeProjects: ProjectSummary[];
  waitingForClient: SummaryTaskItem[];
  openRecommendations: SummaryTaskItem[];
  unreadCount: number;
  activityCount: number;
}

type Tier = "SKIP" | "LIGHT" | "FULL";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
    .divider { border-top: 1px solid #eee; margin: 28px 0 20px 0; }
    .section { margin: 20px 0 12px 0; }
    .section-title { color: #1a1a1a; font-size: 15px; font-weight: 600; margin: 0 0 10px 0; }
    .ai-summary { color: #4a4a4a; font-size: 15px; line-height: 1.6; font-style: italic; margin: 4px 0 16px 0; padding: 12px 16px; background-color: #f4f7fb; border-left: 3px solid #2563eb; border-radius: 4px; }
    .task-list { background-color: #f9f9f9; border-radius: 8px; padding: 14px 18px; margin: 0 0 8px 0; }
    .task-item { padding: 7px 0; border-bottom: 1px solid #e5e5e5; }
    .task-item:last-child { border-bottom: none; }
    .task-name { color: #1a1a1a; font-weight: 500; }
    .meta { color: #666; font-size: 14px; }
    .project-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px 18px; margin: 0 0 10px 0; }
    .project-name { color: #1a1a1a; font-weight: 600; font-size: 15px; margin: 0 0 4px 0; }
    .project-meta { color: #666; font-size: 13px; margin: 0 0 10px 0; }
    .project-task { color: #4a4a4a; font-size: 14px; padding: 4px 0; }
    .badge-new { display: inline-block; background: #2563eb; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle; }
    .cta-wrapper { text-align: center; margin: 24px 0 8px 0; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; font-size: 15px; }
    .footer { text-align: center; padding: 24px 0; }
    .footer-text { color: #999; font-size: 12px; margin: 0; }
    .muted { font-size: 13px; color: #888; margin: 8px 0 0 0; }
    .peer-line { color: #4a4a4a; font-size: 14px; margin: 4px 0; }
  </style>
`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

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

function pluralTage(n: number): string {
  return n === 1 ? "1 Tag" : `${n} Tagen`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripPortalPrefix(text: string): string {
  // Portal-originated comments embed the author in a "Name (via Client Portal):\n\n..." prefix.
  // Strip it for display so it doesn't leak into summaries or UI.
  return text.replace(/^.+?\(via Client Portal\):\s*/i, "").trim();
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderTaskList(items: SummaryTaskItem[], showDays: boolean): string {
  return items
    .map((t) => {
      const parts: string[] = [];
      if (showDays && typeof t.daysPending === "number") {
        parts.push(`seit ${pluralTage(t.daysPending)}`);
      }
      if (t.note) parts.push(t.note);
      const metaHtml = parts.length
        ? `<span class="meta"> &mdash; ${parts.map(escapeHtml).join(" · ")}</span>`
        : "";
      return `<div class="task-item"><span class="task-name">${escapeHtml(t.taskName)}</span>${metaHtml}</div>`;
    })
    .join("");
}

function renderCommentsByTask(items: TeamCommentsByTask[]): string {
  return items
    .map((i) => `<div class="task-item"><span class="task-name">${escapeHtml(i.taskName)}</span><span class="meta"> &mdash; ${i.count} ${i.count === 1 ? "Antwort" : "Antworten"}</span></div>`)
    .join("");
}

function renderProject(p: ProjectSummary): string {
  const rangeParts: string[] = [];
  if (p.type) rangeParts.push(p.type);
  if (p.startDate) rangeParts.push(`gestartet am ${p.startDate}`);
  if (p.targetDate) rangeParts.push(`Ziel: ${p.targetDate}`);
  const meta = rangeParts.map(escapeHtml).join(" · ");

  const taskRows = p.tasks
    .map((t) => {
      const label = t.status === "in progress"
        ? "in Bearbeitung"
        : t.status === "client review"
        ? "wartet auf Freigabe"
        : t.status === "awaiting approval"
        ? "wartet auf Kostenfreigabe"
        : t.status === "to do"
        ? "offen"
        : t.status === "backlog"
        ? "in Vorbereitung"
        : t.status === "done" || t.status === "approved" || t.status === "complete"
        ? "abgeschlossen"
        : t.status === "rework"
        ? "im Rework"
        : t.status;
      return `<div class="project-task">▸ ${escapeHtml(t.name)} <span class="meta">— ${escapeHtml(label)}</span></div>`;
    })
    .join("");

  const newBadge = p.createdWithinWeek ? `<span class="badge-new">NEU</span>` : "";
  return `<div class="project-card">
    <p class="project-name">${escapeHtml(p.name)}${newBadge}</p>
    ${meta ? `<p class="project-meta">${meta}</p>` : ""}
    ${taskRows}
  </div>`;
}

// ---------------------------------------------------------------------------
// AI summary via OpenRouter — Claude Haiku 4.5
// ---------------------------------------------------------------------------

async function generateAiSummary(
  teamComments: { taskName: string; text: string }[],
  projects: ProjectSummary[],
  log: ReturnType<typeof createLogger>,
): Promise<string | null> {
  if (teamComments.length < 5) return null;

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) {
    log.debug("No OPENROUTER_API_KEY — skipping AI summary");
    return null;
  }

  const recentComments = teamComments
    .slice(0, 15)
    .map((c) => `- Aufgabe "${c.taskName}": ${c.text.slice(0, 220)}`)
    .join("\n");

  const projectContext = projects.length
    ? `\nAktive Projekte: ${projects.map((p) => p.name + (p.createdWithinWeek ? " (diese Woche gestartet)" : "")).join(", ")}\n`
    : "";

  const prompt = `Du bist der Projekt-Lead einer Webagentur (KAMANIN). Fasse die Arbeit unseres Teams diese Woche in 1–2 deutschen Sätzen zusammen.

Stil: warm und umgangssprachlich ("diese Woche haben wir …", "losgelegt", "geschraubt", "feingetuned"). Zeige, woran WIR gearbeitet haben. Keine Aufforderungen an den Kunden. Keine Begrüßung. Keine Einleitung.

${projectContext}
Team-Kommentare dieser Woche:
${recentComments}

Antworte NUR mit der Zusammenfassung als reiner Text. Keine Markdown-Formatierung.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
        "HTTP-Referer": "https://portal.kamanin.at",
        "X-Title": "KAMANIN Weekly Summary",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        max_tokens: 200,
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      log.warn("OpenRouter non-OK", { status: response.status });
      return null;
    }

    const data = await response.json();
    let text: string = data.choices?.[0]?.message?.content ?? "";
    text = text.trim();
    if (!text) return null;

    // Hard safety: strip any sentence that asks the client to act.
    text = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => !/^(bitte|können sie|k\u00f6nnen sie)/i.test(s.trim()))
      .join(" ");

    // Cap at 2 sentences.
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    text = sentences.slice(0, 2).join(" ").trim();

    return text || null;
  } catch (err) {
    log.warn("AI summary failed", { error: (err as Error).message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

async function collectSummaryForAdmin(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  adminEmail: string,
  listIds: string[],
  supportTaskId: string | null,
): Promise<{ data: WeeklySummaryData; teamCommentsForAI: { taskName: string; text: string }[] }> {
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

  // 2. Currently in progress (NEW — agency-side work signal)
  const { data: inProgressRows } = await supabase
    .from("task_cache")
    .select("clickup_id, name, status, last_activity_at")
    .eq("profile_id", profileId)
    .in("list_id", listIds)
    .in("status", ["in progress", "internal review", "rework"])
    .eq("is_visible", true)
    .order("last_activity_at", { ascending: false })
    .limit(10);

  const inProgress: SummaryTaskItem[] = ((inProgressRows ?? []) as Array<
    { clickup_id: string; name: string; status: string; last_activity_at: string | null }
  >).map((r) => ({
    taskId: r.clickup_id,
    taskName: r.name,
    daysPending: daysSince(r.last_activity_at),
    note: r.status === "rework" ? "im Rework" : `in Bearbeitung seit ${pluralTage(daysSince(r.last_activity_at))}`,
  }));

  // 3. Waiting for client
  const { data: waitingRows } = await supabase
    .from("task_cache")
    .select("clickup_id, name, status, last_activity_at")
    .eq("profile_id", profileId)
    .in("list_id", listIds)
    .in("status", ["client review", "awaiting approval"])
    .eq("is_visible", true)
    .order("last_activity_at", { ascending: true })
    .limit(20);

  const waitingForClient: SummaryTaskItem[] = ((waitingRows ?? []) as Array<
    { clickup_id: string; name: string; status: string; last_activity_at: string | null }
  >).map((r) => ({
    taskId: r.clickup_id,
    taskName: r.name,
    daysPending: daysSince(r.last_activity_at),
    note: r.status === "awaiting approval" ? "Kostenfreigabe" : "Freigabe",
  }));

  // 4. Open recommendations (tags live in raw_data.tags)
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

  // 5. Team comments this week (agency activity) + unread count + peer detection
  const { data: allCommentsThisWeek } = await supabase
    .from("comment_cache")
    .select("task_id, clickup_created_at, is_from_portal, author_email, author_name, comment_text")
    .eq("profile_id", profileId)
    .gt("clickup_created_at", sevenDaysAgoIso);

  const { data: commentsForUnread } = await supabase
    .from("comment_cache")
    .select("task_id, clickup_created_at")
    .eq("profile_id", profileId)
    .eq("is_from_portal", false)
    .gt("clickup_created_at", sixtyDaysAgoIso);

  const teamCommentsByTaskMap = new Map<string, number>();
  const peerCommentsByTaskMap = new Map<string, { count: number; author: string }>();
  const teamCommentsForAI: { taskName: string; text: string }[] = [];

  for (const c of (allCommentsThisWeek ?? []) as Array<{
    task_id: string;
    clickup_created_at: string;
    is_from_portal: boolean;
    author_email: string | null;
    author_name: string | null;
    comment_text: string | null;
  }>) {
    if (!c.is_from_portal) {
      // Agency team comment
      teamCommentsByTaskMap.set(c.task_id, (teamCommentsByTaskMap.get(c.task_id) ?? 0) + 1);
      if (c.comment_text) {
        teamCommentsForAI.push({
          taskName: "",
          text: stripPortalPrefix(c.comment_text),
        });
      }
    } else {
      // Portal-originated: could be the admin themselves or a peer
      const isSelf = (c.author_email ?? "").toLowerCase() === adminEmail.toLowerCase();
      if (!isSelf) {
        const prior = peerCommentsByTaskMap.get(c.task_id);
        const authorLabel = (c.author_name ?? "").trim()
          || (c.author_email ?? "").trim()
          || "Ein Teammitglied";
        peerCommentsByTaskMap.set(c.task_id, {
          count: (prior?.count ?? 0) + 1,
          author: prior?.author ?? authorLabel,
        });
      }
    }
  }

  // Resolve task names for team-comment + peer buckets via a single task_cache fetch.
  const allInvolvedTaskIds = [
    ...teamCommentsByTaskMap.keys(),
    ...peerCommentsByTaskMap.keys(),
  ];
  const taskNameMap = new Map<string, string>();
  if (allInvolvedTaskIds.length > 0) {
    const { data: nameRows } = await supabase
      .from("task_cache")
      .select("clickup_id, name")
      .in("clickup_id", allInvolvedTaskIds);
    for (const row of (nameRows ?? []) as Array<{ clickup_id: string; name: string }>) {
      taskNameMap.set(row.clickup_id, row.name);
    }
  }

  const teamCommentsByTask: TeamCommentsByTask[] = [...teamCommentsByTaskMap.entries()]
    .map(([taskId, count]) => ({
      taskId,
      taskName: supportTaskId && taskId === supportTaskId
        ? "Support-Chat"
        : taskNameMap.get(taskId) ?? "Aufgabe",
      count,
    }))
    .sort((a, b) => b.count - a.count);
  const teamCommentsTotal = teamCommentsByTask.reduce((s, t) => s + t.count, 0);

  // Attach correct taskName to AI-context entries (re-walk)
  const aiEntries: { taskName: string; text: string }[] = [];
  for (const c of (allCommentsThisWeek ?? []) as Array<{
    task_id: string; is_from_portal: boolean; comment_text: string | null;
  }>) {
    if (c.is_from_portal || !c.comment_text) continue;
    const name = supportTaskId && c.task_id === supportTaskId
      ? "Support-Chat"
      : taskNameMap.get(c.task_id) ?? "Aufgabe";
    aiEntries.push({ taskName: name, text: stripPortalPrefix(c.comment_text) });
  }

  const peerActivity: PeerActivity[] = [...peerCommentsByTaskMap.entries()]
    .map(([taskId, v]) => ({
      taskId,
      taskName: supportTaskId && taskId === supportTaskId
        ? "Support-Chat"
        : taskNameMap.get(taskId) ?? "Aufgabe",
      count: v.count,
      authorLabel: v.author,
    }))
    .sort((a, b) => b.count - a.count);

  // 6. Unread count (uses profile + read_receipts + supportTaskId)
  let unreadCount = 0;
  if (commentsForUnread && commentsForUnread.length > 0) {
    const { data: receipts } = await supabase
      .from("read_receipts")
      .select("context_type, last_read_at")
      .eq("profile_id", profileId);

    const receiptMap = new Map<string, string>();
    for (const r of (receipts ?? []) as { context_type: string; last_read_at: string }[]) {
      receiptMap.set(r.context_type, r.last_read_at);
    }

    for (const c of commentsForUnread as { task_id: string; clickup_created_at: string }[]) {
      const isSupport = supportTaskId !== null && c.task_id === supportTaskId;
      const contextType = isSupport ? "support" : `task:${c.task_id}`;
      const lastRead = receiptMap.get(contextType);
      if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
        unreadCount++;
      }
    }
  }

  // 7. Active projects for this admin + their tasks
  const { data: accessRows } = await supabase
    .from("project_access")
    .select("project_config_id")
    .eq("profile_id", profileId);

  const projectIds = (accessRows ?? []).map((r: { project_config_id: string }) => r.project_config_id);

  const activeProjects: ProjectSummary[] = [];
  if (projectIds.length > 0) {
    const { data: projectRows } = await supabase
      .from("project_config")
      .select("id, name, type, start_date, target_date, is_active, created_at")
      .in("id", projectIds)
      .eq("is_active", true);

    for (const pr of (projectRows ?? []) as Array<{
      id: string;
      name: string;
      type: string | null;
      start_date: string | null;
      target_date: string | null;
      created_at: string;
    }>) {
      const { data: taskRows } = await supabase
        .from("project_task_cache")
        .select("name, status, last_activity_at")
        .eq("project_config_id", pr.id)
        .eq("is_visible", true)
        .order("last_activity_at", { ascending: false })
        .limit(10);

      const tasks = ((taskRows ?? []) as Array<{ name: string; status: string; last_activity_at: string | null }>)
        .map((t) => ({ name: t.name, status: t.status, lastActivityAt: t.last_activity_at }));

      const createdWithinWeek = new Date(pr.created_at).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000;

      activeProjects.push({
        id: pr.id,
        name: pr.name,
        type: pr.type,
        startDate: pr.start_date,
        targetDate: pr.target_date,
        createdWithinWeek,
        tasks,
      });
    }
  }

  // 8. Subject-line activity count — distinct touched task_cache rows in last 7 days
  const { data: activityRows } = await supabase
    .from("task_cache")
    .select("clickup_id")
    .eq("profile_id", profileId)
    .in("list_id", listIds)
    .gte("last_activity_at", sevenDaysAgoIso)
    .eq("is_visible", true);
  const activityCount = (activityRows ?? []).length;

  return {
    data: {
      completed,
      inProgress,
      teamCommentsByTask,
      teamCommentsTotal,
      peerActivity,
      activeProjects,
      waitingForClient,
      openRecommendations,
      unreadCount,
      activityCount,
    },
    teamCommentsForAI: aiEntries,
  };
}

// ---------------------------------------------------------------------------
// Tier decision
// ---------------------------------------------------------------------------

function determineTier(d: WeeklySummaryData): Tier {
  const agencyWork = d.completed.length > 0
    || d.inProgress.length > 0
    || d.teamCommentsTotal > 0
    || d.peerActivity.length > 0
    || d.activeProjects.some((p) => p.createdWithinWeek)
    || d.activityCount > 0;

  const anyPendingForClient = d.waitingForClient.length > 0
    || d.openRecommendations.length > 0
    || d.unreadCount > 0;

  if (!agencyWork && !anyPendingForClient) return "SKIP";
  if (!agencyWork && anyPendingForClient) return "LIGHT";
  return "FULL";
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function buildFullHtml(
  d: WeeklySummaryData,
  aiSummary: string | null,
  firstName: string | null,
  locale: EmailLocale = "de",
): { subject: string; html: string } {
  const copy = getEmailCopy("weekly_summary", locale);
  const isoWeek = getISOWeek();
  const greeting = typeof copy.greeting === "function"
    ? copy.greeting(firstName || undefined)
    : copy.greeting;
  const subject = `Wochenbericht — KW ${isoWeek} · ${d.activityCount} Aktivit\u00e4ten`;

  const sections: string[] = [];

  // ---- "Was wir f\u00fcr Sie gemacht haben" (agency-side) ----
  const agencyParts: string[] = [];

  if (aiSummary) {
    agencyParts.push(`<div class="ai-summary">${escapeHtml(aiSummary)}</div>`);
  }

  if (d.completed.length > 0) {
    agencyParts.push(`<div class="section">
      <h2 class="section-title">\u2713 Abgeschlossen diese Woche (${d.completed.length})</h2>
      <div class="task-list">${renderTaskList(d.completed, false)}</div>
    </div>`);
  }

  if (d.inProgress.length > 0) {
    agencyParts.push(`<div class="section">
      <h2 class="section-title">\u25b8 Aktuell in Bearbeitung (${d.inProgress.length})</h2>
      <div class="task-list">${renderTaskList(d.inProgress, false)}</div>
    </div>`);
  }

  if (d.teamCommentsByTask.length > 0) {
    agencyParts.push(`<div class="section">
      <h2 class="section-title">\u270d Nachrichten von uns in dieser Woche (${d.teamCommentsTotal} in ${d.teamCommentsByTask.length} Aufgaben)</h2>
      <div class="task-list">${renderCommentsByTask(d.teamCommentsByTask)}</div>
    </div>`);
  }

  if (d.peerActivity.length > 0) {
    const lines = d.peerActivity
      .map((p) => `<p class="peer-line">\u25b8 ${escapeHtml(p.authorLabel)} hat in \u201e${escapeHtml(p.taskName)}\u201c ${p.count === 1 ? "geantwortet" : `${p.count}\u00d7 geantwortet`}.</p>`)
      .join("");
    agencyParts.push(`<div class="section">
      <h2 class="section-title">Ihr Team ist auch aktiv</h2>
      ${lines}
    </div>`);
  }

  if (agencyParts.length > 0) {
    sections.push(`<div class="section"><h2 class="section-title">\ud83d\udee0\ufe0f Was wir f\u00fcr Sie gemacht haben</h2>${agencyParts.join("")}</div>`);
  }

  // ---- Projects (always shown if any exist) ----
  if (d.activeProjects.length > 0) {
    sections.push(`<div class="divider"></div>`);
    for (const p of d.activeProjects) {
      sections.push(`<div class="section">
        <h2 class="section-title">\ud83d\udcc1 Projekt: ${escapeHtml(p.name)}</h2>
        ${renderProject(p)}
      </div>`);
    }
  }

  // ---- Client-facing pending ----
  const clientParts: string[] = [];
  if (d.waitingForClient.length > 0) {
    clientParts.push(`<div class="section">
      <h2 class="section-title">\u23f3 Was auf Sie wartet (${d.waitingForClient.length})</h2>
      <div class="task-list">${renderTaskList(d.waitingForClient, true)}</div>
    </div>`);
  }
  if (d.openRecommendations.length > 0) {
    clientParts.push(`<div class="section">
      <h2 class="section-title">\ud83d\udca1 Offene Empfehlungen (${d.openRecommendations.length})</h2>
      <div class="task-list">${renderTaskList(d.openRecommendations, true)}</div>
    </div>`);
  }
  if (d.unreadCount > 0) {
    const label = d.unreadCount === 1
      ? "Sie haben <strong>1 ungelesene Nachricht</strong>."
      : `Sie haben <strong>${d.unreadCount} ungelesene Nachrichten</strong>.`;
    clientParts.push(`<div class="section">
      <h2 class="section-title">\u2709\ufe0f Ungelesene Nachrichten</h2>
      <p class="text" style="margin: 0;">${label}</p>
    </div>`);
  }
  if (clientParts.length > 0) {
    sections.push(`<div class="divider"></div>${clientParts.join("")}`);
  }

  const notesHtml = copy.notes?.map((n) => `<p class="muted">${escapeHtml(n)}</p>`).join("") ?? "";

  const html = `<!DOCTYPE html><html><head>${styles}</head><body>
    <div class="wrapper">
      <div class="logo-section">
        <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height: 50px; width: 50px; max-height: 50px; max-width: 50px; display: block;" />
      </div>
      <div class="card">
        <h1 class="title">${escapeHtml(copy.title)}</h1>
        <p class="text">${greeting}</p>
        <p class="text">${copy.body as string}</p>
        ${sections.join("")}
        <div class="cta-wrapper">
          <a href="${portalUrl}" class="button">${escapeHtml(copy.cta)}</a>
        </div>
        ${notesHtml}
      </div>
      <div class="footer">
        <p class="footer-text">KAMANIN Client Portal</p>
      </div>
    </div></body></html>`;

  return { subject, html };
}

function buildLightHtml(
  d: WeeklySummaryData,
  firstName: string | null,
): { subject: string; html: string } {
  const isoWeek = getISOWeek();
  const greeting = firstName ? `Hallo ${firstName},` : "Hallo,";
  const subject = `Offene Punkte — KW ${isoWeek}`;

  const clientParts: string[] = [];
  if (d.waitingForClient.length > 0) {
    clientParts.push(`<div class="section">
      <h2 class="section-title">\u23f3 Was auf Sie wartet (${d.waitingForClient.length})</h2>
      <div class="task-list">${renderTaskList(d.waitingForClient, true)}</div>
    </div>`);
  }
  if (d.openRecommendations.length > 0) {
    clientParts.push(`<div class="section">
      <h2 class="section-title">\ud83d\udca1 Offene Empfehlungen (${d.openRecommendations.length})</h2>
      <div class="task-list">${renderTaskList(d.openRecommendations, true)}</div>
    </div>`);
  }
  if (d.unreadCount > 0) {
    const label = d.unreadCount === 1
      ? "Sie haben <strong>1 ungelesene Nachricht</strong>."
      : `Sie haben <strong>${d.unreadCount} ungelesene Nachrichten</strong>.`;
    clientParts.push(`<div class="section">
      <h2 class="section-title">\u2709\ufe0f Ungelesene Nachrichten</h2>
      <p class="text" style="margin: 0;">${label}</p>
    </div>`);
  }

  const html = `<!DOCTYPE html><html><head>${styles}</head><body>
    <div class="wrapper">
      <div class="logo-section">
        <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height: 50px; width: 50px; max-height: 50px; max-width: 50px; display: block;" />
      </div>
      <div class="card">
        <h1 class="title">Offene Punkte</h1>
        <p class="text">${greeting}</p>
        <p class="text">Diese Woche war bei uns ruhig — hier eine kurze Erinnerung an die Punkte, die auf Ihre R\u00fcckmeldung warten:</p>
        ${clientParts.join("")}
        <div class="cta-wrapper">
          <a href="${portalUrl}" class="button">Im Portal ansehen</a>
        </div>
        <p class="muted">Sie erhalten diese E-Mail nur, wenn offene Punkte bestehen. Sie k\u00f6nnen die w\u00f6chentliche Zusammenfassung in Ihren Kontoeinstellungen deaktivieren.</p>
      </div>
      <div class="footer">
        <p class="footer-text">KAMANIN Client Portal</p>
      </div>
    </div></body></html>`;

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Mailjet send
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main driver
// ---------------------------------------------------------------------------

async function sendWeeklySummaries(
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>,
): Promise<{ sent: number; skipped: number; errors: number; tierBreakdown: Record<Tier, number> }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const tierBreakdown: Record<Tier, number> = { SKIP: 0, LIGHT: 0, FULL: 0 };

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
    return { sent: 0, skipped: 0, errors: 1, tierBreakdown };
  }

  const cooldownMs = 6 * 24 * 60 * 60 * 1000;
  // Strip milliseconds: PostgREST's .or() filter parser treats the dot in
  // `.523Z` as a separator, producing "column does not exist" 42703 errors.
  const cooldownBoundary = new Date(Date.now() - cooldownMs).toISOString().replace(/\.\d{3}Z$/, "Z");

  for (const row of adminRows ?? []) {
    const org = (row as unknown as {
      organizations: { id: string; name: string; clickup_list_ids: unknown; support_task_id: string | null };
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

    if (profile.last_weekly_summary_sent_at) {
      const age = Date.now() - new Date(profile.last_weekly_summary_sent_at).getTime();
      if (age < cooldownMs) { skipped++; continue; }
    }

    const listIds: string[] = Array.isArray(org.clickup_list_ids)
      ? (org.clickup_list_ids as string[])
      : [];
    if (listIds.length === 0) { skipped++; continue; }

    try {
      const { data: summary, teamCommentsForAI } = await collectSummaryForAdmin(
        supabase,
        profile.id,
        profile.email,
        listIds,
        org.support_task_id,
      );

      const tier = determineTier(summary);
      tierBreakdown[tier]++;

      if (tier === "SKIP") {
        log.info("Weekly summary: SKIP (no activity, no pending)", { orgId: org.id });
        skipped++;
        continue;
      }

      // Atomic claim — prevents double-send under concurrent runs.
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
        skipped++;
        continue;
      }

      const firstName = profile.full_name?.split(" ")[0] ?? null;

      let aiSummary: string | null = null;
      if (tier === "FULL") {
        aiSummary = await generateAiSummary(teamCommentsForAI, summary.activeProjects, log);
      }

      const { subject, html } = tier === "FULL"
        ? buildFullHtml(summary, aiSummary, firstName, "de")
        : buildLightHtml(summary, firstName);

      const success = await sendMailjet(
        { email: profile.email, name: profile.full_name || undefined },
        subject,
        html,
        log,
      );

      if (success) {
        sent++;
      } else {
        // Revert the claim so the next run can retry.
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

  return { sent, skipped, errors, tierBreakdown };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("send-weekly-summary", requestId);

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
        message: `Sent: ${stats.sent}, Skipped: ${stats.skipped}, Errors: ${stats.errors} (FULL: ${stats.tierBreakdown.FULL}, LIGHT: ${stats.tierBreakdown.LIGHT}, SKIP: ${stats.tierBreakdown.SKIP})`,
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
