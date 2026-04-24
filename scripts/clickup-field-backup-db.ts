/**
 * Portal DB → Backup
 *
 * Exports custom-field-derived values from portal DB into a restore-ready JSON.
 * Covers:
 *   - task_cache: credits, approved_credits, is_visible
 *   - project_task_cache: full custom_fields[] snapshot from raw_data
 *
 * Run: npx tsx scripts/clickup-field-backup-db.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
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
  if (!res.ok) {
    throw new Error(`SQL HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

interface TaskCacheRow {
  clickup_id: string;
  name: string;
  list_id: string | null;
  list_name: string | null;
  status: string | null;
  credits: string | null;
  approved_credits: string | null;
  is_visible: boolean | null;
}

interface ProjectTaskRow {
  clickup_task_id: string;
  task_name: string;
  list_id: string | null;
  custom_fields: Array<{ id: string; name?: string; value?: unknown }>;
}

async function main() {
  console.log("Portal DB → Field Backup");
  console.log("========================");
  console.log("");

  console.log("Fetching task_cache…");
  const tasks = await sql<TaskCacheRow>(
    `SELECT
       clickup_id,
       name,
       list_id,
       list_name,
       status,
       credits::text AS credits,
       approved_credits::text AS approved_credits,
       is_visible
     FROM task_cache
     WHERE credits IS NOT NULL OR approved_credits IS NOT NULL OR is_visible IS NOT NULL
     ORDER BY list_id, clickup_id`,
  );
  console.log(`  → ${tasks.length} rows`);

  const withCredits = tasks.filter((t) => t.credits !== null && Number(t.credits) > 0).length;
  const withApproved = tasks.filter((t) => t.approved_credits !== null).length;
  const withVisible = tasks.filter((t) => t.is_visible === true).length;

  console.log(`     credits > 0        : ${withCredits}`);
  console.log(`     approved_credits   : ${withApproved}`);
  console.log(`     is_visible = true  : ${withVisible}`);
  console.log("");

  console.log("Fetching project_task_cache…");
  const projectTasks = await sql<ProjectTaskRow>(
    `SELECT
       raw_data->>'id' AS clickup_task_id,
       raw_data->>'name' AS task_name,
       raw_data->'list'->>'id' AS list_id,
       raw_data->'custom_fields' AS custom_fields
     FROM project_task_cache
     WHERE raw_data->'custom_fields' IS NOT NULL
     ORDER BY list_id, clickup_task_id`,
  );
  console.log(`  → ${projectTasks.length} project steps with custom_fields snapshot`);

  const fieldInventory: Record<string, { name: string; count: number; with_value: number }> = {};
  for (const row of projectTasks) {
    for (const cf of row.custom_fields || []) {
      const key = cf.id;
      if (!fieldInventory[key]) {
        fieldInventory[key] = { name: cf.name || "(unnamed)", count: 0, with_value: 0 };
      }
      fieldInventory[key].count++;
      if (cf.value !== undefined && cf.value !== null && cf.value !== "") {
        fieldInventory[key].with_value++;
      }
    }
  }

  console.log("");
  console.log("Project-level custom fields inventory:");
  Object.entries(fieldInventory)
    .sort(([, a], [, b]) => b.with_value - a.with_value)
    .forEach(([id, info]) => {
      console.log(`  ${id}  ${info.name.padEnd(32)} ${info.with_value}/${info.count}`);
    });

  const today = new Date().toISOString().slice(0, 10);
  const outPath = resolve(process.cwd(), `scripts/clickup-field-backup-db-${today}.json`);

  const payload = {
    backup_date: new Date().toISOString(),
    source: "portal.db.kamanin.at",
    tables: ["task_cache", "project_task_cache"],
    legacy_field_ids: {
      visible: "b65224a5-aecd-446b-86e3-4fe0e8f757d8",
      credits: "10b036c4-7919-4065-976c-2e7791cd440a",
      estimate_required_old: "6d18a12b-01da-45d0-ae17-b83bee402e58",
      dev_estimate_hours: "996733c2-e7de-48e5-9157-6ea96180beed",
    },
    summary: {
      task_cache_rows: tasks.length,
      task_cache_with_credits: withCredits,
      task_cache_with_approved_credits: withApproved,
      task_cache_with_visible: withVisible,
      project_task_cache_rows: projectTasks.length,
      project_field_inventory: fieldInventory,
    },
    task_cache: tasks,
    project_task_cache: projectTasks,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log("");
  console.log(`Backup written → ${outPath}`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
