/**
 * ClickUp Custom Field Backup
 *
 * Snapshots current values of 4 custom fields across all portal-relevant lists.
 * Writes JSON to scripts/clickup-field-backup-{date}.json for later restore.
 *
 * Run: npx tsx scripts/clickup-field-backup.ts
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

const TOKEN = env.CLICKUP_API_TOKEN;
if (!TOKEN) {
  console.error("Missing CLICKUP_API_TOKEN in .env.local");
  process.exit(1);
}

const FIELD_IDS = {
  visible: "b65224a5-aecd-446b-86e3-4fe0e8f757d8",
  credits: "10b036c4-7919-4065-976c-2e7791cd440a",
  dev_estimate_hours: "996733c2-e7de-48e5-9157-6ea96180beed",
  estimate_required: "6d18a12b-01da-45d0-ae17-b83bee402e58",
} as const;

const LISTS: Array<{ id: string; label: string }> = [
  { id: "901519301126", label: "MBM – Tasks" },
  { id: "901520327531", label: "Test – Tasks" },
  { id: "901522278319", label: "SF – Tasks" },
  { id: "901522581170", label: "HP – Tasks" },
  { id: "901522786729", label: "IT-Migration (KMCG)" },
  { id: "901522832965", label: "MBM Blog" },
  { id: "901522480420", label: "Helferportal" },
  { id: "901521694940", label: "(from user: unknown list)" },
];

interface ClickUpTask {
  id: string;
  name: string;
  list?: { id: string };
  status?: { status: string };
  custom_fields?: Array<{ id: string; name?: string; value?: unknown }>;
}

interface BackupRecord {
  task_id: string;
  task_name: string;
  list_id: string;
  list_label: string;
  status: string | null;
  fields: {
    visible: unknown | null;
    credits: unknown | null;
    dev_estimate_hours: unknown | null;
    estimate_required: unknown | null;
  };
}

async function fetchTasksForList(listId: string): Promise<ClickUpTask[]> {
  const all: ClickUpTask[] = [];
  let page = 0;
  while (true) {
    const url = `https://api.clickup.com/api/v2/list/${listId}/task?page=${page}&include_closed=true&subtasks=true`;
    const res = await fetch(url, { headers: { Authorization: TOKEN } });
    if (!res.ok) {
      console.error(`  ✗ list ${listId} page ${page}: HTTP ${res.status}`);
      const body = await res.text();
      console.error(`    ${body.slice(0, 200)}`);
      break;
    }
    const data = (await res.json()) as { tasks?: ClickUpTask[]; last_page?: boolean };
    const tasks = data.tasks || [];
    all.push(...tasks);
    if (tasks.length === 0 || data.last_page === true || tasks.length < 100) break;
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }
  return all;
}

function extractFieldValue(task: ClickUpTask, fieldId: string): unknown | null {
  const f = task.custom_fields?.find((cf) => cf.id === fieldId);
  if (!f || f.value === undefined || f.value === null || f.value === "") return null;
  return f.value;
}

async function main() {
  console.log("ClickUp Custom Field Backup");
  console.log("===========================");
  console.log(`Lists to scan: ${LISTS.length}`);
  console.log(`Fields tracked: ${Object.keys(FIELD_IDS).join(", ")}`);
  console.log("");

  const records: BackupRecord[] = [];
  const listSummary: Record<string, { label: string; total: number; with_any_value: number }> = {};

  for (const { id: listId, label } of LISTS) {
    process.stdout.write(`List ${listId} (${label}): fetching… `);
    const tasks = await fetchTasksForList(listId);
    let withAny = 0;
    for (const task of tasks) {
      const rec: BackupRecord = {
        task_id: task.id,
        task_name: task.name,
        list_id: task.list?.id || listId,
        list_label: label,
        status: task.status?.status || null,
        fields: {
          visible: extractFieldValue(task, FIELD_IDS.visible),
          credits: extractFieldValue(task, FIELD_IDS.credits),
          dev_estimate_hours: extractFieldValue(task, FIELD_IDS.dev_estimate_hours),
          estimate_required: extractFieldValue(task, FIELD_IDS.estimate_required),
        },
      };
      if (Object.values(rec.fields).some((v) => v !== null)) withAny++;
      records.push(rec);
    }
    listSummary[listId] = { label, total: tasks.length, with_any_value: withAny };
    console.log(`${tasks.length} tasks (${withAny} with ≥1 tracked value)`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const outPath = resolve(process.cwd(), `scripts/clickup-field-backup-${today}.json`);

  const byField = {
    visible: records.filter((r) => r.fields.visible !== null).length,
    credits: records.filter((r) => r.fields.credits !== null).length,
    dev_estimate_hours: records.filter((r) => r.fields.dev_estimate_hours !== null).length,
    estimate_required: records.filter((r) => r.fields.estimate_required !== null).length,
  };

  const payload = {
    backup_date: new Date().toISOString(),
    field_ids: FIELD_IDS,
    summary_by_list: listSummary,
    summary_by_field: byField,
    total_tasks: records.length,
    records,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log("");
  console.log("=== Totals ===");
  console.log(`Tasks scanned     : ${records.length}`);
  console.log(`Visible set       : ${byField.visible}`);
  console.log(`Credits set       : ${byField.credits}`);
  console.log(`Dev Estimate set  : ${byField.dev_estimate_hours}`);
  console.log(`Estimate Required : ${byField.estimate_required} (expected 0 — field deleted)`);
  console.log("");
  console.log(`Backup written → ${outPath}`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
