/**
 * manage-users.ts
 *
 * User management utility for prod → staging migration and production cleanup.
 *
 * Usage:
 *   npx tsx scripts/manage-users.ts --copy-to-staging <user_id>
 *   npx tsx scripts/manage-users.ts --delete-from-prod <user_id> [<user_id2> ...]
 *   npx tsx scripts/manage-users.ts --copy-to-staging <uid> --delete-from-prod <uid2> <uid3>
 *
 * Requires in .env.local:
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (production)
 *   STAGING_SUPABASE_URL, STAGING_SERVICE_ROLE_KEY  (staging)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
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

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ---------------------------------------------------------------------------
// Tables with profile_id (order matters for deletion — no-cascade first)
// ---------------------------------------------------------------------------

// Tables that do NOT have ON DELETE CASCADE from profiles
const NON_CASCADE_TABLES = [
  "task_cache",
  "comment_cache",
  "notifications",
  "read_receipts",
  "support_messages",
  "project_access",
  "project_file_activity",
  "project_task_cache",
];

// Tables that DO have ON DELETE CASCADE (deleted automatically when auth user deleted)
// Listed here for completeness/verification
const CASCADE_TABLES = [
  "client_workspaces",
  "client_file_activity",
  "credit_packages",
  "credit_transactions",
];

// All tables to copy to staging (profile data)
const ALL_PROFILE_TABLES = [
  ...NON_CASCADE_TABLES,
  ...CASCADE_TABLES,
];

// ---------------------------------------------------------------------------
// Copy user to staging
// ---------------------------------------------------------------------------

async function copyUserToStaging(
  prodClient: SupabaseClient,
  stagingClient: SupabaseClient,
  prodUserId: string
): Promise<void> {
  console.log(`\n→ Copying user ${prodUserId} from production to staging...`);

  // 1. Read profile from production
  const { data: profile, error: profileErr } = await prodClient
    .from("profiles")
    .select("*")
    .eq("id", prodUserId)
    .single();

  if (profileErr || !profile) {
    console.error("ERROR: Could not find user profile:", profileErr?.message);
    process.exit(1);
  }

  console.log(`✓ Found profile: ${profile.full_name} (${profile.email})`);
  console.log(`  Company: ${profile.company_name}`);

  // 2. Read all profile tables from production
  const tableData: Record<string, any[]> = {};
  for (const table of ALL_PROFILE_TABLES) {
    const { data, error } = await prodClient
      .from(table)
      .select("*")
      .eq("profile_id", prodUserId);
    if (error) {
      console.warn(`  Warning: Could not read ${table}: ${error.message}`);
      tableData[table] = [];
    } else {
      tableData[table] = data || [];
      if ((data?.length ?? 0) > 0) {
        console.log(`  Read ${data!.length} rows from ${table}`);
      }
    }
  }

  // 3. Read project configs referenced by project_access
  const projectAccessRows = tableData["project_access"] || [];
  const projectConfigIds = projectAccessRows.map((r: any) => r.project_config_id).filter(Boolean);
  let projectConfigs: any[] = [];
  let chapterConfigs: any[] = [];

  if (projectConfigIds.length > 0) {
    console.log(`  Found ${projectConfigIds.length} project(s) to copy...`);
    const { data: pcs } = await prodClient
      .from("project_config")
      .select("*")
      .in("id", projectConfigIds);
    projectConfigs = pcs || [];

    if (projectConfigs.length > 0) {
      const { data: ccs } = await prodClient
        .from("chapter_config")
        .select("*")
        .in("project_config_id", projectConfigIds);
      chapterConfigs = ccs || [];
      console.log(`  Read ${projectConfigs.length} project_config + ${chapterConfigs.length} chapter_config rows`);
    }
  }

  // 4. Create auth user on staging
  console.log(`\n→ Creating auth user on staging...`);

  // Check if user already exists on staging
  const { data: existingUsers } = await (stagingClient.auth.admin as any).listUsers({ perPage: 1000 });
  const existing = existingUsers?.users?.find((u: any) => u.email === profile.email);

  let stagingUserId: string;

  if (existing) {
    console.log(`  User already exists on staging (${existing.id}) — will use existing`);
    stagingUserId = existing.id;
  } else {
    const tempPassword = `Staging-${Math.random().toString(36).slice(2, 10)}!`;
    const { data: authData, error: authErr } = await stagingClient.auth.admin.createUser({
      email: profile.email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authErr || !authData?.user) {
      console.error("ERROR: Could not create staging user:", authErr?.message);
      process.exit(1);
    }
    stagingUserId = authData.user.id;
    console.log(`✓ Created staging user: ${stagingUserId}`);
    console.log(`  Temp password: ${tempPassword}  (change via Supabase dashboard)`);
  }

  // 5. Upsert profile on staging (with new staging UUID)
  const stagingProfile = { ...profile, id: stagingUserId };
  const { error: spErr } = await stagingClient.from("profiles").upsert(stagingProfile);
  if (spErr) {
    console.error("ERROR: Could not upsert profile on staging:", spErr.message);
    process.exit(1);
  }
  console.log(`✓ Profile upserted on staging`);

  // 6. Copy project_config and chapter_config (if any)
  if (projectConfigs.length > 0) {
    const { error: pcErr } = await stagingClient.from("project_config").upsert(projectConfigs);
    if (pcErr) console.warn(`  Warning: project_config upsert: ${pcErr.message}`);
    else console.log(`✓ ${projectConfigs.length} project_config rows upserted`);

    if (chapterConfigs.length > 0) {
      const { error: ccErr } = await stagingClient.from("chapter_config").upsert(chapterConfigs);
      if (ccErr) console.warn(`  Warning: chapter_config upsert: ${ccErr.message}`);
      else console.log(`✓ ${chapterConfigs.length} chapter_config rows upserted`);
    }
  }

  // 7. Copy all profile tables, replacing profile_id with staging UUID
  for (const table of ALL_PROFILE_TABLES) {
    const rows = tableData[table];
    if (!rows || rows.length === 0) continue;

    // Replace profile_id (and id for task_cache created_by_user_id)
    const stagingRows = rows.map((row: any) => {
      const r = { ...row };
      r.profile_id = stagingUserId;
      // created_by_user_id in task_cache may reference the same user
      if ("created_by_user_id" in r && r.created_by_user_id === prodUserId) {
        r.created_by_user_id = stagingUserId;
      }
      return r;
    });

    const { error } = await stagingClient.from(table).upsert(stagingRows);
    if (error) {
      console.warn(`  Warning: ${table} upsert error: ${error.message}`);
    } else {
      console.log(`✓ ${stagingRows.length} rows → ${table}`);
    }
  }

  console.log(`\n✓ User copied to staging successfully`);
  console.log(`  Production ID: ${prodUserId}`);
  console.log(`  Staging ID:    ${stagingUserId}`);
  console.log(`  Email:         ${profile.email}`);
}

// ---------------------------------------------------------------------------
// Delete user from production
// ---------------------------------------------------------------------------

async function deleteUserFromProd(
  prodClient: SupabaseClient,
  userId: string
): Promise<void> {
  console.log(`\n→ Preparing to delete user ${userId} from production...`);

  // 1. Read profile for confirmation
  const { data: profile, error: profileErr } = await prodClient
    .from("profiles")
    .select("id, email, full_name, company_name")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    console.error(`  ERROR: User ${userId} not found:`, profileErr?.message);
    return;
  }

  // 2. Count rows per table
  console.log(`\n  User to delete:`);
  console.log(`    ${profile.full_name} (${profile.email}) — ${profile.company_name}`);
  console.log(`    ID: ${userId}`);
  console.log(`\n  Rows that will be deleted:`);

  for (const table of [...NON_CASCADE_TABLES, ...CASCADE_TABLES]) {
    const { count } = await prodClient
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("profile_id", userId);
    if (count && count > 0) {
      console.log(`    ${table}: ${count} rows`);
    }
  }
  console.log(`    profiles: 1 row`);
  console.log(`    auth.users: 1 row`);

  // 3. Confirm
  const ok = await confirm(`\n  ⚠️  DELETE user ${profile.email} from PRODUCTION? This cannot be undone.`);
  if (!ok) {
    console.log("  Aborted.");
    return;
  }

  // 4. Delete non-cascade tables first
  for (const table of NON_CASCADE_TABLES) {
    const { error } = await prodClient.from(table).delete().eq("profile_id", userId);
    if (error) console.warn(`  Warning: ${table} delete: ${error.message}`);
    else console.log(`  Deleted from ${table}`);
  }

  // 5. Delete auth user (cascades to profiles, client_workspaces, credit_packages,
  //    credit_transactions, client_file_activity)
  const { error: authErr } = await prodClient.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error(`  ERROR: Could not delete auth user: ${authErr.message}`);
    return;
  }

  console.log(`✓ User ${profile.email} deleted from production`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const copyIdx = args.indexOf("--copy-to-staging");
  const deleteIdx = args.indexOf("--delete-from-prod");

  if (copyIdx === -1 && deleteIdx === -1) {
    console.log(`
Usage:
  npx tsx scripts/manage-users.ts --copy-to-staging <user_id>
  npx tsx scripts/manage-users.ts --delete-from-prod <user_id> [<user_id2> ...]
  npx tsx scripts/manage-users.ts --copy-to-staging <uid> --delete-from-prod <uid2> <uid3>
`);
    process.exit(0);
  }

  const env = loadEnv();

  const prodClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stagingClient = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Copy to staging
  if (copyIdx !== -1) {
    const userId = args[copyIdx + 1];
    if (!userId) {
      console.error("ERROR: --copy-to-staging requires a user ID");
      process.exit(1);
    }
    await copyUserToStaging(prodClient, stagingClient, userId);
  }

  // Delete from production
  if (deleteIdx !== -1) {
    // Collect all user IDs after --delete-from-prod until next flag
    const deleteIds: string[] = [];
    for (let i = deleteIdx + 1; i < args.length; i++) {
      if (args[i].startsWith("--")) break;
      deleteIds.push(args[i]);
    }
    if (deleteIds.length === 0) {
      console.error("ERROR: --delete-from-prod requires at least one user ID");
      process.exit(1);
    }
    for (const userId of deleteIds) {
      await deleteUserFromProd(prodClient, userId);
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message ?? err);
  process.exit(1);
});
