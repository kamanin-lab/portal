import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getEmailCopy } from "../_shared/emailCopy.ts";

const log = createLogger("resend-invite");

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mailjetApiKey = Deno.env.get("MAILJET_API_KEY");
  const mailjetSecretKey = Deno.env.get("MAILJET_API_SECRET");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !mailjetApiKey || !mailjetSecretKey) {
    log.error("Missing required env vars");
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Auth: verify caller
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Parse body
  let body: { memberId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const { memberId } = body;
  if (!memberId) {
    return new Response(
      JSON.stringify({ error: "Missing required field: memberId" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Step 1: Look up org_members row
  const { data: memberRow, error: memberError } = await supabaseAdmin
    .from("org_members")
    .select("organization_id, profile_id, invited_email, last_invite_sent_at")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !memberRow) {
    return new Response(
      JSON.stringify({ error: "Mitglied nicht gefunden" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { organization_id, profile_id, invited_email, last_invite_sent_at } = memberRow as {
    organization_id: string;
    profile_id: string;
    invited_email: string | null;
    last_invite_sent_at: string | null;
  };

  if (!invited_email) {
    return new Response(
      JSON.stringify({ error: "Keine Einladungs-E-Mail hinterlegt" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Step 2: Authorise — caller must be admin of the same organization
  const { data: callerRoleRow } = await supabaseAdmin
    .from("org_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", organization_id)
    .maybeSingle();

  if ((callerRoleRow as { role: string } | null)?.role !== "admin") {
    log.warn("Non-admin resend attempt blocked", { userId: user.id, organization_id });
    return new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Step 3: Check pending — user must NOT have signed in yet
  const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(profile_id);
  if (authUserError || !authUserData?.user) {
    log.error("Could not look up auth user", { profile_id });
    return new Response(
      JSON.stringify({ error: "Auth-Benutzer nicht gefunden" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (authUserData.user.last_sign_in_at) {
    return new Response(
      JSON.stringify({ error: "Mitglied ist bereits angemeldet." }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Step 4: 60s cooldown check against the snapshot from Step 1.
  // NOTE: earlier attempt used .or()+.select() for atomic reservation, but
  // that hits a PostgREST bug (cd1dbf9): any column inside .or() is reported
  // as "does not exist" when Prefer: return=representation is set — which
  // supabase-js adds automatically when .select() follows .update(). Since
  // resend is admin-triggered (not concurrent cron), the in-memory check
  // plus a plain post-send UPDATE is sufficient.
  if (last_invite_sent_at) {
    const elapsed = Date.now() - new Date(last_invite_sent_at).getTime();
    if (elapsed < 60_000) {
      return new Response(
        JSON.stringify({ error: "Bitte warten Sie einen Moment, bevor Sie erneut senden." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // Step 5: Generate fresh recovery link
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://portal.kamanin.at";
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: invited_email,
      options: { redirectTo: `${siteUrl}/einladung-annehmen` },
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    log.error("auth.admin.generateLink failed", { error: linkError?.message });
    return new Response(
      JSON.stringify({ error: "Recovery-Link konnte nicht erstellt werden" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const hashedToken = (linkData.properties as { hashed_token: string }).hashed_token;
  const recoveryUrl = `${siteUrl}/einladung-annehmen?token=${hashedToken}&type=recovery`;

  // Step 6: Send Mailjet email (same template as invite-member)
  const copy = getEmailCopy("invite", "de");
  const greeting = typeof copy.greeting === "function" ? copy.greeting() : copy.greeting;
  const bodyText = typeof copy.body === "string" ? copy.body : Array.isArray(copy.body) ? (copy.body as string[]).join("</p><p>") : (copy.body as () => string)();
  const ctaLabel = typeof copy.cta === "string" ? copy.cta : "Einladung annehmen";
  const notesHtml = (copy.notes ?? []).map((n) => `<p class="muted">${n}</p>`).join("");
  const logoUrl = "https://portal.kamanin.at/favicon.png";
  const styles = `<style>
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
  </style>`;
  const htmlPart = `<!DOCTYPE html><html><head>${styles}</head><body>
    <div class="wrapper">
      <div class="logo-section">
        <img src="${logoUrl}" alt="KAMANIN" width="50" height="50" style="height:50px;width:50px;display:block;" />
      </div>
      <div class="card">
        <h1 class="title">${copy.title}</h1>
        <p class="text">${greeting}</p>
        <p class="text">${bodyText}</p>
        <a href="${recoveryUrl}" class="button">${ctaLabel}</a>
        ${notesHtml}
      </div>
      <div class="footer"><p class="footer-text">KAMANIN Client Portal</p></div>
    </div></body></html>`;

  let emailSent = false;
  try {
    const mailjetResp = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${mailjetApiKey}:${mailjetSecretKey}`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: "noreply@kamanin.at", Name: "KAMANIN Portal" },
          To: [{ Email: invited_email }],
          Subject: typeof copy.subject === "string" ? copy.subject : "Einladung zum KAMANIN Portal",
          HTMLPart: htmlPart,
        }],
      }),
    });
    emailSent = mailjetResp.ok;
    if (!emailSent) {
      const errBody = await mailjetResp.text();
      log.error("Mailjet send failed", { status: mailjetResp.status, body: errBody });
    }
  } catch (e) {
    log.error("Mailjet fetch threw", { error: (e as Error).message });
    emailSent = false;
  }

  if (!emailSent) {
    return new Response(
      JSON.stringify({ error: "E-Mail konnte nicht gesendet werden" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Step 7: Update cooldown timestamp (plain UPDATE — see Step 4 note).
  await supabaseAdmin
    .from("org_members")
    .update({ last_invite_sent_at: new Date().toISOString() })
    .eq("id", memberId);

  log.info("Invite resent successfully", { memberId, organization_id });
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
