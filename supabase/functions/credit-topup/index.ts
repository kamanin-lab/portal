import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("credit-topup", requestId);

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // This function is protected by service role key only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.error("Missing authorization header");
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      log.error("Missing required server configuration");
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", message: "Service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is using the service role key
    const token = authHeader.replace("Bearer ", "");
    if (token !== supabaseServiceKey) {
      log.error("Unauthorized: not service role key");
      return new Response(
        JSON.stringify({ ok: false, code: "FORBIDDEN", message: "Service role key required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optional: allow month override via body
    // Uses numeric YYYY-MM format internally to avoid locale-dependent month parsing
    let targetYear: number;
    let targetMonthIndex: number; // 0-indexed (0 = January)
    try {
      const body = await req.text();
      if (body) {
        const parsed = JSON.parse(body);
        // Accept { month: "2026-03" } or use current month
        if (parsed.month && /^\d{4}-\d{2}$/.test(parsed.month)) {
          const [y, m] = parsed.month.split("-").map(Number);
          targetYear = y;
          targetMonthIndex = m - 1; // convert 1-indexed to 0-indexed
        } else {
          const now = new Date();
          targetYear = now.getUTCFullYear();
          targetMonthIndex = now.getUTCMonth();
        }
      } else {
        const now = new Date();
        targetYear = now.getUTCFullYear();
        targetMonthIndex = now.getUTCMonth();
      }
    } catch {
      const now = new Date();
      targetYear = now.getUTCFullYear();
      targetMonthIndex = now.getUTCMonth();
    }

    const targetLabel = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}`;
    log.info("Starting monthly credit top-up", { month: targetLabel, year: targetYear });

    // Get all active credit packages (org-scoped since Phase 13 dropped profile_id)
    const { data: packages, error: pkgError } = await supabase
      .from("credit_packages")
      .select("id, organization_id, package_name, credits_per_month")
      .eq("is_active", true);

    if (pkgError) {
      log.error("Failed to fetch credit packages", { error: pkgError.message });
      return new Response(
        JSON.stringify({ ok: false, code: "DB_ERROR", message: "Failed to fetch packages" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!packages || packages.length === 0) {
      log.info("No active credit packages found");
      return new Response(
        JSON.stringify({ ok: true, code: "NO_PACKAGES", message: "No active packages", toppedUp: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const description = `${targetLabel} Gutschrift`;
    const toppedUp: string[] = [];

    for (const pkg of packages) {
      // Idempotency: check if monthly_topup already exists for this org this month
      const monthStart = new Date(Date.UTC(targetYear, targetMonthIndex, 1)).toISOString();
      const monthEnd = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 1)).toISOString();

      const { data: existing } = await supabase
        .from("credit_transactions")
        .select("id")
        .eq("organization_id", pkg.organization_id)
        .eq("type", "monthly_topup")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd)
        .limit(1);

      if (existing && existing.length > 0) {
        log.info("Monthly top-up already exists, skipping", { packageName: pkg.package_name });
        continue;
      }

      // credit_transactions.profile_id is NOT NULL for audit trail. monthly_topup
      // isn't triggered by a user action — pick an admin of the org as the actor.
      const { data: adminMember } = await supabase
        .from("org_members")
        .select("profile_id")
        .eq("organization_id", pkg.organization_id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (!adminMember) {
        log.error("No admin member found for org — cannot attribute monthly_topup", {
          organizationId: pkg.organization_id,
          packageName: pkg.package_name,
        });
        continue;
      }

      const { error: insertError } = await supabase
        .from("credit_transactions")
        .insert({
          profile_id: adminMember.profile_id,
          organization_id: pkg.organization_id,
          amount: pkg.credits_per_month,
          type: "monthly_topup",
          description,
        });

      if (insertError) {
        log.error("Failed to insert top-up transaction", { error: insertError.message });
      } else {
        toppedUp.push(pkg.package_name);
        log.info("Top-up inserted", { packageName: pkg.package_name, amount: pkg.credits_per_month });
      }
    }

    log.info("Monthly top-up complete", { toppedUpCount: toppedUp.length });

    return new Response(
      JSON.stringify({
        ok: true,
        code: "SUCCESS",
        message: `Topped up ${toppedUp.length} package(s)`,
        correlationId: requestId,
        toppedUp,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Function error", { error: (error as Error).message });
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", message: "An error occurred" }),
      { status: 500, headers: { ...defaultCorsHeaders, "Content-Type": "application/json" } }
    );
  }
});
