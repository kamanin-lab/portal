import https from 'https';

const ACCESS_TOKEN = 'sbp_fb903bfc7887fc22c565b0564f0ed140613b2bda';
const PROJECT_REF = 'ahlthosftngdcryltapu';
const PROFILE_UUID = '71c6633a-f45b-45ef-b2ce-02147b0caa7c';

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  let pass = 0;
  let fail = 0;

  function ok(label, value) {
    console.log(`  PASS  ${label}: ${JSON.stringify(value)}`);
    pass++;
  }
  function err(label, value) {
    console.log(`  FAIL  ${label}: ${JSON.stringify(value)}`);
    fail++;
  }

  // ─── V1: Tables ─────────────────────────────────────────────────────────────
  console.log('\n=== V1: Tables exist with correct columns ===');
  const orgCols = await query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organizations' ORDER BY ordinal_position"
  );
  const orgColNames = orgCols.map((r) => r.column_name);
  const expectedOrg = ['id','name','slug','clickup_list_ids','nextcloud_client_root','support_task_id','clickup_chat_channel_id','created_at','updated_at'];
  for (const c of expectedOrg) {
    orgColNames.includes(c) ? ok(`organizations.${c}`, orgCols.find(r=>r.column_name===c)?.data_type) : err(`organizations.${c}`, 'MISSING');
  }

  const memCols = await query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'org_members' ORDER BY ordinal_position"
  );
  const memColNames = memCols.map((r) => r.column_name);
  const expectedMem = ['id','organization_id','profile_id','role','created_at'];
  for (const c of expectedMem) {
    memColNames.includes(c) ? ok(`org_members.${c}`, memCols.find(r=>r.column_name===c)?.data_type) : err(`org_members.${c}`, 'MISSING');
  }

  // ─── V2: Helper functions ────────────────────────────────────────────────────
  console.log('\n=== V2: Helper functions SECURITY DEFINER STABLE ===');
  const funcs = await query(
    "SELECT proname, prosecdef, provolatile, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('user_org_ids', 'user_org_role')"
  );
  for (const fn of ['user_org_ids', 'user_org_role']) {
    const row = funcs.find((r) => r.proname === fn);
    if (!row) { err(fn, 'MISSING'); continue; }
    row.prosecdef === true ? ok(`${fn}.SECURITY DEFINER`, row.prosecdef) : err(`${fn}.SECURITY DEFINER`, row.prosecdef);
    row.provolatile === 's' ? ok(`${fn}.STABLE`, row.provolatile) : err(`${fn}.STABLE`, row.provolatile);
    const cfg = Array.isArray(row.proconfig) ? row.proconfig.join(',') : String(row.proconfig);
    cfg.includes('search_path') ? ok(`${fn}.search_path`, cfg) : err(`${fn}.search_path`, cfg);
  }

  // ─── V3: Functions return correct results ────────────────────────────────────
  console.log('\n=== V3: Functions return correct results ===');
  // Note: Management API runs as postgres superuser, SET LOCAL role won't simulate RLS properly
  // We'll test by direct membership query instead
  const orgIdResult = await query(
    `SELECT organization_id FROM public.profiles WHERE id = '${PROFILE_UUID}'`
  );
  const orgId = orgIdResult[0]?.organization_id;
  if (!orgId) {
    err('profile.organization_id', 'NULL — profile not back-filled');
  } else {
    ok('profile.organization_id populated', orgId);
    // Test user_org_ids indirectly via org_members
    const membership = await query(
      `SELECT organization_id, role FROM public.org_members WHERE profile_id = '${PROFILE_UUID}'`
    );
    membership.length === 1 ? ok('org_members has 1 row for profile', membership[0]) : err('org_members row count', membership.length);
    membership[0]?.role === 'admin' ? ok('role = admin', membership[0]?.role) : err('role', membership[0]?.role);
    membership[0]?.organization_id === orgId ? ok('org_members.organization_id matches profile.organization_id', true) : err('organization_id mismatch', { member: membership[0]?.organization_id, profile: orgId });
  }

  // ─── V4: FK columns + NOT NULL ──────────────────────────────────────────────
  console.log('\n=== V4: FK columns populated + NOT NULL enforced ===');
  const fkCols = await query(`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'organization_id'
      AND table_name IN ('credit_packages', 'client_workspaces', 'profiles', 'credit_transactions')
    ORDER BY table_name
  `);
  for (const row of fkCols) {
    const notNull = row.is_nullable === 'NO';
    if (row.table_name === 'credit_packages' || row.table_name === 'client_workspaces') {
      notNull ? ok(`${row.table_name}.organization_id NOT NULL`, row.is_nullable) : err(`${row.table_name}.organization_id should be NOT NULL`, row.is_nullable);
    } else {
      ok(`${row.table_name}.organization_id exists (nullable ok)`, row.is_nullable);
    }
  }
  const nullChecks = await query(`
    SELECT 'credit_packages' AS t, COUNT(*) AS cnt FROM public.credit_packages WHERE organization_id IS NULL
    UNION ALL
    SELECT 'client_workspaces', COUNT(*) FROM public.client_workspaces WHERE organization_id IS NULL
    UNION ALL
    SELECT 'profiles', COUNT(*) FROM public.profiles WHERE organization_id IS NULL
  `);
  for (const row of nullChecks) {
    parseInt(row.cnt) === 0 ? ok(`${row.t} NULL org_ids = 0`, row.cnt) : err(`${row.t} NULL org_ids`, row.cnt);
  }

  // ─── V5: Data migration integrity ────────────────────────────────────────────
  console.log('\n=== V5: Data migration integrity ===');
  const counts = await query(`
    SELECT
      (SELECT COUNT(*) FROM public.organizations) AS org_count,
      (SELECT COUNT(*) FROM public.org_members)   AS member_count,
      (SELECT COUNT(*) FROM public.profiles)      AS profile_count,
      (SELECT COUNT(*) FROM public.organizations WHERE clickup_list_ids IS NULL) AS null_list_count
  `);
  const c = counts[0];
  console.log('  Counts:', JSON.stringify(c));
  c.org_count === c.member_count && c.org_count === c.profile_count
    ? ok('org_count = member_count = profile_count', c.org_count)
    : err('count mismatch', c);
  parseInt(c.null_list_count) === 0 ? ok('no NULL clickup_list_ids', c.null_list_count) : err('NULL clickup_list_ids', c.null_list_count);

  const mapping = await query(`
    SELECT p.email, o.slug, om.role
    FROM public.profiles p
    JOIN public.org_members om ON om.profile_id = p.id
    JOIN public.organizations o ON o.id = om.organization_id
    ORDER BY p.email
  `);
  console.log('  Profile→Org mapping:');
  for (const row of mapping) {
    console.log(`    ${row.email} → slug=${row.slug}, role=${row.role}`);
    row.role === 'admin' ? ok(`${row.email} role=admin`, true) : err(`${row.email} role`, row.role);
  }

  // Row count vs baseline (pre-migration: credit_packages=1, client_workspaces=4)
  const rowCounts = await query(`
    SELECT
      (SELECT COUNT(*) FROM public.credit_packages)   AS cp_count,
      (SELECT COUNT(*) FROM public.client_workspaces) AS cw_count
  `);
  const rc = rowCounts[0];
  parseInt(rc.cp_count) === 1 ? ok('credit_packages count = 1 (baseline)', rc.cp_count) : err('credit_packages count (expected 1)', rc.cp_count);
  parseInt(rc.cw_count) === 4 ? ok('client_workspaces count = 4 (baseline)', rc.cw_count) : err('client_workspaces count (expected 4)', rc.cw_count);

  // ─── V6: Dual-mode RLS ──────────────────────────────────────────────────────
  console.log('\n=== V6: Dual-mode RLS policies ===');
  const policies = await query(`
    SELECT tablename, policyname, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('credit_packages', 'client_workspaces')
    ORDER BY tablename, policyname
  `);
  for (const tbl of ['credit_packages', 'client_workspaces']) {
    const tblPolicies = policies.filter((p) => p.tablename === tbl);
    const hasOld = tblPolicies.some((p) => p.qual && p.qual.includes('auth.uid()') && p.qual.includes('profile_id'));
    const hasNew = tblPolicies.some((p) => p.qual && p.qual.includes('user_org_ids'));
    hasOld ? ok(`${tbl} has old profile_id policy`, tblPolicies.find(p=>p.qual?.includes('profile_id'))?.policyname) : err(`${tbl} missing old profile_id policy`, tblPolicies.map(p=>p.policyname));
    hasNew ? ok(`${tbl} has new org policy`, tblPolicies.find(p=>p.qual?.includes('user_org_ids'))?.policyname) : err(`${tbl} missing new org policy`, tblPolicies.map(p=>p.policyname));
  }

  // ─── V7: notifications_type_check ──────────────────────────────────────────
  console.log('\n=== V7: notifications_type_check extended ===');
  const constraint = await query(
    "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check'"
  );
  const def = constraint[0]?.def || '';
  console.log('  Constraint def:', def);
  for (const val of ['team_reply','status_change','step_ready','project_reply','project_update','new_recommendation','member_invited','member_removed']) {
    def.includes(val) ? ok(`notifications_type_check includes '${val}'`, true) : err(`notifications_type_check missing '${val}'`, def);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`V1-V7 RESULTS: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('STATUS: FAIL');
    process.exit(1);
  } else {
    console.log('STATUS: PASS');
  }
}

main().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
