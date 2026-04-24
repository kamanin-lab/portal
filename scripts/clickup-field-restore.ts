/**
 * ClickUp Custom Field Restore
 *
 * Pushes Credits + Visible values from portal DB into new ClickUp fields.
 * Source of truth: task_cache.credits + task_cache.is_visible
 *
 * Dry-run by default. Pass `--apply` to actually write.
 *
 * Usage:
 *   npx tsx scripts/clickup-field-restore.ts              # dry-run
 *   npx tsx scripts/clickup-field-restore.ts --apply      # real writes
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.argv.includes("--apply");

const ENV_PATH = resolve(process.cwd(), ".env.local");
const envText = readFileSync(ENV_PATH, "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }),
);

const TOKEN = env.CLICKUP_API_TOKEN;
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: CLICKUP_API_TOKEN / VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const NEW_CREDITS_FIELD = "c2b88f91-688d-4e69-9bdf-b2cdfd1d14ac";
const NEW_VISIBLE_FIELD = "0c9f0f48-85f4-4864-861d-a4c9799c6930";

// Throttle: ClickUp allows ~100 req/min per token. Stay well under.
const DELAY_MS = 600;

interface TaskRow {
  clickup_id: string;
  list_id: string | null;
  credits: string | null;
  is_visible: boolean | null;
}

async function sql<T = unknown>(query: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function postFieldValue(
  taskId: string,
  fieldId: string,
  value: unknown,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`,
    {
      method: "POST",
      headers: { Authorization: TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  if (res.ok) return { ok: true, status: res.status };
  const body = await res.text();
  return { ok: false, status: res.status, error: body.slice(0, 200) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const mode = APPLY ? "APPLY (writes to ClickUp)" : "DRY-RUN (read-only)";
  console.log(`ClickUp Custom Field Restore — ${mode}`);
  console.log("===========================================");
  console.log(`Credits field  → ${NEW_CREDITS_FIELD}`);
  console.log(`Visible field  → ${NEW_VISIBLE_FIELD}`);
  console.log("");

  // Dedupe: task_cache has one row per (clickup_id, profile_id).
  // Take the freshest sync per clickup_id — use last_synced DESC, then prefer rows with non-null credits.
  const rows = await sql<TaskRow>(
    `SELECT DISTINCT ON (clickup_id)
       clickup_id, list_id, credits::text AS credits, is_visible
     FROM task_cache
     WHERE clickup_id IS NOT NULL
     ORDER BY clickup_id,
       (credits IS NOT NULL) DESC,
       last_synced DESC NULLS LAST,
       created_at DESC NULLS LAST`,
  );

  // Also include project steps (project_task_cache) for Visible only — Credits field not attached to project lists
  const projectRows = await sql<TaskRow>(
    `SELECT DISTINCT ON (raw_data->>'id')
       raw_data->>'id' AS clickup_id,
       raw_data->'list'->>'id' AS list_id,
       NULL AS credits,
       is_visible
     FROM project_task_cache
     WHERE raw_data->>'id' IS NOT NULL
     ORDER BY raw_data->>'id', created_at DESC NULLS LAST`,
  );

  const creditsWrites = rows.filter((r) => r.credits !== null && Number(r.credits) > 0);
  const visibleTrueWrites = [
    ...rows.filter((r) => r.is_visible === true),
    ...projectRows.filter((r) => r.is_visible === true),
  ];
  const visibleFalseWrites = [
    ...rows.filter((r) => r.is_visible === false),
    ...projectRows.filter((r) => r.is_visible === false),
  ];

  console.log(`Source: task_cache (${rows.length} unique) + project_task_cache (${projectRows.length} unique)`);
  console.log(`  Credits to write (value > 0) : ${creditsWrites.length}`);
  console.log(`  Visible=true to write        : ${visibleTrueWrites.length}`);
  console.log(`  Visible=false to write       : ${visibleFalseWrites.length}`);
  console.log(`  Total POST calls             : ${creditsWrites.length + visibleTrueWrites.length + visibleFalseWrites.length}`);
  console.log("");

  const eta = Math.round(
    ((creditsWrites.length + visibleTrueWrites.length + visibleFalseWrites.length) * DELAY_MS) / 1000,
  );
  console.log(`ETA (with ${DELAY_MS}ms throttle): ~${eta}s (${Math.round(eta / 60)} min)`);
  console.log("");

  if (!APPLY) {
    console.log("Sample writes (dry-run preview):");
    console.log("");
    const sample = [
      ...creditsWrites.slice(0, 3).map((r) => ({
        task: r.clickup_id,
        list: r.list_id,
        field: "Credits",
        fieldId: NEW_CREDITS_FIELD,
        value: Number(r.credits),
      })),
      ...visibleTrueWrites.slice(0, 3).map((r) => ({
        task: r.clickup_id,
        list: r.list_id,
        field: "Visible",
        fieldId: NEW_VISIBLE_FIELD,
        value: true,
      })),
      ...visibleFalseWrites.slice(0, 2).map((r) => ({
        task: r.clickup_id,
        list: r.list_id,
        field: "Visible",
        fieldId: NEW_VISIBLE_FIELD,
        value: false,
      })),
    ];
    sample.forEach((s) =>
      console.log(
        `  POST /task/${s.task}/field/${s.fieldId.slice(0, 8)}…  {value: ${JSON.stringify(s.value)}}  (${s.field}, list ${s.list})`,
      ),
    );
    console.log("");
    console.log("Re-run with --apply to execute.");
    return;
  }

  console.log("Starting writes…");
  console.log("");

  const stats = {
    creditsOk: 0,
    creditsFail: 0,
    visibleOk: 0,
    visibleFail: 0,
    failures: [] as Array<{ task: string; field: string; status: number; error?: string }>,
  };

  let n = 0;
  const total = creditsWrites.length + visibleTrueWrites.length + visibleFalseWrites.length;

  for (const row of creditsWrites) {
    n++;
    const res = await postFieldValue(row.clickup_id, NEW_CREDITS_FIELD, Number(row.credits));
    if (res.ok) stats.creditsOk++;
    else {
      stats.creditsFail++;
      stats.failures.push({
        task: row.clickup_id,
        field: `Credits=${row.credits}`,
        status: res.status,
        error: res.error,
      });
    }
    if (n % 20 === 0 || !res.ok) {
      console.log(`  [${n}/${total}] Credits ${row.clickup_id} → ${res.ok ? "OK" : `FAIL ${res.status}`}`);
    }
    await sleep(DELAY_MS);
  }

  for (const row of [...visibleTrueWrites, ...visibleFalseWrites]) {
    n++;
    const value = row.is_visible === true;
    const res = await postFieldValue(row.clickup_id, NEW_VISIBLE_FIELD, value);
    if (res.ok) stats.visibleOk++;
    else {
      stats.visibleFail++;
      stats.failures.push({
        task: row.clickup_id,
        field: `Visible=${value}`,
        status: res.status,
        error: res.error,
      });
    }
    if (n % 50 === 0 || !res.ok) {
      console.log(`  [${n}/${total}] Visible=${value} ${row.clickup_id} → ${res.ok ? "OK" : `FAIL ${res.status}`}`);
    }
    await sleep(DELAY_MS);
  }

  console.log("");
  console.log("=== Results ===");
  console.log(`Credits: ${stats.creditsOk} ok / ${stats.creditsFail} fail`);
  console.log(`Visible: ${stats.visibleOk} ok / ${stats.visibleFail} fail`);
  if (stats.failures.length > 0) {
    console.log("");
    console.log(`Failures (${stats.failures.length}):`);
    stats.failures.slice(0, 20).forEach((f) =>
      console.log(`  ${f.task} ${f.field} → HTTP ${f.status} ${f.error || ""}`),
    );
    if (stats.failures.length > 20) console.log(`  … +${stats.failures.length - 20} more`);
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
