/**
 * Client Onboarding Script
 *
 * Erstellt alle Supabase-Zeilen für einen neuen Portal-Client.
 *
 * Reihenfolge (org-first):
 * 1. organizations row (slug-Ableitung, Eindeutigkeitsprüfung)
 * 2. Auth-Benutzer (Admin)
 * 3. profiles row (ohne Legacy-Org-Felder)
 * 4. org_members row (role: admin)
 * 5. client_workspaces rows (organization_id, kein profile_id)
 * 6. credit_packages row + credit_transactions (organization_id)
 * 7. project_access rows (profile_id, project_config_id)
 * 8. Weitere Mitglieder aus members[] (je auth user + profile + org_members)
 * 9. Initialen Task-Sync auslösen
 *
 * Verwendung:
 *   npx tsx scripts/onboard-client.ts --config client.json
 *   npx tsx scripts/onboard-client.ts --interactive
 *
 * Config-JSON-Beispiel:
 * {
 *   "orgName": "Muster GmbH",
 *   "email": "max@muster.at",
 *   "fullName": "Max Mustermann",
 *   "clickupListIds": ["901305442177"],
 *   "supportTaskId": "86c8abc123",
 *   "clickupChatChannelId": "5-901512910505-8",
 *   "nextcloudRoot": "/clients/muster-gmbh/",
 *   "modules": ["tickets"],
 *   "creditPackage": { "name": "Standard 10h", "creditsPerMonth": 10, "initialTopup": 10 },
 *   "projectIds": [],
 *   "members": []
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

interface MemberConfig {
  email: string;
  password?: string;
  fullName: string;
  role?: "member" | "viewer";
}

interface ClientConfig {
  // Org-Ebene (wird in organizations geschrieben)
  orgName: string;
  orgSlug?: string;
  clickupListIds: string[];
  supportTaskId?: string;
  clickupChatChannelId?: string;
  nextcloudRoot?: string;

  // Admin-Benutzer (erstes Org-Mitglied)
  email: string;
  password?: string;
  fullName: string;

  // Optionale weitere Mitglieder
  members?: MemberConfig[];

  // Modul- / Ressourcen-Setup
  modules: string[];
  creditPackage?: CreditConfig;
  projectIds?: string[];
}

// Hinweis: "support" ist KEIN Workspace — es ist ein System-Utility, das immer
// in der Sidebar vorhanden ist. supportTaskId in der Org speichern, nicht in modules.
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
    console.error("FEHLER: .env.local nicht gefunden unter", envPath);
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
      "FEHLER: VITE_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden in .env.local benötigt"
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

/**
 * Leitet den Org-Slug aus der Admin-E-Mail-Domain ab.
 * SQL-Logik: lower(regexp_replace(split_part(email, '@', 2), '\.[^.]+$', ''))
 */
function deriveOrgSlug(email: string): string {
  const domain = email.split("@")[1] ?? email;
  return domain.replace(/\.[^.]+$/, "").toLowerCase().slice(0, 30);
}

/**
 * Leitet einen eindeutigen Slug ab; prüft Kollisionen und hängt -2/-3 bis max. 5 an.
 */
