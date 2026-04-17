/**
 * Read-only inspection of staging state — orgs, members, test-list linkage.
 * Run: npx tsx tests/e2e/_inspect-staging.ts
 */
import { adminClient, CLICKUP_TEST_LIST_ID } from '../_shared/staging-client'

const sb = adminClient()

const { data: orgs } = await sb.from('organizations').select('id, name, slug, clickup_list_ids, nextcloud_client_root, support_task_id').order('created_at')
console.log('=== ORGS ===')
for (const o of orgs ?? []) {
  console.log(`  ${o.id}  ${o.name}  (slug=${o.slug})  lists=${JSON.stringify(o.clickup_list_ids)}  support=${o.support_task_id}`)
}

const orgsWithTestList = (orgs ?? []).filter(o => (o.clickup_list_ids ?? []).map(String).includes(CLICKUP_TEST_LIST_ID))
console.log(`\n=== ORGS WITH TEST LIST ${CLICKUP_TEST_LIST_ID} ===`)
console.log(orgsWithTestList.length === 0 ? '  (none)' : orgsWithTestList.map(o => `  ${o.name} (${o.id})`).join('\n'))

const { data: members } = await sb
  .from('org_members')
  .select('organization_id, role, profile_id, invited_email, created_at')
  .order('organization_id')
console.log(`\n=== ORG MEMBERS (${members?.length ?? 0}) ===`)
for (const m of members ?? []) {
  const { data: prof } = await sb.from('profiles').select('email, full_name').eq('id', m.profile_id).single()
  console.log(`  org=${m.organization_id}  role=${m.role}  ${prof?.email ?? '?'}  (${prof?.full_name ?? '?'})  invited=${m.invited_email ?? '—'}`)
}

const { count: taskCount } = await sb.from('task_cache').select('*', { count: 'exact', head: true })
const { count: commentCount } = await sb.from('comment_cache').select('*', { count: 'exact', head: true })
const { count: notifCount } = await sb.from('notifications').select('*', { count: 'exact', head: true })
console.log(`\n=== COUNTS ===`)
console.log(`  task_cache: ${taskCount}`)
console.log(`  comment_cache: ${commentCount}`)
console.log(`  notifications: ${notifCount}`)
