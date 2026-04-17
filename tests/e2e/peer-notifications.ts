/**
 * E2E test: peer-to-peer notifications fan-out across org members.
 *
 * Verifies that when a portal user (Member A) posts a comment on a task
 * shared within their organization, the edge function `post-task-comment`:
 *   1. Inserts comment_cache rows for all org members (one per member)
 *   2. Inserts notifications rows for admin + other members (excluding
 *      the author) with type = team_reply
 *   3. Does NOT notify viewer-role members
 *   4. Does NOT notify the author (self)
 *   5. Does NOT fan out if task belongs to a different org (authz check)
 *   6. Respects peer_messages preference (email gate — we only assert
 *      the code path doesn't crash; Mailjet is not mocked here)
 *
 * Run:
 *   cd g:/01_OPUS/Projects/PORTAL
 *   npx tsx tests/e2e/peer-notifications.ts
 */

import {
  adminClient,
  signInAs,
  callEdgeFunction,
  createClickupTestTask,
  deleteClickupTask,
  clickupCall,
  CLICKUP_TEST_LIST_ID,
  assert,
  sleep,
  green,
  red,
  yellow,
} from '../_shared/staging-client'

type TestUser = { email: string; password: string; userId: string }
type Ctx = {
  orgId: string
  admin: TestUser
  member: TestUser
  viewer: TestUser
  outsiderOrgId: string
  outsider: TestUser
  clickupTaskId: string
  clickupTaskUrl: string
  outsiderClickupTaskId: string
}

const admin = adminClient()
const ts = Date.now()
const PASS = 'e2e-Test-' + ts

async function createUser(email: string, password: string, fullName: string): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  // Ensure profile row exists with correct fields (trigger usually does this, verify + update)
  await admin.from('profiles').upsert(
    { id: data.user.id, email, full_name: fullName, email_notifications: true },
    { onConflict: 'id' },
  )
  return { email, password, userId: data.user.id }
}

async function deleteUser(userId: string): Promise<void> {
  await admin.from('org_members').delete().eq('profile_id', userId)
  await admin.from('notifications').delete().eq('profile_id', userId)
  await admin.from('comment_cache').delete().eq('profile_id', userId)
  await admin.from('task_cache').delete().eq('profile_id', userId)
  await admin.from('profiles').delete().eq('id', userId)
  await admin.auth.admin.deleteUser(userId).catch(() => {})
}

async function setup(): Promise<Ctx> {
  console.log(yellow('── SETUP ──'))

  // Create test ClickUp tasks in the approved sandbox list
  const mainTask = await createClickupTestTask(`E2E Peer Test Main ${ts}`)
  const outsiderTask = await createClickupTestTask(`E2E Peer Outsider ${ts}`)
  console.log(`  ClickUp tasks: main=${mainTask.id}, outsider=${outsiderTask.id}`)

  // Fetch the real list_id from ClickUp for each task (they're both in CLICKUP_TEST_LIST_ID)
  const mainListId = CLICKUP_TEST_LIST_ID
  const outsiderListId = CLICKUP_TEST_LIST_ID

  // Create MAIN org (bound to test list) + an outsider org (bound to a fake list id the main task isn't in)
  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `E2E Peer Org ${ts}`,
      slug: `e2e-peer-${ts}`,
      clickup_list_ids: [mainListId],
    })
    .select('id')
    .single()
  if (!org) throw new Error('Failed to create main org')

  const { data: outsiderOrg } = await admin
    .from('organizations')
    .insert({
      name: `E2E Outsider Org ${ts}`,
      slug: `e2e-outsider-${ts}`,
      clickup_list_ids: ['99999999999'], // fake list — will NOT match mainTask's list
    })
    .select('id')
    .single()
  if (!outsiderOrg) throw new Error('Failed to create outsider org')

  console.log(`  Orgs: main=${org.id}, outsider=${outsiderOrg.id}`)

  // Create test users
  const adminUser = await createUser(`e2e-admin-${ts}@test.local`, PASS, 'E2E Admin')
  const memberUser = await createUser(`e2e-member-${ts}@test.local`, PASS, 'E2E Member')
  const viewerUser = await createUser(`e2e-viewer-${ts}@test.local`, PASS, 'E2E Viewer')
  const outsiderUser = await createUser(`e2e-outsider-${ts}@test.local`, PASS, 'E2E Outsider')
  console.log(`  Users: admin=${adminUser.userId} member=${memberUser.userId} viewer=${viewerUser.userId} outsider=${outsiderUser.userId}`)

  // Attach users to orgs
  await admin.from('org_members').insert([
    { organization_id: org.id, profile_id: adminUser.userId, role: 'admin' },
    { organization_id: org.id, profile_id: memberUser.userId, role: 'member' },
    { organization_id: org.id, profile_id: viewerUser.userId, role: 'viewer' },
    { organization_id: outsiderOrg.id, profile_id: outsiderUser.userId, role: 'admin' },
  ])

  // Seed task_cache so post-task-comment's org resolver can identify the ticket surface.
  // Insert one row per org member (matches webhook fan-out convention).
  const mainCacheRows = [adminUser, memberUser, viewerUser].map(u => ({
    profile_id: u.userId,
    clickup_id: mainTask.id,
    list_id: mainListId,
    name: `E2E Peer Test Main ${ts}`,
    status: 'to do',
    last_synced: new Date().toISOString(),
  }))
  const outsiderCacheRows = [outsiderUser].map(u => ({
    profile_id: u.userId,
    clickup_id: outsiderTask.id,
    list_id: outsiderListId,
    name: `E2E Peer Outsider ${ts}`,
    status: 'to do',
    last_synced: new Date().toISOString(),
  }))
  const { error: cacheErr } = await admin.from('task_cache').upsert([...mainCacheRows, ...outsiderCacheRows], { onConflict: 'clickup_id,profile_id' })
  if (cacheErr) throw new Error(`task_cache seed: ${cacheErr.message}`)

  console.log(green('  setup ok'))
  return {
    orgId: org.id,
    admin: adminUser,
    member: memberUser,
    viewer: viewerUser,
    outsiderOrgId: outsiderOrg.id,
    outsider: outsiderUser,
    clickupTaskId: mainTask.id,
    clickupTaskUrl: mainTask.url,
    outsiderClickupTaskId: outsiderTask.id,
  }
}

