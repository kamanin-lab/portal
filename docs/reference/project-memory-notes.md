# Project Memory Notes

## Stable client identity used in this batch

`project_memory_entries.client_id` is keyed to `profiles.id`.

Why this path was chosen:
- it is a real backend identity already present in the active Supabase architecture
- it is stable across display-name changes and project renames
- it avoids deriving durable memory keys from mutable UI strings

## Remaining limitation

This is stable per authenticated portal profile, not yet per company/account entity.

So if one client company later has multiple separate portal profiles, client-scope memory will remain partitioned per profile until the product gains a dedicated shared account/client table and projects point to that stable account id.

That limitation is narrower and safer than the previous slug-based identity, and it is explicitly documented here instead of hidden in UI logic.
