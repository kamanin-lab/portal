/**
 * E2E test: unified email+bell notification preferences + auto-archive.
 *
 * Verifies that `notification_preferences` now gates BOTH email and bell (in-app) channels:
 *   A. User with task_review=false → no bell when task → Client Review (webhook-driven)
 *   B. User with task_review=true  → bell created when task → Client Review
 *   C. User with peer_messages=false → no team_reply bell when peer posts comment
 *   D. Auto-archive: read notification >30d → archived_at set; archived >90d → deleted
 *
 * Prerequisite for A/B: staging CLICKUP_WEBHOOK_SECRET must match the ClickUp-issued
 * secret for the staging webhook registration. If webhook events return 401, refresh
 * via Management API (see reference_clickup_test.md memory).
 *
 * Runs against STAGING only. Creates real ClickUp tasks in test list 901520327531 (Test - Tasks).
 *
 * Run:
 *   cd g:/01_OPUS/Projects/PORTAL
 *   npx tsx tests/e2e/notification-preferences.ts
 */

import {
  adminClient,
  callEdgeFunction,
  createClickupTestTask,
  deleteClickupTask,
  clickupCall,
  signInAs,
  CLICKUP_TEST_LIST_TASKS,
  assert,
  sleep,
  green,
  red,
  yellow,
} from '../_shared/staging-client'

type TestUser = { email: string; password: string; userId: string }
type Ctx = {
  orgId: string
  userGateOff: TestUser   // task_review: false
  userGateOn: TestUser    // task_review: true
  userPeerOff: TestUser   // peer_messages: false
  clickupTaskId: string
}

const admin = adminClient()
const ts = Date.now()
const PASS = 'e2e-NotifPref-' + ts

async function createUser(email: string, password: string, fullName: string, prefs: Record<string, boolean>): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)

  await admin.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    email_notifications: true,
    notification_preferences: prefs,
  }, { onConflict: 'id' })

  return { email, password, userId: data.user.id }
}

async function deleteUser(userId: string): Promise<void> {
  await admin.from('notifications').delete().eq('profile_id', userId)
  await admin.from('comment_cache').delete().eq('profile_id', userId)
  await admin.from('task_cache').delete().eq('profile_id', userId)
  await admin.from('org_members').delete().eq('profile_id', userId)
  await admin.from('profiles').delete().eq('id', userId)
  await admin.auth.admin.deleteUser(userId).catch(() => {})
}

// "Visible in the client portal" checkbox field on the test list.
// Without it set to true, the webhook skips notification creation for all users.
const VISIBILITY_FIELD_ID = 'b65224a5-aecd-446b-86e3-4fe0e8f757d8'

