import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { getEmailCopy } from "../_shared/emailCopy.ts";

interface AuthEmailPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: {
      full_name?: string;
    };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: "signup" | "recovery" | "magiclink" | "email_change" | "invite";
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
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
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; font-size: 15px; margin: 24px 0 8px 0; }
    .footer { text-align: center; padding: 24px 0; }
    .footer-text { color: #999; font-size: 12px; margin: 0; }
    .muted { font-size: 13px; color: #888; margin: 8px 0 0 0; }
  </style>
`;

const logoUrl = "https://portal.kamanin.at/images/K-logo.png";

const header = `
  <div class="logo-section">
    <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height: 50px; width: 50px; max-height: 50px; max-width: 50px; display: block;" />
  </div>
`;

const footer = `
  <div class="footer">
    <p class="footer-text">KAMANIN Client Portal</p>
  </div>
`;

// Map Supabase auth action types to our email types
const AUTH_TYPE_MAP: Record<string, string> = {
  magiclink: "magic_link",
  recovery: "password_reset",
  signup: "signup",
  email_change: "email_change",
  invite: "invite",
};

function generateEmailHtml(type: string, actionUrl: string, firstName?: string): { subject: string; html: string } {
  const emailType = AUTH_TYPE_MAP[type] || type;
  // Default locale is German
  const copy = getEmailCopy(emailType as any, "de");

  if (!copy) {
    return {
      subject: "KAMANIN Portal",
      html: `<p>Click here to continue: <a href="${actionUrl}">${actionUrl}</a></p>`,
    };
  }

  const greeting = typeof copy.greeting === "function" ? copy.greeting(firstName) : copy.greeting;
  const cleanGreeting = greeting.replace(/^Hallo\s*,\s*,/, "Hallo,");
  const bodyText = typeof copy.body === "function" ? (copy.body as Function)(firstName) : copy.body;
  const notesHtml = copy.notes?.map((n) => `<p class="muted">${n}</p>`).join("") || "";

  return {
    subject: typeof copy.subject === "function" ? copy.subject() : copy.subject as string,
    html: `
      <!DOCTYPE html>
      <html>
      <head>${styles}</head>
      <body>
        <div class="wrapper">
          ${header}
          <div class="card">
            <h1 class="title">${copy.title}</h1>
            <p class="text">${cleanGreeting}</p>
            <p class="text">${bodyText}</p>
            <a href="${actionUrl}" class="button">${copy.cta}</a>
            ${notesHtml}
          </div>
          ${footer}
        </div>
      </body>
      </html>
    `,
  };
}

// Send email via Mailjet
async function sendMailjetEmail(
  to: string,
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
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: {
              Email: "notifications@kamanin.at",
              Name: "KAMANIN Portal",
            },
            To: [{ Email: to }],
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

    return { success: result.Messages?.[0]?.Status === "success" };
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
    const payload: AuthEmailPayload = await req.json();
    console.log("Auth email hook received:", payload.email_data.email_action_type);

    const { user, email_data } = payload;
    const { token_hash, redirect_to, email_action_type, site_url } = email_data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const actionUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to || site_url}`;

    const firstName = user.user_metadata?.full_name?.split(" ")[0];

    const { subject, html } = generateEmailHtml(email_action_type, actionUrl, firstName);

    const result = await sendMailjetEmail(user.email, subject, html);

    if (result.success) {
      console.log("Auth email sent successfully");
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      console.error("Failed to send auth email:", result.error);
      return new Response(
        JSON.stringify({
          error: {
            http_code: 500,
            message: result.error || "Failed to send email",
          },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Auth email hook error:", error);
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: "Internal server error",
        },
      }),
      {
        status: 500,
        headers: { ...defaultCorsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
