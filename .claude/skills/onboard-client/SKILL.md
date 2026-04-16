---
name: onboard-client
description: >
  Onboard a new client to the KAMANIN Portal — creates auth user, profile, workspaces,
  credit package, and project access. Use when a new client contract is signed.
  Includes pre-flight validation before touching any data.
---

# Client Onboarding

## Before You Start — Gather Information

Collect from Yuri or the contract:

| Field | Example | Where to get it |
|-------|---------|----------------|
| Client name | "Müller GmbH" | Contract |
| Client email | client@example.at | Client contact |
| ClickUp list IDs | `901234567` | ClickUp → list URL |
| Workspace names | "Website", "Support" | Project scope |
| Initial credits | 40 | Contract (hours × rate) |
| Nextcloud folder | `/clients/mueller-gmbh/` | Create manually if needed |

## Step 1 — Pre-flight Validation

Before creating anything, verify:

```bash
# 1. Verify ClickUp list IDs exist and are accessible
# (use ClickUp API or open the list in ClickUp)

# 2. Check the email is not already registered
# Supabase Dashboard → Auth → Users → search by email

# 3. Verify Nextcloud folder structure exists
# (or create it first via Files module)
```

## Step 2 — Create Config File

```bash
cp scripts/helferportal-onboard.json scripts/client-<name>.json
```

Edit `scripts/client-<name>.json`:
```json
{
  "email": "client@example.at",
  "password": "TempPass123!",
  "fullName": "Max Mustermann",
  "companyName": "Müller GmbH",
  "workspaces": [
    {
      "name": "Website",
      "clickupListId": "901234567",
      "type": "project"
    },
    {
      "name": "Support",
      "clickupListId": "901234568",
      "type": "support"
    }
  ],
  "credits": {
    "packageName": "Startpaket",
    "initialAmount": 40
  },
  "nextcloudPath": "/clients/mueller-gmbh/"
}
```

## Step 3 — Run Onboarding Script

```bash
# Dry run first (if --dry-run flag is available)
npx tsx scripts/onboard-client.ts --config scripts/client-<name>.json

# Full run
npx tsx scripts/onboard-client.ts --config scripts/client-<name>.json
```

### What the script does:
1. Creates Supabase auth user (email + password)
2. Creates profile row (linked to auth user)
3. Creates `client_workspaces` entries
4. Creates credit package + initial top-up transaction
5. Adds project access entries
6. Triggers `fetch-clickup-tasks` to prime the task cache

## Step 4 — Verify in Supabase Dashboard

Check that all rows were created:
- Auth → Users → find by email ✓
- Table `profiles` → find by email ✓
- Table `client_workspaces` → filter by profile_id ✓
- Table `credit_packages` → filter by profile_id ✓
- Table `task_cache` → filter by profile_id (may take 30s to populate) ✓

## Step 5 — Test Login

1. Open `https://portal.kamanin.at` (or staging for first test)
2. Log in with client credentials
3. Verify workspaces appear in sidebar
4. Verify tasks load from ClickUp
5. Verify files section shows Nextcloud path

## Step 6 — Send Welcome Email

Manually send the welcome email via Mailjet or the auth-email Edge Function.
Include: portal URL, temporary password, instruction to change password.

## Step 7 — Cleanup Config File

```bash
# Delete the config file — it contains a temp password
rm scripts/client-<name>.json
```

## Gotchas

- **Temp password** in config file — delete after use, never commit
- **ClickUp list IDs must be valid** — script may fail silently if list doesn't exist
- **Task cache takes 30–60s** to populate after trigger
- **RLS policies** are profile_id-based — a wrongly linked profile sees no data
- **Credit packages** are required for the credits UI to work — don't skip step
- **Nextcloud path** must match exactly (case-sensitive) what's in the Nextcloud WebDAV structure