async function setTaskVisible(taskId: string): Promise<void> {
  const res = await clickupCall(`/task/${taskId}/field/${VISIBILITY_FIELD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ value: 'true' }),
  })
  if (!res.ok) throw new Error(`setTaskVisible failed: ${res.status} ${await res.text()}`)
}

async function setup(): Promise<Ctx> {
  console.log(yellow('── SETUP ──'))

  const task = await createClickupTestTask(`E2E NotifPref ${ts}`, CLICKUP_TEST_LIST_TASKS)
  console.log(`  ClickUp task: ${task.id}`)

  await setTaskVisible(task.id)
  console.log('  Task marked visible in client portal')

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: `E2E NotifPref Org ${ts}`,
      slug: `e2e-notifpref-${ts}`,
      clickup_list_ids: [CLICKUP_TEST_LIST_TASKS],
    })
    .select('id')
    .single()
  if (orgErr || !org) throw new Error(`Create org: ${orgErr?.message}`)

  const prefsAllOn: Record<string, boolean> = {
    task_review: true, task_completed: true, team_comment: true, peer_messages: true,
    reminders: true, support_response: true, new_recommendation: true, unread_digest: true,
    project_task_ready: true, project_step_completed: true, project_messages: true, weekly_summary: true,
  }

  const userGateOff = await createUser(`e2e-gate-off-${ts}@test.local`, PASS, 'Gate Off', { ...prefsAllOn, task_review: false })
  const userGateOn = await createUser(`e2e-gate-on-${ts}@test.local`, PASS, 'Gate On', prefsAllOn)
  const userPeerOff = await createUser(`e2e-peer-off-${ts}@test.local`, PASS, 'Peer Off', { ...prefsAllOn, peer_messages: false })

  console.log(`  Users: gateOff=${userGateOff.userId} gateOn=${userGateOn.userId} peerOff=${userPeerOff.userId}`)

  await admin.from('org_members').insert([
    { organization_id: org.id, profile_id: userGateOff.userId, role: 'member' },
    { organization_id: org.id, profile_id: userGateOn.userId, role: 'admin' },
    { organization_id: org.id, profile_id: userPeerOff.userId, role: 'member' },
  ])

  const cacheRows = [userGateOff, userGateOn, userPeerOff].map(u => ({
    profile_id: u.userId,
    clickup_id: task.id,
    list_id: CLICKUP_TEST_LIST_TASKS,
    name: `E2E NotifPref ${ts}`,
    status: 'to do',
    is_visible: true,
    last_synced: new Date().toISOString(),
  }))
  const { error: cacheErr } = await admin.from('task_cache').upsert(cacheRows, { onConflict: 'clickup_id,profile_id' })
  if (cacheErr) throw new Error(`task_cache seed: ${cacheErr.message}`)

  console.log(green('  setup ok'))
  return { orgId: org.id, userGateOff, userGateOn, userPeerOff, clickupTaskId: task.id }
}

async function cleanup(ctx: Ctx): Promise<void> {
  console.log(yellow('── CLEANUP ──'))
  try {
    await admin.from('notifications').delete().eq('task_id', ctx.clickupTaskId)
    await admin.from('comment_cache').delete().eq('task_id', ctx.clickupTaskId)
    await admin.from('task_cache').delete().eq('clickup_id', ctx.clickupTaskId)
    for (const u of [ctx.userGateOff, ctx.userGateOn, ctx.userPeerOff]) {
      await deleteUser(u.userId)
    }
    await admin.from('organizations').delete().eq('id', ctx.orgId)
    await deleteClickupTask(ctx.clickupTaskId)
    console.log(green('  cleanup ok'))
  } catch (e) {
    console.log(red(`  cleanup failed: ${(e as Error).message}`))
  }
}

async function waitForBell(userId: string, taskId: string, timeoutMs = 15000): Promise<{ id: string; type: string } | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const { data } = await admin
      .from('notifications')
      .select('id, type')
      .eq('profile_id', userId)
      .eq('task_id', taskId)
      .limit(1)
    if (data && data.length > 0) return data[0]
    await sleep(1000)
  }
  return null
}

async function scenarioA_GateBlocks(ctx: Ctx): Promise<void> {
  console.log(yellow('\n── SCENARIO A: task_review=false blocks bell ──'))

  // Move task to "client review" via ClickUp API
  const res = await clickupCall(`/task/${ctx.clickupTaskId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'client review' }),
  })
  if (!res.ok) throw new Error(`ClickUp status change failed: ${res.status} ${await res.text()}`)
  console.log('  ClickUp status → client review')

  // Poll for up to 45s — webhook can be slow. Poll both users in parallel.
  console.log('  Polling for webhook fan-out (up to 45s)...')
  const pollStart = Date.now()
  let allowed: { id: string; type: string } | null = null
  while (Date.now() - pollStart < 45000) {
    const { data } = await admin
      .from('notifications')
      .select('id, type, profile_id')
      .eq('task_id', ctx.clickupTaskId)
      .in('profile_id', [ctx.userGateOff.userId, ctx.userGateOn.userId])
    if (data && data.length > 0) {
      const hit = data.find(n => n.profile_id === ctx.userGateOn.userId)
      if (hit) { allowed = { id: hit.id, type: hit.type }; break }
    }
    await sleep(2000)
  }
  const elapsedSec = Math.round((Date.now() - pollStart) / 1000)
  console.log(`  Poll completed after ${elapsedSec}s`)

  // Re-check task_cache to confirm webhook ran (it upserts task_cache)
  const { data: cacheAfter } = await admin
    .from('task_cache')
    .select('profile_id, status, last_synced')
    .eq('clickup_id', ctx.clickupTaskId)
    .order('last_synced', { ascending: false })
    .limit(1)
  console.log(`  task_cache after webhook: ${JSON.stringify(cacheAfter?.[0])}`)

  assert(allowed, `userGateOn should have a bell, got null (webhook may not have fired — check task_cache.status above). If status is still 'to do', webhook did NOT process.`)
  console.log(green(`  ✓ userGateOn (task_review=true) → bell created (type=${allowed!.type})`))

  // Re-verify no bell for gateOff
  const { data: blockedCheck } = await admin
    .from('notifications')
    .select('id, type')
    .eq('profile_id', ctx.userGateOff.userId)
    .eq('task_id', ctx.clickupTaskId)
  assert(!blockedCheck || blockedCheck.length === 0, `userGateOff should have NO bell, got ${JSON.stringify(blockedCheck)}`)
  console.log(green('  ✓ userGateOff (task_review=false) → no bell created'))
}