async function deriveUniqueSlug(
  supabase: ReturnType<typeof createClient>,
  email: string,
  override?: string
): Promise<string> {
  const base = override ?? deriveOrgSlug(email);
  for (let i = 1; i <= 5; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error(
    `Kann keinen eindeutigen Slug für "${base}" ableiten — 5 Varianten bereits vergeben`
  );
}

function parseArgs(): ClientConfig {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf("--config");

  if (configIdx !== -1 && args[configIdx + 1]) {
    const configPath = resolve(process.cwd(), args[configIdx + 1]);
    try {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw) as ClientConfig;
    } catch {
      console.error("FEHLER: Config-Datei konnte nicht gelesen werden:", configPath);
      process.exit(1);
    }
  }

  // Kein Config-File — auf --interactive prüfen oder Hilfe ausgeben
  if (!args.includes("--interactive")) {
    console.log(`
Verwendung:
  npx tsx scripts/onboard-client.ts --config client.json
  npx tsx scripts/onboard-client.ts --interactive

Config-JSON-Beispiel:
{
  "orgName": "Muster GmbH",
  "email": "max@muster.at",
  "fullName": "Max Mustermann",
  "clickupListIds": ["901305442177"],
  "supportTaskId": "86c8abc123",
  "clickupChatChannelId": "5-901512910505-8",
  "nextcloudRoot": "/clients/muster-gmbh/",
  "modules": ["tickets"],
  "creditPackage": { "name": "Standard 10h", "creditsPerMonth": 10, "initialTopup": 10 },
  "projectIds": [],
  "members": []
}
`);
    process.exit(0);
  }

  // Interaktiver Modus — noch nicht implementiert
  console.error("Interaktiver Modus noch nicht implementiert. Bitte --config verwenden.");
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
  console.log(`Organisation: ${config.orgName}`);
  console.log(`Admin: ${config.fullName} (${config.email})`);
  console.log(`Module: ${config.modules.join(", ")}`);
  console.log();

  // Step 1: Organisation erstellen
  console.log("1. Erstelle Organisation...");
  const slug = await deriveUniqueSlug(supabase, config.email, config.orgSlug);
  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: config.orgName,
      slug,
      clickup_list_ids: config.clickupListIds,
      support_task_id: config.supportTaskId || null,
      clickup_chat_channel_id: config.clickupChatChannelId || null,
      nextcloud_client_root: config.nextcloudRoot || null,
    })
    .select("id")
    .single();

  if (orgError || !orgData) {
    console.error("   FEHLER:", orgError?.message ?? "Kein Datensatz zurückgegeben");
    process.exit(1);
  }
  const orgId = orgData.id as string;
  console.log(`   OK: Org ${orgId} (slug: ${slug})`);

  // Step 2: Auth-Benutzer erstellen
  console.log("2. Erstelle Auth-Benutzer...");
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: config.email,
    password,
    email_confirm: true,
  });

  if (authError) {
    console.error("   FEHLER:", authError.message);
    console.log("   Rollback: lösche Organisation...");
    await supabase.from("organizations").delete().eq("id", orgId);
    process.exit(1);
  }
  const userId = authData.user.id;
  console.log(`   OK: Benutzer ${userId}`);

  // Step 3: Profil erstellen (keine Legacy-Org-Felder)
  console.log("3. Erstelle Profil...");
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email: config.email,
    full_name: config.fullName,
    company_name: config.orgName,
    email_notifications: true,
  });

  if (profileError) {
    console.error("   FEHLER:", profileError.message);
    console.log("   Rollback: lösche Auth-Benutzer und Organisation...");
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("organizations").delete().eq("id", orgId);
    process.exit(1);
  }
  console.log("   OK");

  // Step 4: org_members-Zeile erstellen (Admin)
  console.log("4. Erstelle org_members (Admin)...");
  const { error: omError } = await supabase.from("org_members").insert({
    organization_id: orgId,
    profile_id: userId,
    role: "admin",
  });

  if (omError) {
    console.error("   FEHLER:", omError.message);
    console.log("   Rollback: lösche Auth-Benutzer und Organisation...");
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("organizations").delete().eq("id", orgId);
    process.exit(1);
  }
  console.log("   OK");

  // Step 5: Workspace-Zugriff erstellen (organization_id, kein profile_id)
  console.log("5. Erstelle Workspace-Zugriff...");
  const workspaceRows = config.modules.map((mod, i) => ({
    organization_id: orgId,
    module_key: mod,
    display_name: MODULE_DEFAULTS[mod]?.display || mod,
    icon: MODULE_DEFAULTS[mod]?.icon || "box",
    sort_order: i + 1,
    is_active: true,
  }));

  const { error: wsError } = await supabase.from("client_workspaces").insert(workspaceRows);
  if (wsError) {
    console.error("   FEHLER:", wsError.message);
    process.exit(1);
  }
  console.log(`   OK: ${workspaceRows.length} Modul(e)`);

  // Step 6: Credit-Paket (optional)
  if (config.creditPackage) {
    console.log("6. Erstelle Credit-Paket...");
    const { error: cpError } = await supabase.from("credit_packages").insert({
      organization_id: orgId,
      package_name: config.creditPackage.name,
      credits_per_month: config.creditPackage.creditsPerMonth,
      is_active: true,
    });

    if (cpError) {
      console.error("   FEHLER:", cpError.message);
      process.exit(1);
    }

    if (config.creditPackage.initialTopup) {
      const now = new Date();
      const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const { error: txError } = await supabase.from("credit_transactions").insert({
        profile_id: userId,
        organization_id: orgId,
        amount: config.creditPackage.initialTopup,
        type: "monthly_topup",
        description: `${monthLabel} Gutschrift`,
      });

      if (txError) {
        console.error("   Gutschrift FEHLER:", txError.message);
      } else {
        console.log(
          `   OK: ${config.creditPackage.name} (${config.creditPackage.initialTopup} Credits)`
        );
      }
    } else {
      console.log(`   OK: ${config.creditPackage.name}`);
    }
  } else {
    console.log("6. Credit-Paket: übersprungen (nicht konfiguriert)");
  }

  // Step 7: Projektzugriff (optional)
  if (config.projectIds && config.projectIds.length > 0) {
    console.log("7. Erstelle Projektzugriff...");
    const paRows = config.projectIds.map((pid) => ({
      profile_id: userId,
      project_config_id: pid,
    }));

    const { error: paError } = await supabase.from("project_access").insert(paRows);
    if (paError) {
      console.error("   FEHLER:", paError.message);
    } else {
      console.log(`   OK: ${paRows.length} Projekt(e)`);
    }
  } else {
    console.log("7. Projektzugriff: übersprungen (nicht konfiguriert)");
  }

  // Step 8: Weitere Mitglieder (optional)
  if (config.members && config.members.length > 0) {
    console.log(`8. Erstelle ${config.members.length} weitere(s) Mitglied(er)...`);
    for (const member of config.members) {
      const memberPassword = member.password || generatePassword();
      try {
        // Auth-Benutzer erstellen
        const { data: mAuth, error: mAuthError } = await supabase.auth.admin.createUser({
          email: member.email,
          password: memberPassword,
          email_confirm: true,
        });
        if (mAuthError || !mAuth) {
          console.warn(
            `   WARNUNG: ${member.email} — Auth fehlgeschlagen: ${mAuthError?.message}`
          );
          continue;
        }
        const mUserId = mAuth.user.id;

        // Profil erstellen
        await supabase.from("profiles").upsert({
          id: mUserId,
          email: member.email,
          full_name: member.fullName,
          company_name: config.orgName,
          email_notifications: true,
        });

        // org_members-Zeile erstellen
        const { error: mOmError } = await supabase.from("org_members").insert({
          organization_id: orgId,
          profile_id: mUserId,
          role: member.role ?? "member",
        });

        if (mOmError) {
          console.warn(
            `   WARNUNG: ${member.email} — org_members fehlgeschlagen: ${mOmError.message}`
          );
        } else {
          console.log(`   OK: ${member.email} (${member.role ?? "member"})`);
          if (!member.password) {
            console.log(`   Temporäres Passwort: ${memberPassword}`);
          }
        }
      } catch (err) {
        console.warn(`   WARNUNG: ${member.email} — unerwartet fehlgeschlagen:`, err);
      }
    }
  } else {
    console.log("8. Weitere Mitglieder: keine konfiguriert");
  }

  // Step 9: Initialen Task-Sync auslösen
  console.log("9. Löse initialen Task-Sync aus...");
  try {
    // Als neuer Benutzer einloggen, um JWT für den Sync-Aufruf zu erhalten
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: config.email,
      password,
    });

    if (signInError || !signIn.session) {
      console.log("   Übersprungen: Einloggen als Benutzer für Sync nicht möglich");
    } else {
      const res = await fetch(`${url}/functions/v1/main/fetch-clickup-tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signIn.session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        console.log("   OK: Task-Sync ausgelöst");
      } else {
        console.log(`   Warnung: Sync hat ${res.status} zurückgegeben — später manuell ausführen`);
      }
    }
  } catch {
    console.log("   Übersprungen: Sync-Aufruf fehlgeschlagen — später manuell ausführen");
  }

  // Zusammenfassung
  console.log("\n========================================");
  console.log("  ONBOARDING ABGESCHLOSSEN");
  console.log("========================================");
  console.log(`  Organisation: ${config.orgName} (${slug})`);
  console.log(`  Admin:        ${config.email}`);
  if (!config.password) {
    console.log(`  Passwort:     ${password}  \u2190 jetzt kopieren!`);
  }
  console.log(`  Module:       ${config.modules.join(", ")}`);
  if (config.creditPackage) {
    console.log(
      `  Credits:      ${config.creditPackage.name} (${config.creditPackage.creditsPerMonth}/Monat)`
    );
  }
  if (config.projectIds?.length) {
    console.log(`  Projekte:     ${config.projectIds.length}`);
  }
  if (config.members?.length) {
    console.log(`  Mitglieder:   ${config.members.length} weitere`);
  }
  console.log(`  Portal-URL:   https://portal.kamanin.at`);
  console.log("\n  Login-Daten manuell an den Client senden.");
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("Schwerwiegender Fehler:", err);
  process.exit(1);
});
