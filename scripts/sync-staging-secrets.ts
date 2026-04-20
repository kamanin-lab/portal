/**
 * sync-staging-secrets.ts
 *
 * Reads Edge Function env vars from the Coolify production server via SSH,
 * replaces Supabase-specific values with staging equivalents,
 * and pushes all secrets to the Cloud Supabase staging project.
 *
 * Required in .env.local:
 *   SUPABASE_SERVER_HOST, SUPABASE_SERVER_USER, SUPABASE_SERVER_PORT
 *   SUPABASE_SSH_KEY       — path to private key file
 *   STAGING_SUPABASE_URL   — https://xxx.supabase.co
 *   STAGING_SERVICE_ROLE_KEY
 *   STAGING_ANON_KEY
 *   STAGING_PROJECT_REF    — short project ID
 *   SUPABASE_ACCESS_TOKEN  — personal access token from supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   npx tsx scripts/sync-staging-secrets.ts           # push to staging
 *   npx tsx scripts/sync-staging-secrets.ts --dry-run # preview only
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DRY_RUN = process.argv.includes("--dry-run");
const COOLIFY_SERVICE_ID = "ngkk4c4gsc0kw8wccw0cc04s";

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, "..", ".env.local");
  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    console.error("ERROR: .env.local not found at", envPath);
    process.exit(1);
  }
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

function requireVars(vars: Record<string, string>, ...keys: string[]): void {
  const missing = keys.filter((k) => !vars[k]);
  if (missing.length > 0) {
    console.error("ERROR: Missing required vars in .env.local:", missing.join(", "));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// SSH execution
// ---------------------------------------------------------------------------

function sshExec(env: Record<string, string>, cmd: string): string {
  const host = env.SUPABASE_SERVER_HOST;
  const user = env.SUPABASE_SERVER_USER;
  const port = env.SUPABASE_SERVER_PORT || "22";
  const key = env.SUPABASE_SSH_KEY;
  const sshCmd = `ssh -i "${key}" -p ${port} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${user}@${host} ${JSON.stringify(cmd)}`;
  return execSync(sshCmd, { encoding: "utf-8", timeout: 30000 });
}

// ---------------------------------------------------------------------------
// Read Coolify env vars via SSH
// ---------------------------------------------------------------------------

function parseEnvContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    if (key) vars[key] = value;
  }
  return vars;
}

function readCoolifyEnv(env: Record<string, string>): Record<string, string> {
  console.log("→ Connecting to Coolify server via SSH...");

  // Approach 1: look for .env file in known service paths
  const candidatePaths = [
    `/data/coolify/services/${COOLIFY_SERVICE_ID}/.env`,
    `/data/coolify/services/${COOLIFY_SERVICE_ID}/volumes/functions/.env`,
    `/data/coolify/services/${COOLIFY_SERVICE_ID}/volumes/storage/.env`,
  ];

  for (const path of candidatePaths) {
    try {
      const output = sshExec(
        env,
        `[ -f "${path}" ] && cat "${path}" && echo __ENVFOUND__ || echo __NOTFOUND__`
      );
      if (output.includes("__ENVFOUND__")) {
        const content = output.replace(/__ENVFOUND__.*$/s, "").trim();
        const vars = parseEnvContent(content);
        if (Object.keys(vars).length >= 3) {
          console.log(`✓ Found ${Object.keys(vars).length} env vars at ${path}`);
          return vars;
        }
      }
    } catch {
      // continue
    }
  }

  // Approach 2: docker inspect on the edge-runtime container
  console.log("  .env not found in service dir — trying docker inspect...");
  try {
    const containerQuery = sshExec(
      env,
      `docker ps --format '{{.ID}} {{.Names}}' | grep -i 'edge\\|supabase' | head -5`
    ).trim();

    for (const line of containerQuery.split("\n")) {
      const [id, name] = line.trim().split(/\s+/);
      if (!id || !name?.toLowerCase().includes("edge")) continue;

      const rawJson = sshExec(env, `docker inspect ${id} 2>/dev/null`);
      const data = JSON.parse(rawJson);
      const envArray: string[] = data?.[0]?.Config?.Env ?? [];
      const vars: Record<string, string> = {};
      for (const entry of envArray) {
        const eq = entry.indexOf("=");
        if (eq === -1) continue;
        vars[entry.slice(0, eq)] = entry.slice(eq + 1);
      }
      if (Object.keys(vars).length >= 3) {
        console.log(`✓ Found ${Object.keys(vars).length} env vars via docker inspect (${name})`);
        return vars;
      }
    }
  } catch {
    // fall through
  }

  // Approach 3: list service dir and fail with helpful message
  try {
    const listing = sshExec(
      env,
      `ls -la /data/coolify/services/${COOLIFY_SERVICE_ID}/ 2>/dev/null || echo "(not accessible)"`
    );
    console.error("\nERROR: Could not auto-read env vars from Coolify.");
    console.error("Service directory contents:");
    console.error(listing);
    console.error(
      "\nManual fallback: copy the Edge Function env vars to .env.local with prefix COOLIFY_KEY=value\n" +
        "and re-run with --from-local flag (not yet implemented)."
    );
  } catch {
    console.error("\nERROR: Could not connect to Coolify server or read env vars.");
  }

  process.exit(1);
}

// ---------------------------------------------------------------------------
// Disable verify_jwt on all staging Edge Functions
// Cloud Supabase uses ES256 JWT — gateway verify_jwt must be false.
// Functions still enforce auth internally via supabase.auth.getUser().
// ---------------------------------------------------------------------------

async function disableVerifyJwt(
  projectRef: string,
  accessToken: string
): Promise<void> {
  // List all deployed functions
  const listRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/functions`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    console.warn("  ⚠ Could not list functions to disable verify_jwt");
    return;
  }
  const functions: Array<{ slug: string }> = await listRes.json();

  let ok = 0;
  for (const fn of functions) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/functions/${fn.slug}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verify_jwt: false }),
      }
    );
    if (res.ok) ok++;
    else console.warn(`  ⚠ Could not set verify_jwt=false on ${fn.slug}`);
  }
  console.log(`  ✓ verify_jwt=false set on ${ok}/${functions.length} functions`);
}

// ---------------------------------------------------------------------------
// Push secrets to Supabase Management API
// ---------------------------------------------------------------------------

async function pushSecrets(
  secrets: Array<{ name: string; value: string }>,
  projectRef: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(secrets),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`ERROR: Supabase API ${res.status}: ${body}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Allow-list: only these Edge Function vars are pushed to staging.
// Coolify has 130+ infrastructure vars — we only want the 18 app-level ones.
// "override" = replace with staging value; "copy" = take from Coolify as-is.
// ---------------------------------------------------------------------------

const EDGE_FUNCTION_VARS: Array<{ name: string; action: "override" | "copy" | "generate" | "skip" }> = [
  // NOTE: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY are
  // automatically injected by Cloud Supabase — cannot be set via Management API.
  // Security tokens — generate fresh for staging
  { name: "JWT_SECRET",                action: "generate" },
  { name: "CRON_SECRET",               action: "generate" },
  // ClickUp — copy from production
  { name: "CLICKUP_API_TOKEN",         action: "copy" },
  { name: "CLICKUP_WORKSPACE_ID",      action: "copy" },
  // CLICKUP_WEBHOOK_SECRET: ClickUp issues a different secret per webhook
  // registration — prod webhook and staging webhook have DISTINCT secrets.
  // Do NOT copy from prod. Fetch staging's actual secret from ClickUp API
  // (GET /team/{id}/webhook → find endpoint containing "ahlthosftngdcryltapu").
  { name: "CLICKUP_WEBHOOK_SECRET",    action: "skip" },
  { name: "CLICKUP_CREDITS_FIELD_ID",  action: "copy" },
  { name: "CLICKUP_VISIBLE_FIELD_ID",  action: "copy" },
  // Email — copy from production
  { name: "MAILJET_API_KEY",           action: "copy" },
  { name: "MAILJET_API_SECRET",        action: "copy" },
  // Nextcloud — copy from production
  { name: "NEXTCLOUD_URL",             action: "copy" },
  { name: "NEXTCLOUD_USER",            action: "copy" },
  { name: "NEXTCLOUD_PASS",            action: "copy" },
  // AI
  { name: "ANTHROPIC_API_KEY",         action: "copy" }, // used by fetch-project-tasks
  // NOTE: FUNCTIONS_VERIFY_JWT intentionally omitted.
  // Cloud Supabase uses ES256 JWT — verify_jwt must be set to false via
  // Management API per-function (see post-deploy step below).
  // Optional — only set if present in Coolify
  { name: "PROJECT_MEMORY_OPERATOR_EMAILS", action: "copy" },
  { name: "OPENROUTER_API_KEY",        action: "copy" },
  // Triage Agent
  { name: "TRIAGE_ENABLED_LIST_IDS",   action: "copy" },
  { name: "WP_MCP_USER",               action: "copy" },
  { name: "WP_MCP_APP_PASS",           action: "copy" },
  // Auth email hook — needs to point to staging
  { name: "GOTRUE_HOOK_SEND_EMAIL_URI", action: "override" },
];

function maskValue(name: string, value: string): string {
  const isSensitive =
    name.includes("KEY") ||
    name.includes("SECRET") ||
    name.includes("TOKEN") ||
    name.includes("PASS") ||
    name.includes("PASSWORD");
  if (!isSensitive || value.length < 12) return value;
  return value.slice(0, 8) + "..." + value.slice(-4);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const env = loadEnv();

  requireVars(
    env,
    "SUPABASE_SERVER_HOST",
    "SUPABASE_SERVER_USER",
    "SUPABASE_SSH_KEY",
    "STAGING_SUPABASE_URL",
    "STAGING_SERVICE_ROLE_KEY",
    "STAGING_ANON_KEY",
    "STAGING_PROJECT_REF",
    "SUPABASE_ACCESS_TOKEN"
  );

  // 1. Read env vars from Coolify via SSH
  const coolifyVars = readCoolifyEnv(env);

  // 2. Build staging secrets using allow-list only
  const stagingVars: Record<string, string> = {};

  for (const { name, action } of EDGE_FUNCTION_VARS) {
    if (action === "override") {
      if (name === "GOTRUE_HOOK_SEND_EMAIL_URI") {
        // Point auth email hook to staging Edge Function
        stagingVars[name] = `${env.STAGING_SUPABASE_URL}/functions/v1/auth-email`;
      }
    } else if (action === "generate") {
      stagingVars[name] = randomBytes(32).toString("hex");
    } else if (action === "copy") {
      const val = coolifyVars[name];
      if (val !== undefined) {
        stagingVars[name] = val;
      }
      // if not in Coolify, skip silently
    } else if (action === "skip") {
      // Intentionally not synced from prod — staging has its own value.
      // See comments next to each entry for the reason.
    }
  }

  const secrets = Object.entries(stagingVars).map(([name, value]) => ({ name, value }));

  // 3. Preview
  console.log("\n→ Secrets to be set on staging project:");
  const col = Math.max(...secrets.map((s) => s.name.length)) + 2;
  for (const { name, value } of secrets) {
    console.log(`  ${name.padEnd(col)} ${maskValue(name, value)}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log("[DRY RUN] Not pushing to staging. Remove --dry-run to apply.");
    return;
  }

  // 4. Push to Supabase
  console.log(
    `→ Pushing ${secrets.length} secrets to staging project ${env.STAGING_PROJECT_REF}...`
  );
  await pushSecrets(secrets, env.STAGING_PROJECT_REF, env.SUPABASE_ACCESS_TOKEN);

  // 5. Disable verify_jwt on all functions (ES256 JWT compatibility)
  console.log("\n→ Disabling verify_jwt on all staging Edge Functions...");
  await disableVerifyJwt(env.STAGING_PROJECT_REF, env.SUPABASE_ACCESS_TOKEN);

  console.log(`\n✓ Done! ${secrets.length} secrets set on staging project.`);
  console.log("\nNext steps:");
  console.log(`  npx tsx scripts/sync-staging-schema.ts    # migrate DB schema`);
  console.log(`  supabase link --project-ref ${env.STAGING_PROJECT_REF}`);
  console.log(`  supabase functions deploy                  # deploy Edge Functions`);
}

main().catch((err) => {
  console.error("FATAL:", err.message ?? err);
  process.exit(1);
});
