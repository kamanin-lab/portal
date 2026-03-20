

# Update Manual Deploy Workflow: Deploy All Functions Dynamically

## Change

**File:** `.github/workflows/supabase-manual.yml`

Replace the hardcoded `FUNCTIONS` array with a dynamic scan of `supabase/functions/` directory. Skip `_shared` (not a function).

```yaml
- name: Deploy all functions
  run: |
    set -e
    for fn in supabase/functions/*/; do
      fn_name=$(basename "$fn")
      if [ "$fn_name" = "_shared" ]; then
        continue
      fi
      echo "Deploying: $fn_name"
      supabase functions deploy "$fn_name" --no-verify-jwt
    done
  env:
    SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}"
```

This ensures every function in the folder gets deployed, no manual list maintenance needed.