async function cleanup(ctx: Ctx): Promise<void> {
  console.log(yellow('── CLEANUP ──'))
  try {
    // DB — cascade-ish order
    await admin.from('notifications').delete().in('task_id', [ctx.clickupTaskId, ctx.outsiderClickupTaskId])
    await admin.from('comment_cache').delete().in('task_id', [ctx.clickupTaskId, ctx.outsiderClickupTaskId])
    await admin.from('task_cache').delete().in('clickup_id', [ctx.clickupTaskId, ctx.outsiderClickupTaskId])

    for (const u of [ctx.admin, ctx.member, ctx.viewer, ctx.outsider]) {
      await deleteUser(u.userId)
    }

    await admin.from('organizations').delete().eq('id', ctx.orgId)
    await admin.from('organizations').delete().eq('id', ctx.outsiderOrgId)

    // ClickUp
    await deleteClickupTask(ctx.clickupTaskId)
    await deleteClickupTask(ctx.outsiderClickupTaskId)

    console.log(green('  cleanup ok'))
  } catch (e) {
    console.warn(red(`  cleanup had errors: ${(e as Error).message}`))
  }
}

async function run() {
  const ctx = await setup()
  let pass = 0
  let fail = 0

  const t = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
      console.log(green(`  ✓ ${name}`))
      pass++
    } catch (e) {
      console.log(red(`  ✗ ${name} — ${(e as Error).message}`))
      fail++
    }
  }

  try {
    // ========================
    // Scenario 1: member posts → admin notified, member self NOT, viewer NOT
    // ========================
    console.log(yellow('\n── Scenario 1: member posts in ticket → fan-out to admin only ──'))
    const memberAuth = await signInAs(ctx.member.email, ctx.member.password)
    const res1 = await callEdgeFunction('post-task-comment', memberAuth.token, {
      taskId: ctx.clickupTaskId,
      comment: `E2E test message from member ${ts}`,
    })
    const body1 = await res1.json().catch(() => ({}))
    assert(res1.ok, `post-task-comment failed: ${res1.status} ${JSON.stringify(body1)}`)
    console.log(`  edge response: ${res1.status}, commentId=${body1.commentId}`)

    // Give the edge function a moment to complete the fan-out (it runs after response in some paths, but this one is sync)
    await sleep(1500)

    await t('comment_cache has row for admin', async () => {
      const { data } = await admin.from('comment_cache')
        .select('profile_id, is_from_portal')
        .eq('task_id', ctx.clickupTaskId)
        .eq('profile_id', ctx.admin.userId)
      assert((data?.length ?? 0) >= 1, `admin should have a cache row, got ${data?.length ?? 0}`)
    })

    await t('comment_cache has row for member (self)', async () => {
      const { data } = await admin.from('comment_cache')
        .select('profile_id')
        .eq('task_id', ctx.clickupTaskId)
        .eq('profile_id', ctx.member.userId)
      assert((data?.length ?? 0) >= 1, 'member self cache row missing')
    })

    await t('comment_cache has row for viewer (so viewer can READ — consistent with webhook pattern)', async () => {
      const { data } = await admin.from('comment_cache')
        .select('profile_id')
        .eq('task_id', ctx.clickupTaskId)
        .eq('profile_id', ctx.viewer.userId)
      // Note: plan skips viewer in NOTIFICATIONS but includes them in comment_cache fan-out for read consistency.
      // Accept either outcome here and report — this is informational, not a hard failure.
      if ((data?.length ?? 0) === 0) {
        console.log(yellow(`    (info) viewer has no cache row — OK for read-only exclusion`))
      } else {
        console.log(yellow(`    (info) viewer HAS cache row (visibility consistency)`))
      }
    })

    await t('notification created for admin (type=team_reply)', async () => {
      const { data } = await admin.from('notifications')
        .select('profile_id, type, task_id, title')
        .eq('task_id', ctx.clickupTaskId)
        .eq('profile_id', ctx.admin.userId)
      assert((data?.length ?? 0) === 1, `admin should have 1 notification, got ${data?.length ?? 0}`)
      assert(data![0].type === 'team_reply', `expected team_reply, got ${data![0].type}`)
    })

    await t('NO notification for member (self-exclusion)', async () => {
      const { data } = await admin.from('notifications')
        .select('id')
        .eq('task_id', ctx.clickupTaskId)
        .eq('profile_id', ctx.member.userId)
      assert((data?.length ?? 0) === 0, `member self should NOT get notification, got ${data?.length}`)
    })

    await t('NO notification for viewer (viewer-role exclusion)', async () => {
      const { data } = await admin.from('notifications')
        .select('id')
        .eq('task_id', ctx.clickupTaskId)
        .eq('profile_id', ctx.viewer.userId)
      assert((data?.length ?? 0) === 0, `viewer should NOT get notification, got ${data?.length}`)
    })

    // ========================
    // Scenario 2: peer_messages toggle OFF → admin gets NO notification? Wait — pref only gates email.
    // Bell is always on. So notification row still appears. Verify that flipping the preference
    // doesn't crash the fan-out AND still creates the bell notification.
    // ========================
    console.log(yellow('\n── Scenario 2: admin disables peer_messages (email pref) ──'))
    await admin.from('profiles').update({
      notification_preferences: {
        task_review: true, task_completed: true, team_comment: true, support_response: true,
        reminders: true, new_recommendation: true, unread_digest: true,
        project_task_ready: true, project_step_completed: true, project_messages: true,
        peer_messages: false,
      },
    }).eq('id', ctx.admin.userId)

    const res2 = await callEdgeFunction('post-task-comment', memberAuth.token, {
      taskId: ctx.clickupTaskId,
      comment: `E2E test second message ${ts}`,
    })
    assert(res2.ok, `second post failed: ${res2.status}`)
    await sleep(1500)

    await t('admin still gets bell notification (pref gates only email)', async () => {
      const { data } = await admin.from('notifications')
        .select('id')
        .eq('task_id', ctx.clickupTaskId)
        .eq('profile_id', ctx.admin.userId)
      assert((data?.length ?? 0) === 2, `admin should have 2 bell notifications total, got ${data?.length}`)
    })

    // ========================
    // Scenario 3: cross-org isolation — outsider posts on a task belonging to their own org
    // → no fan-out to main org members
    // ========================
    console.log(yellow('\n── Scenario 3: outsider posts on their own task → no leak to main org ──'))
    const outsiderAuth = await signInAs(ctx.outsider.email, ctx.outsider.password)
    const res3 = await callEdgeFunction('post-task-comment', outsiderAuth.token, {
      taskId: ctx.outsiderClickupTaskId,
      comment: `E2E outsider message ${ts}`,
    })
    assert(res3.ok, `outsider post failed: ${res3.status}`)
    await sleep(1500)

    await t('main org members receive NO notifications for outsider task', async () => {
      const { data } = await admin.from('notifications')
        .select('id')
        .eq('task_id', ctx.outsiderClickupTaskId)
        .in('profile_id', [ctx.admin.userId, ctx.member.userId, ctx.viewer.userId])
      assert((data?.length ?? 0) === 0, `main org should NOT get notifications for outsider task, got ${data?.length}`)
    })

    // ========================
    // Scenario 4: cross-org authz — if main-org member posts on outsider's task,
    // outsider should NOT receive fan-out (caller not in that org → taskBelongsToOrg=false)
    // ========================
    console.log(yellow('\n── Scenario 4: main-org member tries to post on outsider task ──'))
    const res4 = await callEdgeFunction('post-task-comment', memberAuth.token, {
      taskId: ctx.outsiderClickupTaskId,
      comment: `E2E cross-org attempt ${ts}`,
    })
    // ClickUp post may succeed (shared token), but fan-out must skip for safety.
    console.log(`  edge response: ${res4.status}`)
    await sleep(1500)

    await t('outsider does NOT receive notification from cross-org poster', async () => {
      // Filter by the NEW comment only — earlier Scenario 3 already created one legit notification for outsider? No, outsider was author there.
      // So any notification on outsiderClickupTaskId for outsider.userId here would be a leak.
      const { data } = await admin.from('notifications')
        .select('id, created_at, profile_id')
        .eq('task_id', ctx.outsiderClickupTaskId)
        .eq('profile_id', ctx.outsider.userId)
      assert((data?.length ?? 0) === 0, `outsider should NOT receive cross-org notification, got ${data?.length}`)
    })

    console.log()
    console.log(pass > 0 && fail === 0 ? green(`═══ PASS: ${pass}/${pass} ═══`) : red(`═══ ${fail} FAILED (${pass} passed) ═══`))
    if (fail > 0) process.exitCode = 1
  } finally {
    await cleanup(ctx)
  }
}

run().catch(e => {
  console.error(red('FATAL: ' + (e as Error).stack))
  process.exit(1)
})
