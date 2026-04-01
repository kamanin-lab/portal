/**
 * Client Onboarding Script
 *
 * Creates all Supabase rows needed for a new portal client:
 * 1. Auth user (email/password, pre-confirmed)
 * 2. Profile row
 * 3. Workspace access rows
 * 4. Credit package + initial top-up (optional)
 * 5. Project access rows (optional)
 * 6. Triggers initial task sync
 *
 * Usage:
 *   npx tsx scripts/onboard-client.ts --config client.json
 *   npx tsx scripts/onboard-client.ts --interactive
 *
 * Config JSON format:
 * {
 *   "email": "max@muster.at",
 *   "password": "optional-or-auto-generated",
 *   "fullName": "Max Mustermann",
 *   "company": "Muster GmbH",
 *   "clickupListIds": ["901305442177"],
 *   "supportTaskId": "86c8abc123",
 *   "nextcloudRoot": "/clients/muster-gmbh/",
 *   "modules": ["tickets"],
 *   "creditPackage": { "name": "Standard 10h", "creditsPerMonth": 10, "initialTopup": 10 },
 *   "projectIds": []
 * }
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface CreditConfig {
  name: string;
  creditsPerMonth: number;
  initialTopup?: number;
}

interface ClientConfig {
  email: string;
  password?: string;
  fullName: string;
  company: string;
  clickupListIds: string[];
  supportTaskId?: string;
  clickupChatChannelId?: string;
  nextcloudRoot?: string;
  modules: string[];
  creditPackage?: CreditConfig;
  projectIds?: string[];
}

// Note: "support" is NOT a workspace — it's a system utility always present in the sidebar.
// Do not include "support" in modules; use supportTaskId to link the ClickUp support task.
const MODULE_DEFAULTS: Record<string, { display: string; icon: string }> = {
  tickets: { display: "Aufgaben", icon: "check-square" },
  projects: { display: "Projekte", icon: "folder-kanban" },
};

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnv(): { url: string; serviceKey: string } {
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

  const url = vars.VITE_SUPABASE_URL;
  const serviceKey = vars.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "ERROR: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local"
    );
    process.exit(1);
  }

  return { url, serviceKey };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

function parseArgs(): ClientConfig {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf("--config");

  if (configIdx !== -1 && args[configIdx + 1]) {
    const configPath = resolve(process.cwd(), args[configIdx + 1]);
    try {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw) as ClientConfig;
    } catch (e) {
      console.error("ERROR: Failed to read config file:", configPath);
      process.exit(1);
    }
  }

  // No config file — check for --interactive or show usage
  if (!args.includes("--interactive")) {
    console.log(`
Usage:
  npx tsx scripts/onboard-client.ts --config client.json
  npx tsx scripts/onboard-client.ts --interactive

Config JSON example:
{
  "email": "max@muster.at",
  "fullName": "Max Mustermann",
  "company": "Muster GmbH",
  "clickupListIds": ["901305442177"],
  "supportTaskId": "86c8abc123",
  "clickupChatChannelId": "5-901512910505-8",
  "nextcloudRoot": "/clients/muster-gmbh/",
  "modules": ["tickets"],
  "creditPackage": { "name": "Standard 10h", "creditsPerMonth": 10, "initialTopup": 10 },
  "projectIds": []
}
`);
    process.exit(0);
  }

  // Interactive mode — read from stdin prompts
  console.error("Interactive mode not yet implemented. Use --config.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();
  const { url, serviceKey } = loadEnv();
  const password = config.password || generatePassword();

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("\n--- KAMANIN Portal: Client Onboarding ---\n");
  console.log(`Client: ${config.fullName} (${config.company})`);
  console.log(`Email:  ${config.email}`);
  console.log(`Modules: ${config.modules.join(", ")}`);
  console.log();

  // Step 1: Create auth user
  console.log("1. Creating auth user...");
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: config.email,
      password,
      email_confirm: true,
    });

  if (authError) {
    console.error("   FAILED:", authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`   OK: user ${userId}`);

  // Step 2: Create profile
  console.log("2. Creating profile...");
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email: config.email,
    full_name: config.fullName,
    company_name: config.company,
    clickup_list_ids: config.clickupListIds,
    support_task_id: config.supportTaskId || null,
    clickup_chat_channel_id: config.clickupChatChannelId || null,
    nextcloud_client_root: config.nextcloudRoot || null,
    email_notifications: true,
  });

  if (profileError) {
    console.error("   FAILED:", profileError.message);
    console.log("   Rolling back: deleting auth user...");
    await supabase.auth.admin.deleteUser(userId);
    process.exit(1);
  }
  console.log("   OK");

  // Step 3: Create workspace access
  console.log("3. Creating workspace access...");
  const workspaceRows = config.modules.map((mod, i) => ({
    profile_id: userId,
    module_key: mod,
    display_name: MODULE_DEFAULTS[mod]?.display || mod,
    icon: MODULE_DEFAULTS[mod]?.icon || "box",
    sort_order: i + 1,
    is_active: true,
  }));

  const { error: wsError } = await supabase
    .from("client_workspaces")
    .insert(workspaceRows);

  if (wsError) {
    console.error("   FAILED:", wsError.message);
    process.exit(1);
  }
  console.log(`   OK: ${workspaceRows.length} module(s)`);

  // Step 4: Credit package (optional)
  if (config.creditPackage) {
    console.log("4. Creating credit package...");
    const { error: cpError } = await supabase
      .from("credit_packages")
      .insert({
        profile_id: userId,
        package_name: config.creditPackage.name,
        credits_per_month: config.creditPackage.creditsPerMonth,
        is_active: true,
      });

    if (cpError) {
      console.error("   FAILED:", cpError.message);
      process.exit(1);
    }

    if (config.creditPackage.initialTopup) {
      const now = new Date();
      const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const { error: txError } = await supabase
        .from("credit_transactions")
        .insert({
          profile_id: userId,
          amount: config.creditPackage.initialTopup,
          type: "monthly_topup",
          description: `${monthLabel} Gutschrift`,
        });

      if (txError) {
        console.error("   Top-up FAILED:", txError.message);
      } else {
        console.log(
          `   OK: ${config.creditPackage.name} (${config.creditPackage.initialTopup} initial credits)`
        );
      }
    } else {
      console.log(`   OK: ${config.creditPackage.name}`);
    }
  } else {
    console.log("4. Credit package: skipped (none configured)");
  }

  // Step 5: Project access (optional)
  if (config.projectIds && config.projectIds.length > 0) {
    console.log("5. Creating project access...");
    const paRows = config.projectIds.map((pid) => ({
      profile_id: userId,
      project_config_id: pid,
    }));

    const { error: paError } = await supabase
      .from("project_access")
      .insert(paRows);

    if (paError) {
      console.error("   FAILED:", paError.message);
    } else {
      console.log(`   OK: ${paRows.length} project(s)`);
    }
  } else {
    console.log("5. Project access: skipped (none configured)");
  }

  // Step 6: Trigger initial task sync
  console.log("6. Triggering initial task sync...");
  try {
    // Sign in as the new user to get a JWT for the sync call
    const { data: signIn, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: config.email,
        password,
      });

    if (signInError || !signIn.session) {
      console.log("   Skipped: could not sign in as user for sync");
    } else {
      const res = await fetch(`${url}/functions/v1/main/fetch-clickup-tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signIn.session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        console.log("   OK: task sync triggered");
      } else {
        console.log(`   Warning: sync returned ${res.status} — run manually later`);
      }
    }
  } catch {
    console.log("   Skipped: sync call failed — run manually later");
  }

  // Summary
  console.log("\n========================================");
  console.log("  ONBOARDING COMPLETE");
  console.log("========================================\n");
  console.log(`  User ID:    ${userId}`);
  console.log(`  Email:      ${config.email}`);
  console.log(`  Password:   ${password}`);
  console.log(`  Company:    ${config.company}`);
  console.log(`  Modules:    ${config.modules.join(", ")}`);
  if (config.creditPackage) {
    console.log(`  Credits:    ${config.creditPackage.name} (${config.creditPackage.creditsPerMonth}/mo)`);
  }
  if (config.projectIds?.length) {
    console.log(`  Projects:   ${config.projectIds.length}`);
  }
  console.log(`  Portal URL: https://portal.kamanin.at`);
  console.log(
    `\n  Send login credentials to client manually.`
  );
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
