import { describe, test, expect } from 'vitest'
import {
  canUserSeeTask,
  resolveDepartmentName,
  getValidDepartmentIds,
  type DepartmentOption,
} from '../lib/visibility-filter'

// Sample department option UUIDs (stable across renames)
const OPT_SEO = 'opt-seo-uuid'
const OPT_MARKETING = 'opt-marketing-uuid'
const OPT_BUCHHALTUNG = 'opt-buchhaltung-uuid'

const USER_A = 'user-a-uuid'
const USER_B = 'user-b-uuid'

describe('canUserSeeTask', () => {
  // ---- Admin sees all ----
  test('admin sees task with departments', () => {
    expect(canUserSeeTask('admin', [], [OPT_SEO], null, USER_A)).toBe(true)
  })

  test('admin sees untagged task', () => {
    expect(canUserSeeTask('admin', [], [], null, USER_A)).toBe(true)
  })

  test('admin sees task even with non-matching departments', () => {
    expect(canUserSeeTask('admin', [OPT_BUCHHALTUNG], [OPT_SEO], null, USER_A)).toBe(true)
  })

  // ---- Member with empty departments (legacy fallback) ----
  test('member with empty departments sees all tasks', () => {
    expect(canUserSeeTask('member', [], [OPT_SEO, OPT_MARKETING], null, USER_A)).toBe(true)
  })

  test('member with empty departments sees untagged task', () => {
    expect(canUserSeeTask('member', [], [], null, USER_A)).toBe(true)
  })

  // ---- Member with departments: matching ----
  test('member with matching department sees task', () => {
    expect(canUserSeeTask('member', [OPT_SEO], [OPT_SEO, OPT_MARKETING], null, USER_A)).toBe(true)
  })

  test('member with partial overlap sees task', () => {
    expect(canUserSeeTask('member', [OPT_SEO, OPT_BUCHHALTUNG], [OPT_MARKETING, OPT_SEO], null, USER_A)).toBe(true)
  })

  // ---- Member with departments: not matching ----
  test('member with non-matching departments does NOT see task', () => {
    expect(canUserSeeTask('member', [OPT_BUCHHALTUNG], [OPT_SEO, OPT_MARKETING], null, USER_A)).toBe(false)
  })

  // ---- Untagged tasks are public ----
  test('member with departments sees untagged task', () => {
    expect(canUserSeeTask('member', [OPT_SEO], [], null, USER_A)).toBe(true)
  })

  // ---- Creator override ----
  test('creator sees own task even without department match', () => {
    expect(canUserSeeTask('member', [OPT_BUCHHALTUNG], [OPT_SEO], USER_A, USER_A)).toBe(true)
  })

  test('non-creator without match does NOT see task', () => {
    expect(canUserSeeTask('member', [OPT_BUCHHALTUNG], [OPT_SEO], USER_B, USER_A)).toBe(false)
  })

  test('creator override with null creator_id does not apply', () => {
    expect(canUserSeeTask('member', [OPT_BUCHHALTUNG], [OPT_SEO], null, USER_A)).toBe(false)
  })

  // ---- Viewer role ----
  test('viewer with empty departments sees all (legacy)', () => {
    // Viewer role is not filtered differently by this predicate.
    // Viewer restrictions are enforced elsewhere (action gating, email exclusion).
    // The visibility predicate treats viewers like members for display purposes.
    expect(canUserSeeTask('viewer', [], [OPT_SEO], null, USER_A)).toBe(true)
  })

  test('viewer with departments is filtered same as member', () => {
    expect(canUserSeeTask('viewer', [OPT_BUCHHALTUNG], [OPT_SEO], null, USER_A)).toBe(false)
  })
})

describe('resolveDepartmentName', () => {
  const cache: DepartmentOption[] = [
    { id: OPT_SEO, name: 'SEO', color: '#ff0000' },
    { id: OPT_MARKETING, name: 'Marketing', color: '#00ff00' },
  ]

  test('resolves known option to name', () => {
    expect(resolveDepartmentName(OPT_SEO, cache)).toBe('SEO')
  })

  test('returns option_id for orphan (not in cache)', () => {
    expect(resolveDepartmentName(OPT_BUCHHALTUNG, cache)).toBe(OPT_BUCHHALTUNG)
  })

  test('returns option_id for empty cache', () => {
    expect(resolveDepartmentName(OPT_SEO, [])).toBe(OPT_SEO)
  })
})

describe('getValidDepartmentIds', () => {
  const cache: DepartmentOption[] = [
    { id: OPT_SEO, name: 'SEO' },
    { id: OPT_MARKETING, name: 'Marketing' },
  ]

  test('filters to valid IDs only', () => {
    expect(getValidDepartmentIds([OPT_SEO, OPT_BUCHHALTUNG], cache)).toEqual([OPT_SEO])
  })

  test('returns empty for all orphan IDs', () => {
    expect(getValidDepartmentIds([OPT_BUCHHALTUNG], cache)).toEqual([])
  })

  test('returns all when all valid', () => {
    expect(getValidDepartmentIds([OPT_SEO, OPT_MARKETING], cache)).toEqual([OPT_SEO, OPT_MARKETING])
  })

  test('handles empty input', () => {
    expect(getValidDepartmentIds([], cache)).toEqual([])
  })
})
