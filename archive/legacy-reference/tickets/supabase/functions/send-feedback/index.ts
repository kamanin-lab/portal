import { getCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

interface Attachment {
  filename: string;
  contentType: string;
  base64: string;
}

interface FeedbackPayload {
  subject: string;
  message: string;
  pageUrl?: string;
  userEmail?: string;
  profileId?: string;
  userAgent?: string;
  attachments?: Attachment[];
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("send-feedback", requestId);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body: FeedbackPayload = await req.json();

    // Validate required fields
    if (!body.subject?.trim() || !body.message?.trim()) {
      return new Response(
        JSON.stringify({ ok: false, code: "VALIDATION_ERROR", message: "Betreff und Nachricht sind erforderlich.", correlationId: requestId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const subject = body.subject.trim().slice(0, 200);
    const message = body.message.trim().slice(0, 2000);

    // Format timestamp in Europe/Vienna
    const timestamp = new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Europe/Vienna",
    }).format(new Date());

    // Build HTML body
    const metaRows = [
      `<tr><td style="padding:4px 8px;font-weight:600;">Seite</td><td style="padding:4px 8px;">${escapeHtml(body.pageUrl || "–")}</td></tr>`,
      `<tr><td style="padding:4px 8px;font-weight:600;">E-Mail</td><td style="padding:4px 8px;">${escapeHtml(body.userEmail || "–")}</td></tr>`,
      `<tr><td style="padding:4px 8px;font-weight:600;">Profil-ID</td><td style="padding:4px 8px;">${escapeHtml(body.profileId || "–")}</td></tr>`,
      `<tr><td style="padding:4px 8px;font-weight:600;">Zeitpunkt</td><td style="padding:4px 8px;">${timestamp}</td></tr>`,
      `<tr><td style="padding:4px 8px;font-weight:600;">User-Agent</td><td style="padding:4px 8px;font-size:12px;">${escapeHtml(body.userAgent || "–")}</td></tr>`,
    ].join("");

    const htmlBody = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">[Portal Feedback] ${escapeHtml(subject)}</h2>
        <div style="background:#f9f9f9;border-radius:8px;padding:16px 20px;margin:16px 0;white-space:pre-wrap;">${escapeHtml(message)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#4a4a4a;">${metaRows}</table>
      </div>
    `;

    // Build Mailjet attachments
    const mjAttachments = (body.attachments || []).slice(0, 5).map((a) => ({
      ContentType: a.contentType,
      Filename: a.filename.slice(0, 100),
      Base64Content: a.base64,
    }));

    // Send via Mailjet
    const apiKey = Deno.env.get("MAILJET_API_KEY");
    const apiSecret = Deno.env.get("MAILJET_API_SECRET");
    if (!apiKey || !apiSecret) {
      log.error("Mailjet credentials missing");
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", message: "E-Mail-Service nicht konfiguriert.", correlationId: requestId }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const credentials = btoa(`${apiKey}:${apiSecret}`);
    const mailjetBody: Record<string, unknown> = {
      Messages: [
        {
          From: { Email: "notifications@kamanin.at", Name: "KAMANIN Portal" },
          To: [{ Email: "support@kamanin.at", Name: "KAMANIN Support" }],
          ReplyTo: body.userEmail ? { Email: body.userEmail } : undefined,
          Subject: `[Portal Feedback] ${subject}`,
          HTMLPart: htmlBody,
          ...(mjAttachments.length > 0 ? { Attachments: mjAttachments } : {}),
        },
      ],
    };

    const mjRes = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mailjetBody),
    });

    const mjResult = await mjRes.json();

    if (!mjRes.ok || mjResult.Messages?.[0]?.Status !== "success") {
      log.error("Mailjet send failed", { status: mjRes.status, result: mjResult });
      return new Response(
        JSON.stringify({ ok: false, code: "SEND_ERROR", message: "E-Mail konnte nicht gesendet werden.", correlationId: requestId }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    log.info("Feedback sent successfully");
    return new Response(
      JSON.stringify({ ok: true, correlationId: requestId }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("Unhandled error", { error: String(err) });
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", message: "Interner Fehler.", correlationId: requestId }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