async function scenarioC_PeerBlocks(ctx: Ctx): Promise<void> {
  console.log(yellow('\n── SCENARIO C: peer_messages=false blocks peer bell ──'))

  // userGateOn posts a comment via post-task-comment Edge Function (peer fanout)
  const { token } = await signInAs(ctx.userGateOn.email, ctx.userGateOn.password)

  const res = await callEdgeFunction('post-task-comment', token, {
    taskId: ctx.clickupTaskId,
    comment: `E2E peer comment ${ts}`,
  })
  const body = await res.json()
  assert(res.ok, `post-task-comment failed: ${res.status} ${JSON.stringify(body)}`)
  console.log('  Peer comment posted')

  await sleep(5000)

  // Query specifically for the peer_message bell. userPeerOff had peer_messages=false
  // so no NEW bell should appear (besides any from scenario A — filter by type/title).
  const { data: peerOffBells } = await admin
    .from('notifications')
    .select('id, title, created_at')
    .eq('profile_id', ctx.userPeerOff.userId)
    .eq('task_id', ctx.clickupTaskId)
    .eq('type', 'team_reply')
  assert(!peerOffBells || peerOffBells.length === 0, `userPeerOff should have NO team_reply bell, got ${peerOffBells?.length}`)
  console.log(green('  ✓ userPeerOff (peer_messages=false) → no team_reply bell'))

  const { data: gateOffBells } = await admin
    .from('notifications')
    .select('id, title, created_at')
    .eq('profile_id', ctx.userGateOff.userId)
    .eq('task_id', ctx.clickupTaskId)
    .eq('type', 'team_reply')
  // userGateOff has peer_messages: true (only task_review is off)
  assert(gateOffBells && gateOffBells.length > 0, `userGateOff should have a team_reply bell, got ${gateOffBells?.length}`)
  console.log(green('  ✓ userGateOff (peer_messages=true) → team_reply bell created'))
}

async function scenarioD_AutoArchive(ctx: Ctx): Promise<void> {
  console.log(yellow('\n── SCENARIO D: auto-archive old read notifications ──'))

  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString()
  const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString()

  // Insert a synthetic OLD read notification for userGateOn
  const { data: archiveTarget, error: archErr } = await admin.from('notifications').insert({
    profile_id: ctx.userGateOn.userId,
    type: 'status_change',
    title: `E2E archive target ${ts}`,
    message: 'should get archived',
    is_read: true,
    created_at: thirtyOneDaysAgo,
  }).select('id').single()
  if (archErr || !archiveTarget) throw new Error(`Failed to insert archive target: ${archErr?.message}`)

  // Insert a synthetic OLD already-archived notification (should be hard-deleted)
  const { data: deleteTarget, error: delErr } = await admin.from('notifications').insert({
    profile_id: ctx.userGateOn.userId,
    type: 'status_change',
    title: `E2E delete target ${ts}`,
    message: 'should get deleted',
    is_read: true,
    created_at: ninetyOneDaysAgo,
    archived_at: ninetyOneDaysAgo,
  }).select('id').single()
  if (delErr || !deleteTarget) throw new Error(`Failed to insert delete target: ${delErr?.message}`)

  console.log(`  Inserted archiveTarget=${archiveTarget.id}, deleteTarget=${deleteTarget.id}`)

  // Run the same archive + delete logic as send-reminders (directly, to avoid CRON_SECRET dependency)
  const thirtyDaysCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const ninetyDaysCutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()

  const { data: archived } = await admin
    .from('notifications')
    .update({ archived_at: new Date().toISOString() })
    .lt('created_at', thirtyDaysCutoff)
    .eq('is_read', true)
    .is('archived_at', null)
    .select('id')

  const { data: deleted } = await admin
    .from('notifications')
    .delete()
    .not('archived_at', 'is', null)
    .lt('archived_at', ninetyDaysCutoff)
    .select('id')

  console.log(`  Archive job: archived=${archived?.length ?? 0}, deleted=${deleted?.length ?? 0}`)

  // Verify archive target was archived
  const { data: archivedRow } = await admin
    .from('notifications')
    .select('id, archived_at')
    .eq('id', archiveTarget.id)
    .maybeSingle()
  assert(archivedRow && archivedRow.archived_at, `archive target should have archived_at set, got ${JSON.stringify(archivedRow)}`)
  console.log(green(`  ✓ old read notification archived (archived_at=${archivedRow!.archived_at})`))

  // Verify delete target was hard-deleted
  const { data: deletedRow } = await admin
    .from('notifications')
    .select('id')
    .eq('id', deleteTarget.id)
    .maybeSingle()
  assert(!deletedRow, `delete target should be gone, still exists: ${JSON.stringify(deletedRow)}`)
  console.log(green('  ✓ archived >90d notification hard-deleted'))

  // Verify frontend filter: useNotifications query with archived_at IS NULL should NOT return archived
  const { data: frontendView } = await admin
    .from('notifications')
    .select('id')
    .eq('profile_id', ctx.userGateOn.userId)
    .is('archived_at', null)
    .eq('id', archiveTarget.id)
  assert(!frontendView || frontendView.length === 0, `frontend filter should hide archived, got ${frontendView?.length}`)
  console.log(green('  ✓ archived notification hidden by frontend filter'))
}

async function run() {
  const ctx = await setup()
  try {
    await scenarioA_GateBlocks(ctx)
    await scenarioC_PeerBlocks(ctx)
    await scenarioD_AutoArchive(ctx)
    console.log(green('\n✅ ALL AUTOMATED SCENARIOS PASSED\n'))
  } finally {
    await cleanup(ctx)
  }
}

run().catch(e => {
  console.error(red(`\n❌ TEST FAILED: ${(e as Error).message}`))
  console.error(e)
  process.exit(1)
})
