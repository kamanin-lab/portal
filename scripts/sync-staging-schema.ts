/**
 * sync-staging-schema.ts
 *
 * Dumps the production PostgreSQL schema (DDL only, no data) via SSH
 * and applies it to the Cloud Supabase staging project.
 *
 * Required in .env.local:
 *   SUPABASE_SERVER_HOST, SUPABASE_SERVER_USER, SUPABASE_SERVER_PORT
 *   SUPABASE_SSH_KEY            — path to private key file
 *   STAGING_DB_CONNECTION_STRING — postgresql://postgres.{ref}:{password}@...
 *
 * Usage:
 *   npx tsx scripts/sync-staging-schema.ts              # dump + apply
 *   npx tsx scripts/sync-staging-schema.ts --dump-only  # dump to ./staging-schema.sql only
 *   npx tsx scripts/sync-staging-schema.ts --apply-only # apply existing ./staging-schema.sql
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync, execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DUMP_ONLY = process.argv.includes("--dump-only");
const APPLY_ONLY = process.argv.includes("--apply-only");
const SCHEMA_FILE = resolve(__dirname, "..", "staging-schema.sql");
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
    console.error("ERROR: .env.local not found");
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

// ---------------------------------------------------------------------------
// SSH
// ---------------------------------------------------------------------------

function sshExec(env: Record<string, string>, cmd: string): string {
  const host = env.SUPABASE_SERVER_HOST;
  const user = env.SUPABASE_SERVER_USER;
  const port = env.SUPABASE_SERVER_PORT || "22";
  const key = env.SUPABASE_SSH_KEY;
  const sshCmd = `ssh -i "${key}" -p ${port} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${user}@${host} ${JSON.stringify(cmd)}`;
  return execSync(sshCmd, { encoding: "utf-8", timeout: 120000 });
}

// ---------------------------------------------------------------------------
// Find Postgres container on production server
// ---------------------------------------------------------------------------

function findPostgresContainer(env: Record<string, string>): string {
  console.log("→ Finding PostgreSQL container on production server...");

  // Try service-specific container first
  const candidates = sshExec(
    env,
    `docker ps --format '{{.ID}} {{.Names}}' | grep -iE 'supabase.*(db|postgres)|postgres.*supabase' | head -5`
  ).trim();

  const lines = candidates.split("\n").filter(Boolean);
  if (lines.length === 0) {
    // Fallback: any postgres container
    const fallback = sshExec(
      env,
      `docker ps --format '{{.ID}} {{.Names}}' | grep -i postgres | head -3`
    ).trim();
    const fallbackLines = fallback.split("\n").filter(Boolean);
    if (fallbackLines.length === 0) {
      console.error("ERROR: No PostgreSQL container found on production server.");
      console.error("Run this on the server to check:");
      console.error("  docker ps | grep -i postgres");
      process.exit(1);
    }
    lines.push(...fallbackLines);
  }

  const [containerId, containerName] = lines[0].trim().split(/\s+/);
  console.log(`✓ Using container: ${containerName} (${containerId})`);
  return containerId;
}

// ---------------------------------------------------------------------------
// Dump schema via pg_dump inside container
// ---------------------------------------------------------------------------

function dumpSchema(env: Record<string, string>): void {
  const containerId = findPostgresContainer(env);

  console.log("→ Dumping schema from production database...");

  // pg_dump: schema only, no ACL, no owner, no comments on extensions
  const dumpCmd =
    `docker exec ${containerId} pg_dump ` +
    `-U postgres ` +
    `--schema-only ` +
    `--no-acl ` +
    `--no-owner ` +
    `--no-comments ` +
    `--schema=public ` +
    `--schema=auth ` +
    `--schema=storage ` +
    `postgres 2>/dev/null`;

  const schemaSql = sshExec(env, dumpCmd);

  if (!schemaSql || schemaSql.length < 100) {
    console.error("ERROR: pg_dump returned empty output. Check container name and DB access.");
    process.exit(1);
  }

  // Prepend safety header
  const header =
    `-- staging-schema.sql\n` +
    `-- Generated: ${new Date().toISOString()}\n` +
    `-- Source: production portal.db.kamanin.at\n` +
    `-- WARNING: DDL only — no client data included\n\n` +
    `SET session_replication_role = replica; -- disable FK checks during import\n\n`;

  writeFileSync(SCHEMA_FILE, header + schemaSql, "utf-8");
  const sizeKb = Math.round(schemaSql.length / 1024);
  console.log(`✓ Schema dumped to staging-schema.sql (${sizeKb} KB)`);
}

// ---------------------------------------------------------------------------
// Apply schema to staging via psql
// ---------------------------------------------------------------------------

function applySchema(env: Record<string, string>): void {
  if (!existsSync(SCHEMA_FILE)) {
    console.error("ERROR: staging-schema.sql not found. Run without --apply-only first.");
    process.exit(1);
  }

  const connectionString = env.STAGING_DB_CONNECTION_STRING;
  if (!connectionString) {
    console.error(
      "ERROR: STAGING_DB_CONNECTION_STRING missing from .env.local\n" +
        "Get it from: Supabase Dashboard → Settings → Database → Connection String (URI mode)\n" +
        "Format: postgresql://postgres.{ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres"
    );
    process.exit(1);
  }

  console.log("→ Applying schema to staging Cloud Supabase...");

  // Check psql is available
  try {
    execSync("psql --version", { stdio: "pipe" });
  } catch {
    console.error("ERROR: psql not found. Install PostgreSQL client:");
    console.error("  https://www.postgresql.org/download/");
    process.exit(1);
  }

  try {
    execFileSync("psql", [connectionString, "-f", SCHEMA_FILE], {
      stdio: "inherit",
      timeout: 120000,
    });
    console.log("✓ Schema applied to staging database.");
  } catch (err) {
    console.error("ERROR: psql failed. Check connection string and try again.");
    console.error(err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const env = loadEnv();

  if (!APPLY_ONLY) {
    dumpSchema(env);
  }

  if (!DUMP_ONLY) {
    applySchema(env);
    console.log("\n✓ Schema migration complete.");
    console.log("\nNext: run secrets sync if you haven't yet:");
    console.log("  npx tsx scripts/sync-staging-secrets.ts");
  } else {
    console.log("\nSchema saved. To apply later:");
    console.log("  npx tsx scripts/sync-staging-schema.ts --apply-only");
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message ?? err);
  process.exit(1);
});
