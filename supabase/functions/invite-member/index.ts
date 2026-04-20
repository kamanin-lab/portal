// A1 resolved: no handle_new_user trigger found in supabase/migrations/ — manual profiles insert required
// grep -rn "handle_new_user|on_auth_user_created" supabase/migrations/ → 0 results
// grep -rn "TRIGGER.*auth.users" supabase/migrations/ → 0 results
// Therefore: invite-member MUST manually insert a profiles row after createUser

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getEmailCopy } from "../_shared/emailCopy.ts";

const log = createLogger("invite-member");

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
  let body: { organizationId?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const { organizationId, email, role } = body;
  if (!organizationId || !email || !role) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: organizationId, email, role" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // SECURITY: role validation — only known roles permitted
  if (role !== "member" && role !== "viewer" && role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Invalid role: must be 'admin', 'member', or 'viewer'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Admin role guard — caller must be admin of THIS specific organizationId
  const { data: callerRoleRow } = await supabaseAdmin
    .from("org_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if ((callerRoleRow as { role: string } | null)?.role !== "admin") {
    log.warn("Non-admin invite attempt blocked", { userId: user.id, organizationId });
    return new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Duplicate check: does a user with this email exist AND is already in THIS org?
  const normalizedEmail = email.toLowerCase().trim();
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingProfile) {
    const existingId = (existingProfile as { id: string }).id;
    const { data: existingMembership } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("profile_id", existingId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (existingMembership) {
      return new Response(
        JSON.stringify({ error: "Member already exists in organization" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // Create auth user (email_confirm=true — user will set password via recovery link)
  // If user already exists in auth (from a previous failed invite attempt), reuse them
  let newUser: { id: string };
  let userWasPreexisting = false;
  const { data: createData, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
    });
  if (createError) {
    if (createError.message.includes("already been registered") || createError.message.includes("already registered")) {
      // User exists in auth — look them up by email
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuthUser = listData?.users?.find((u) => u.email === normalizedEmail);
      if (listError || !existingAuthUser) {
        log.error("auth.admin.createUser failed and could not find existing user", { error: createError.message });
        return new Response(
          JSON.stringify({ error: "Failed to create user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      newUser = existingAuthUser;
      userWasPreexisting = true;
      log.info("Reusing existing auth user for invite", { userId: newUser.id });
    } else {
      log.error("auth.admin.createUser failed", { error: createError.message });
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else if (!createData?.user) {
    log.error("auth.admin.createUser returned no user");
    return new Response(
      JSON.stringify({ error: "Failed to create user" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } else {
    newUser = createData.user;
  }

  // Generate recovery link (GoTrue SMTP broken — we send our own email)
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo: `${Deno.env.get("SITE_URL") ?? "https://portal.kamanin.at"}/einladung-annehmen` },
    });
  if (linkError || !linkData?.properties?.hashed_token) {
    log.error("auth.admin.generateLink failed", { error: linkError?.message });
    if (!userWasPreexisting) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.id); // rollback only if we created them
    }
    return new Response(
      JSON.stringify({ error: "Failed to generate recovery link — invite rolled back" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  // Build recovery URL pointing directly to the frontend password-set page.
  // The frontend calls supabase.auth.verifyOtp({ token_hash, type: 'recovery' }) itself,
  // bypassing GoTrue's redirect entirely (GoTrue redirect always uses API_EXTERNAL_URL = portal.db.kamanin.at).
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://portal.kamanin.at";
  const hashedToken = (linkData.properties as { hashed_token: string }).hashed_token;
  const recoveryUrl = `${siteUrl}/einladung-annehmen?token=${hashedToken}&type=recovery`;

  // Send invite email via Mailjet — uses same HTML template as send-reminders
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
          To: [{ Email: normalizedEmail }],
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
    // Rollback: delete created user
    await supabaseAdmin.auth.admin.deleteUser(newUser.id);
    return new Response(
      JSON.stringify({ error: "Email send failed — invite rolled back" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // A1-conditional: manually insert profiles row — no handle_new_user trigger exists
  const { error: profileInsertError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: newUser.id,
      email: normalizedEmail,
      full_name: null,
    });
  if (profileInsertError) {
    // Profile may already exist (race) — ignore unique-violation
    if (!profileInsertError.message.includes("duplicate") && !profileInsertError.message.includes("unique")) {
      log.error("profiles insert failed after invite", { error: profileInsertError.message });
      // Do NOT rollback here — email was already sent; admin can recover manually
    }
  }

  // Insert org_members row
  const { error: memberInsertError } = await supabaseAdmin
    .from("org_members")
    .insert({
      organization_id: organizationId,
      profile_id: newUser.id,
      role,
      invited_email: normalizedEmail,
    });
  if (memberInsertError) {
    log.error("org_members insert failed", { error: memberInsertError.message });
    // Don't rollback auth user — email is out, user can log in even if we fix org_members manually
    return new Response(
      JSON.stringify({ error: "User created but org_members insert failed — contact support", userId: newUser.id }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Copy project_access rows from the org's first admin to the new member
  const { data: firstAdmin } = await supabaseAdmin
    .from("org_members")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (firstAdmin) {
    const adminProfileId = (firstAdmin as { profile_id: string }).profile_id;
    const { data: adminAccess } = await supabaseAdmin
      .from("project_access")
      .select("project_config_id")
      .eq("profile_id", adminProfileId);
    for (const row of adminAccess ?? []) {
      const projectConfigId = (row as { project_config_id: string }).project_config_id;
      await supabaseAdmin.from("project_access").insert({
        profile_id: newUser.id,
        project_config_id: projectConfigId,
      });
    }
  }

  log.info("Invite sent successfully", { newUserId: newUser.id, organizationId, role });
  return new Response(
    JSON.stringify({ success: true, userId: newUser.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
