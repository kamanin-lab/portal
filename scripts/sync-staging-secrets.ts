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
// Keys that should be skipped (system vars, frontend-only, will be overridden)
// ---------------------------------------------------------------------------

const SKIP_KEYS = new Set([
  "HOME", "PATH", "HOSTNAME", "TERM", "SHELL", "LANG", "LC_ALL", "USER",
  "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_MEMORY_OPERATOR_EMAILS",
  // Overridden below with staging values:
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY",
  "JWT_SECRET", "CRON_SECRET",
]);

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

  // 2. Build final staging secrets
  const stagingVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(coolifyVars)) {
    if (!SKIP_KEYS.has(k) && !k.startsWith("VITE_")) {
      stagingVars[k] = v;
    }
  }

  // Override / add staging-specific values
  stagingVars["SUPABASE_URL"] = env.STAGING_SUPABASE_URL;
  stagingVars["SUPABASE_SERVICE_ROLE_KEY"] = env.STAGING_SERVICE_ROLE_KEY;
  stagingVars["SUPABASE_ANON_KEY"] = env.STAGING_ANON_KEY;
  stagingVars["JWT_SECRET"] = randomBytes(32).toString("hex");
  stagingVars["CRON_SECRET"] = randomBytes(32).toString("hex");

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
