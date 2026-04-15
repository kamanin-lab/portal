import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { getEmailCopy, deNewReplies, enNewReplies, type EmailLocale } from "../_shared/emailCopy.ts";

interface TaskDigestItem {
  taskId: string;
  taskName: string;
  replyCount: number;
}

interface EmailRequest {
  type:
    | "task_review"
    | "task_completed"
    | "message_digest"
    | "team_question"
    | "support_response"
    | "step_ready"
    | "step_completed"
    | "project_reply"
    | "credit_approval"
    | "new_recommendation"
    | "project_reminder"
    | "magic_link"
    | "password_reset"
    | "email_confirmation"
    | "signup"
    | "invite"
    | "email_change";
  to: {
    email: string;
    name?: string;
  };
  data: {
    locale?: "de" | "en";
    firstName?: string;
    taskName?: string;
    stepName?: string;
    chapterName?: string;
    taskId?: string;
    projectConfigId?: string;
    tasks?: TaskDigestItem[];
    actionUrl?: string;
    token?: string;
    teamMemberName?: string;
    messagePreview?: string;
    credits?: string;
  };
}

// ClickUp-style email template styles
const styles = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px 0; background-color: #f5f5f5; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 0 20px; }
    .logo-section { text-align: left; padding: 20px 0; }
    .logo-section img { height: 50px; width: auto; max-height: 50px; max-width: 50px; }
    .card { background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 40px; text-align: center; }
    .title { color: #1a1a1a; font-size: 22px; font-weight: 600; margin: 0 0 24px 0; }
    .text { color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; }
    .message-box { background-color: #f9f9f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; text-align: left; }
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

const header = `
  <div class="logo-section">
    <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height: 50px; width: 50px; max-height: 50px; max-width: 50px; display: block;" />
  </div>
`;

const defaultFooter = `
  <div class="footer">
    <p class="footer-text">KAMANIN Client Portal</p>
  </div>
`;

// Generate HTML email templates using shared copy
function generateEmailHtml(
  type: EmailRequest["type"],
  data: EmailRequest["data"]
): { subject: string; html: string } {
  const portalUrl = "https://portal.kamanin.at";
  const locale: EmailLocale = data.locale === "en" ? "en" : "de";
  const copy = getEmailCopy(type, locale);
  const firstName = data.firstName || (locale === "de" ? "" : "there");
  const greeting = typeof copy.greeting === "function" ? copy.greeting(firstName) : copy.greeting;

  // Fix double comma for German when no firstName
  const cleanGreeting = greeting.replace(/^Hallo\s*,\s*,/, "Hallo,");

  switch (type) {
    case "task_review": {
      const taskName = data.taskName || (locale === "de" ? "Ihre Aufgabe" : "your task");
      const taskUrl = data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const subject = typeof copy.subject === "function" ? copy.subject(taskName) : copy.subject;
      const bodyText = typeof copy.body === "function" ? (copy.body as Function)(taskName) : copy.body;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <a href="${taskUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "credit_approval": {
      const taskName = data.taskName || (locale === "de" ? "Ihre Aufgabe" : "your task");
      const credits = data.credits || "0";
      const taskUrl = data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const subject = typeof copy.subject === "function" ? copy.subject(taskName, credits) : copy.subject;
      const bodyText = typeof copy.body === "function" ? (copy.body as Function)(taskName, credits) : copy.body;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <a href="${taskUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "step_ready": {
      const stepName = data.stepName || data.taskName || (locale === "de" ? "Ihr Projektschritt" : "your project step");
      const stepUrl = data.projectConfigId && data.taskId
        ? `${portalUrl}/projekte?id=${data.projectConfigId}&stepId=${data.taskId}`
        : data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const subject = typeof copy.subject === "function" ? copy.subject(stepName) : copy.subject;
      const bodyText = typeof copy.body === "function" ? (copy.body as Function)(stepName) : copy.body;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <a href="${stepUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "step_completed": {
      const chapterName = data.chapterName || data.stepName || data.taskName || (locale === "de" ? "Ihr Projektschritt" : "your project step");
      const stepUrl = data.projectConfigId && data.taskId
        ? `${portalUrl}/projekte?id=${data.projectConfigId}&stepId=${data.taskId}`
        : data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const subject = typeof copy.subject === "function" ? copy.subject(chapterName) : copy.subject;
      const bodyParts = typeof copy.body === "function" ? (copy.body as Function)(chapterName) : copy.body;
      const bodyHtml = Array.isArray(bodyParts)
        ? bodyParts.map((p: string) => `<p class="text">${p}</p>`).join("")
        : `<p class="text">${bodyParts}</p>`;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            ${bodyHtml}
            <a href="${stepUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "project_reply": {
      const stepName = data.stepName || data.taskName || (locale === "de" ? "Ihr Projektschritt" : "your project step");
      const stepUrl = data.projectConfigId && data.taskId
        ? `${portalUrl}/projekte?id=${data.projectConfigId}&stepId=${data.taskId}`
        : data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const teamMemberName = data.teamMemberName || (locale === "de" ? "Ihr Tech-Team" : "Your tech team");
      const messagePreview = data.messagePreview || "";
      const subject = typeof copy.subject === "function" ? copy.subject(stepName) : copy.subject;
      const bodyText = typeof copy.body === "function" ? (copy.body as Function)(teamMemberName, stepName) : copy.body;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <div class="message-box">
              <p class="text" style="font-style: italic; margin: 0;">"${messagePreview}${messagePreview.length >= 300 ? "..." : ""}"</p>
            </div>
            <a href="${stepUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "task_completed": {
      const taskName = data.taskName || (locale === "de" ? "Ihre Aufgabe" : "your task");
      const taskUrl = data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const createTaskUrl = `${portalUrl}/dashboard?createTask=true`;
      const bodyParts = typeof copy.body === "function" ? (copy.body as Function)(taskName) : copy.body;
      const bodyHtml = Array.isArray(bodyParts)
        ? bodyParts.map((p: string) => `<p class="text">${p}</p>`).join("")
        : `<p class="text">${bodyParts}</p>`;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: typeof copy.subject === "function" ? copy.subject(taskName) : copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            ${bodyHtml}
            <a href="${taskUrl}" class="button">${copy.cta}</a>
            ${copy.secondaryCta ? `<p style="margin: 16px 0 0 0;"><a href="${createTaskUrl}" style="color: #2563eb; font-size: 14px; text-decoration: underline;">${copy.secondaryCta}</a></p>` : ""}
            ${notesHtml}
          </div>
          <div class="footer"><p class="footer-text">${copy.signOff || "KAMANIN Client Portal"}</p></div>
          </div></body></html>`,
      };
    }

    case "message_digest": {
      const tasks = data.tasks || [];
      const newRepliesFn = locale === "de" ? deNewReplies : enNewReplies;
      const taskListHtml = tasks
        .map(
          (t) => `<div class="task-item">
            <span class="task-name">"${t.taskName}"</span>
            <span class="reply-count"> — ${newRepliesFn(t.replyCount)}</span>
          </div>`
        )
        .join("");
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <div class="task-list">${taskListHtml}</div>
            <a href="${portalUrl}/dashboard" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "team_question": {
      const taskName = data.taskName || (locale === "de" ? "Ihre Aufgabe" : "your task");
      const taskUrl = data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const teamMemberName = data.teamMemberName || (locale === "de" ? "Ihr Tech-Team" : "Your tech team");
      const messagePreview = data.messagePreview || "";
      const subject = typeof copy.subject === "function" ? copy.subject(taskName) : copy.subject;
      const bodyText = typeof copy.body === "function" ? (copy.body as Function)(teamMemberName, taskName) : copy.body;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <div class="message-box">
              <p class="text" style="font-style: italic; margin: 0;">"${messagePreview}${messagePreview.length >= 300 ? "..." : ""}"</p>
            </div>
            <a href="${taskUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "support_response": {
      const teamMemberName = data.teamMemberName || (locale === "de" ? "Ihr Tech-Team" : "Your tech team");
      const messagePreview = data.messagePreview || "";
      const bodyText = typeof copy.body === "function" ? (copy.body as Function)(teamMemberName) : copy.body;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <div class="message-box">
              <p class="text" style="font-style: italic; margin: 0;">"${messagePreview}${messagePreview.length >= 300 ? "..." : ""}"</p>
            </div>
            <a href="${portalUrl}/dashboard" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "magic_link": {
      const actionUrl = data.actionUrl || portalUrl;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <a href="${actionUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "password_reset": {
      const actionUrl = data.actionUrl || portalUrl;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <a href="${actionUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "email_confirmation": {
      const actionUrl = data.actionUrl || portalUrl;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <a href="${actionUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "signup": {
      const actionUrl = data.actionUrl || portalUrl;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <a href="${actionUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "invite": {
      const actionUrl = data.actionUrl || portalUrl;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <a href="${actionUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "new_recommendation": {
      const taskName = data.taskName || (locale === "de" ? "Ihre Empfehlung" : "your recommendation");
      const taskUrl = data.taskId ? `${portalUrl}/tickets?taskId=${data.taskId}` : `${portalUrl}/tickets`;
      const subject = typeof copy.subject === "function" ? copy.subject(taskName) : copy.subject;
      const bodyText = typeof copy.body === "function" ? (copy.body as Function)(taskName) : copy.body;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <a href="${taskUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "email_change": {
      const actionUrl = data.actionUrl || portalUrl;
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      return {
        subject: copy.subject as string,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <a href="${actionUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    case "project_reminder": {
      const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";
      const tasks = data.tasks || [];
      const taskListHtml = tasks
        .map(
          (t) => `<div class="task-item">
            <span class="task-name">${t.taskName}</span>
          </div>`
        )
        .join("");
      const subject = typeof copy.subject === "function" ? copy.subject(tasks.length) : copy.subject;
      return {
        subject,
        html: `<!DOCTYPE html><html><head>${styles}</head><body>
          <div class="wrapper">${header}<div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${copy.body as string}</p>
            <div class="task-list">${taskListHtml}</div>
            <a href="${portalUrl}/projekte" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>${defaultFooter}</div></body></html>`,
      };
    }

    default:
      return {
        subject: "KAMANIN Portal",
        html: "<p>You have a notification from the KAMANIN Client Portal.</p>",
      };
  }
}

// Send email via Mailjet API
async function sendMailjetEmail(
  to: { email: string; name?: string },
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("MAILJET_API_KEY");
  const apiSecret = Deno.env.get("MAILJET_API_SECRET");

  if (!apiKey || !apiSecret) {
    console.error("Mailjet credentials not configured");
    return { success: false, error: "Email service not configured" };
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
            From: {
              Email: "notifications@kamanin.at",
              Name: "KAMANIN Portal",
            },
            To: [
              {
                Email: to.email,
                Name: to.name || to.email,
              },
            ],
            Subject: subject,
            HTMLPart: htmlContent,
          },
        ],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Mailjet API error:", JSON.stringify(result));
      return { success: false, error: "Failed to send email" };
    }

    const messageStatus = result.Messages?.[0]?.Status;
    if (messageStatus === "success") {
      console.log("Email sent successfully via Mailjet");
      return { success: true };
    } else {
      console.error("Mailjet send failed:", messageStatus);
      return { success: false, error: messageStatus };
    }
  } catch (error) {
    console.error("Mailjet request error:", error);
    return { success: false, error: "Email service error" };
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const emailRequest: EmailRequest = await req.json();

    if (!emailRequest.type || !emailRequest.to?.email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, to.email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { subject, html } = generateEmailHtml(
      emailRequest.type,
      emailRequest.data || {}
    );

    const result = await sendMailjetEmail(emailRequest.to, subject, html);

    if (result.success) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("send-mailjet-email error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        ...defaultCorsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
