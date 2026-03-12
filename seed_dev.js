const https = require('https');

const KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTQ1MDk4MCwiZXhwIjo0OTI3MTI0NTgwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.dtsUinqRHtV907xgFstBRbKr23OoRqbAjV0zWJAPICg';
const PROFILE_ID = '08412490-e160-4f23-ac7d-a20ece811195';

function pgQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'portal.db.kamanin.at',
      path: '/pg/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Use dollar-quoting to avoid JSON escaping issues
function jsonbLiteral(obj) {
  return `$json$${JSON.stringify(obj)}$json$::jsonb`;
}

async function run() {
  // Check if already seeded
  const check = await pgQuery(`SELECT count(*) as n FROM task_cache WHERE profile_id = '${PROFILE_ID}'`);
  if (check[0] && Number(check[0].n) > 0) {
    console.log('Already seeded, count:', check[0].n);
  } else {
    // Task 1: client review — the important one (Approve/Request Changes buttons)
    const t1raw = { status: { status: 'in progress', color: '#0000ff' }, name: 'Website Redesign', id: 'dev001', clickup_id: 'dev001', description: 'Dev seed', status_color: '#0000ff', priority: 'high', priority_color: '#ef4444', due_date: null, time_estimate: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z', assignees: [], tags: [], url: 'https://app.clickup.com/t/dev001', list_id: 'list001', list_name: 'Webprojekte', created_by_name: 'Tim', created_by_user_id: 'tm001' };
    let r = await pgQuery(`INSERT INTO task_cache (id, clickup_id, profile_id, name, description, status, status_color, priority, priority_color, clickup_url, list_id, list_name, raw_data, last_synced, is_visible, last_activity_at, created_by_name, created_by_user_id) VALUES (gen_random_uuid(), 'dev001', '${PROFILE_ID}', 'Website Redesign \u2013 Freigabe erforderlich', 'Bitte pr\u00FCfen und freigeben.', 'client review', '#f59e0b', 'high', '#ef4444', 'https://app.clickup.com/t/dev001', 'list001', 'Webprojekte', ${jsonbLiteral(t1raw)}, now(), true, now() - interval '1 hour', 'Tim', 'tm001') RETURNING clickup_id, status`);
    console.log('task1:', JSON.stringify(r));

    // Task 2: in progress
    const t2raw = { status: { status: 'in progress', color: '#3b82f6' }, name: 'SEO-Optimierung', id: 'dev002', clickup_id: 'dev002', description: 'Dev seed', status_color: '#3b82f6', priority: 'normal', priority_color: '#6b7280', due_date: null, time_estimate: null, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-03-05T00:00:00Z', assignees: [], tags: [], url: 'https://app.clickup.com/t/dev002', list_id: 'list001', list_name: 'Webprojekte', created_by_name: 'Anna', created_by_user_id: 'an001' };
    r = await pgQuery(`INSERT INTO task_cache (id, clickup_id, profile_id, name, description, status, status_color, priority, priority_color, clickup_url, list_id, list_name, raw_data, last_synced, is_visible, last_activity_at, created_by_name, created_by_user_id) VALUES (gen_random_uuid(), 'dev002', '${PROFILE_ID}', 'SEO-Optimierung', 'Keyword-Recherche l\u00E4uft.', 'in progress', '#3b82f6', 'normal', '#6b7280', 'https://app.clickup.com/t/dev002', 'list001', 'Webprojekte', ${jsonbLiteral(t2raw)}, now(), true, now() - interval '2 hours', 'Anna', 'an001') RETURNING clickup_id, status`);
    console.log('task2:', JSON.stringify(r));

    // Task 3: support channel task
    const t3raw = { status: { status: 'in progress' }, name: 'Support-Kanal', id: 'dev003', clickup_id: 'dev003', description: 'Support', status_color: '#8b5cf6', priority: 'normal', priority_color: null, due_date: null, time_estimate: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-03-10T00:00:00Z', assignees: [], tags: [], url: 'https://app.clickup.com/t/dev003', list_id: 'list_support', list_name: 'Support', created_by_name: null, created_by_user_id: null };
    r = await pgQuery(`INSERT INTO task_cache (id, clickup_id, profile_id, name, description, status, status_color, priority, clickup_url, list_id, list_name, raw_data, last_synced, is_visible, last_activity_at) VALUES (gen_random_uuid(), 'dev003', '${PROFILE_ID}', 'Support-Kanal', 'Ihr direkter Draht zum Team.', 'in progress', '#8b5cf6', 'normal', 'https://app.clickup.com/t/dev003', 'list_support', 'Support', ${jsonbLiteral(t3raw)}, now(), true, now() - interval '30 minutes') RETURNING clickup_id, status`);
    console.log('task3 (support):', JSON.stringify(r));
  }

  // Seed a comment from team on task dev001
  const existingComment = await pgQuery(`SELECT count(*) as n FROM comment_cache WHERE task_id = 'dev001'`);
  if (Number(existingComment[0]?.n) === 0) {
    const cSql = `INSERT INTO comment_cache (id, clickup_comment_id, task_id, profile_id, comment_text, display_text, author_id, author_name, author_email, author_avatar, clickup_created_at, last_synced, is_from_portal) VALUES (gen_random_uuid(), 'cmt001', 'dev001', '${PROFILE_ID}', 'Hallo! Bitte pr\u00FCfen Sie den Entwurf und geben Sie uns Feedback.', 'Hallo! Bitte pr\u00FCfen Sie den Entwurf und geben Sie uns Feedback.', 12345, 'Tim', 'tim@kamanin.at', NULL, now() - interval '45 minutes', now(), false) RETURNING clickup_comment_id`;
    const cResult = await pgQuery(cSql);
    console.log('comment:', JSON.stringify(cResult));
  } else {
    console.log('comment already exists');
  }

  // Ensure support_task_id is set
  const pResult = await pgQuery(`UPDATE profiles SET support_task_id = 'dev003' WHERE id = '${PROFILE_ID}' AND (support_task_id IS NULL OR support_task_id != 'dev003') RETURNING id, full_name, support_task_id`);
  console.log('profile:', JSON.stringify(pResult));

  // ============ PROJECT CONFIG SEED ============
  // Uses placeholder ClickUp IDs — replace with real values when integrating

  const PROJECT_CONFIG_ID = '11111111-1111-1111-1111-111111111111';
  const CLICKUP_LIST_ID = 'REPLACE_WITH_REAL_LIST_ID';
  const CLICKUP_PHASE_FIELD_ID = 'REPLACE_WITH_REAL_FIELD_ID';

  const CHAPTERS = [
    { id: '22222222-0001-0001-0001-000000000001', title: 'Konzept', order: 1, cfOptionId: 'REPLACE_CF_OPTION_1', narrative: 'Wir definieren gemeinsam den Umfang und die Ziele Ihres Projekts.', nextNarrative: 'Als Nächstes folgt die Seitenstruktur.' },
    { id: '22222222-0001-0001-0001-000000000002', title: 'Struktur', order: 2, cfOptionId: 'REPLACE_CF_OPTION_2', narrative: 'Die Seitenstruktur und Navigation Ihrer Website werden festgelegt.', nextNarrative: 'Danach beginnt die visuelle Gestaltung.' },
    { id: '22222222-0001-0001-0001-000000000003', title: 'Design', order: 3, cfOptionId: 'REPLACE_CF_OPTION_3', narrative: 'Inhalte und visuelles Design werden gemeinsam erarbeitet.', nextNarrative: 'Anschließend wird die Website technisch umgesetzt.' },
    { id: '22222222-0001-0001-0001-000000000004', title: 'Entwicklung', order: 4, cfOptionId: 'REPLACE_CF_OPTION_4', narrative: 'Ihre Website wird technisch umgesetzt und für den Launch vorbereitet.', nextNarrative: 'Projekt abgeschlossen — Ihre Website ist live!' },
  ];

  const existingProject = await pgQuery(`SELECT count(*) as n FROM project_config WHERE id = '${PROJECT_CONFIG_ID}'`);
  if (Number(existingProject[0]?.n) === 0) {
    const pcResult = await pgQuery(`INSERT INTO project_config (id, clickup_list_id, clickup_phase_field_id, name, type, client_name, client_initials, start_date, target_date) VALUES ('${PROJECT_CONFIG_ID}', '${CLICKUP_LIST_ID}', '${CLICKUP_PHASE_FIELD_ID}', 'Praxis Dr. Weber', 'Website Redesign', 'Dr. Maria Weber', 'MW', '15. Feb 2026', '30. Apr 2026') RETURNING id, name`);
    console.log('project_config:', JSON.stringify(pcResult));

    const paResult = await pgQuery(`INSERT INTO project_access (project_config_id, profile_id) VALUES ('${PROJECT_CONFIG_ID}', '${PROFILE_ID}') RETURNING id`);
    console.log('project_access:', JSON.stringify(paResult));

    for (const ch of CHAPTERS) {
      const chResult = await pgQuery(`INSERT INTO chapter_config (id, project_config_id, clickup_cf_option_id, title, sort_order, narrative, next_narrative) VALUES ('${ch.id}', '${PROJECT_CONFIG_ID}', '${ch.cfOptionId}', '${ch.title}', ${ch.order}, '${ch.narrative}', '${ch.nextNarrative}') RETURNING id, title`);
      console.log('chapter_config:', JSON.stringify(chResult));
    }

    console.log('Project seed complete.');
  } else {
    console.log('Project config already exists');
  }

  // Final verify
  const counts = await pgQuery(`SELECT (SELECT count(*) FROM task_cache WHERE profile_id = '${PROFILE_ID}') as tasks, (SELECT count(*) FROM comment_cache WHERE profile_id = '${PROFILE_ID}') as comments, (SELECT count(*) FROM project_config) as projects, (SELECT count(*) FROM chapter_config) as chapters`);
  console.log('final counts:', JSON.stringify(counts));
}

run().catch(console.error);
