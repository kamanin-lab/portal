// A1 resolved: no handle_new_user trigger found in supabase/migrations/ — manual profiles insert required
// grep -rn "handle_new_user|on_auth_user_created" supabase/migrations/ → 0 results
// grep -rn "TRIGGER.*auth.users" supabase/migrations/ → 0 results
// Therefore: invite-member MUST manually insert a profiles row after createUser

// TODO: Full implementation follows in Task 2
