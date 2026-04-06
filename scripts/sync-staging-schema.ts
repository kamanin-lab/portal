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
const SCHEMA_FILE = resolve(__dirname, "..", "staging-schema-public.sql");
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

  // pg_dump: public schema only (auth/storage are managed by Cloud Supabase)
  const dumpCmd =
    `docker exec ${containerId} pg_dump ` +
    `-U postgres ` +
    `--schema-only ` +
    `--no-acl ` +
    `--no-owner ` +
    `--no-comments ` +
    `--schema=public ` +
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
// SQL statement splitter that handles dollar-quoted strings ($$ ... $$)
// ---------------------------------------------------------------------------

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  let i = 0;

  while (i < sql.length) {
    // Detect dollar-quote open: $tag$ where tag is 0+ alphanumerics/underscores
    if (!inDollarQuote && sql[i] === "$") {
      const match = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (match) {
        dollarTag = match[0];
        inDollarQuote = true;
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (inDollarQuote) {
      // Detect matching closing dollar-quote
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        inDollarQuote = false;
        dollarTag = "";
        continue;
      }
    } else if (sql[i] === ";") {
      // Statement boundary (only when not in dollar quote)
      current += ";";
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed && trimmed !== ";") statements.push(trimmed);
  return statements;
}

// ---------------------------------------------------------------------------
// Apply schema to staging via Supabase Management API
// (no psql required — uses /v1/projects/{ref}/database/query)
// ---------------------------------------------------------------------------

async function applySchema(env: Record<string, string>): Promise<void> {
  if (!existsSync(SCHEMA_FILE)) {
    console.error(`ERROR: ${SCHEMA_FILE} not found. Run without --apply-only first.`);
    process.exit(1);
  }

  const projectRef = env.STAGING_PROJECT_REF;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  if (!projectRef || !accessToken) {
    console.error("ERROR: STAGING_PROJECT_REF and SUPABASE_ACCESS_TOKEN required in .env.local");
    process.exit(1);
  }

  const fullSql = readFileSync(SCHEMA_FILE, "utf-8");
  console.log(`→ Applying schema to staging via Management API (${Math.round(fullSql.length / 1024)} KB)...`);

  // Strip single-line comments (pg_dump section headers contain semicolons that fool the parser)
  // e.g. -- Name: public; Type: SCHEMA; Schema: -; Owner: -
  const strippedSql = fullSql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  // Split into individual statements, handling dollar-quoted strings properly
  const statements = splitSqlStatements(strippedSql)
    .filter((s) => s.trim().length > 0);

  console.log(`  Running ${statements.length} statements...`);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function runQuery(query: string): Promise<{ ok: boolean; body: string; status: number }> {
    const q = query.endsWith(";") ? query : query + ";";
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: q }),
      }
    );
    const body = await res.text();
    return { ok: res.ok, body, status: res.status };
  }

  let applied = 0;
  let skipped = 0;
  let errors = 0;
  const failed: string[] = [];

  // Pass 1: apply all statements with 120ms delay to avoid rate limiting
  for (const stmt of statements) {
    await delay(120);
    try {
      const { ok, body, status } = await runQuery(stmt);
      if (ok) {
        applied++;
      } else if (
        body.includes("already exists") ||
        body.includes("duplicate") ||
        body.includes("42710")
      ) {
        skipped++;
      } else if (status === 429) {
        // Rate limited — queue for retry
        failed.push(stmt);
      } else {
        // Dependency error (table not yet created) — queue for pass 2
        failed.push(stmt);
      }
    } catch (e) {
      failed.push(stmt);
    }
  }

  // Pass 2: retry failed statements (dependency ordering + rate limit retries)
  if (failed.length > 0) {
    console.log(`  Retrying ${failed.length} failed statements...`);
    await delay(2000);
    for (const stmt of failed) {
      await delay(200);
      try {
        const { ok, body } = await runQuery(stmt);
        if (ok) {
          applied++;
        } else if (
          body.includes("already exists") ||
          body.includes("duplicate") ||
          body.includes("42710")
        ) {
          skipped++;
        } else {
          console.error(`  ERR: ${body.slice(0, 150)}`);
          errors++;
        }
      } catch (e) {
        console.error(`  ERR: ${(e as Error).message}`);
        errors++;
      }
    }
  }

  console.log(`✓ Schema applied: ${applied} ok, ${skipped} skipped (already exists), ${errors} errors`);
  if (errors > 5) {
    console.warn("Some errors remain — check staging Supabase Studio to verify tables exist.");
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
    await applySchema(env);
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
