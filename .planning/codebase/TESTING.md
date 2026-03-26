# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Runner:**
- Vitest v4.0.18
- Config: `vitest.config.ts`
- Environment: jsdom (browser DOM simulation)
- Setup file: `src/test/setup.ts` (loads jest-dom matchers)

**Assertion Library:**
- `@testing-library/jest-dom` v6.9.1 — provides DOM matchers like `.toBeInTheDocument()`
- `@testing-library/react` v16.3.2 — React component testing utilities

**Run Commands:**
```bash
npm run test              # Run all tests once, exit
npm run test:watch       # Watch mode, re-run on file change
npm run test:coverage    # Coverage report with v8
```

## Test File Organization

**Location:**
- Co-located with source: `src/modules/*/components/`, `src/modules/*/hooks/`
- Centralized in `__tests__/` directories: `src/modules/tickets/__tests__/`, `src/modules/projects/__tests__/`
- Root tests: `src/__tests__/` for cross-module utilities

**Naming:**
- Unit tests: `{name}.test.ts` or `{name}.test.tsx`
- Smoke tests (minimal coverage): `{name}.smoke.test.ts`
- Both extensions used interchangeably

**Current test inventory:**
```
src/modules/projects/__tests__/
├── memory-access.test.ts
├── memory-store.test.ts
├── overview-interpretation.test.ts
└── transforms-project.test.ts

src/modules/tickets/__tests__/
├── status-mapping.test.ts
├── support-chat.test.tsx
├── task-detail-sheet.test.tsx
├── task-list-search.test.ts
├── transforms.test.ts
└── useTasks.smoke.test.ts

src/__tests__/
└── clickup-contract.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComponentName } from '../ComponentName'

describe('ComponentName', () => {
  test('renders expected content', () => {
    render(<ComponentName />)
    expect(screen.getByText('Expected')).toBeInTheDocument()
  })
})
```

**Patterns:**

1. **Grouped by function/component:**
   - One `describe()` block per exported function or component
   - Multiple test cases within each describe block
   - Clear test names: `test('maps "to do" → "open"')`

2. **Setup/Teardown:**
   - `beforeEach()` for test state initialization
   - `afterEach()` for cleanup (especially env mocking)
   - Example: `vi.unstubAllEnvs()` after each test to prevent pollution

3. **Assertion patterns:**
   - Single assertion per test (or grouped related assertions)
   - Use `test.each()` for parametrized tests
   - Explicit matchers: `.toBe()`, `.toEqual()`, `.toBeInTheDocument()`

## Mocking

**Framework:** Vitest's `vi` module for mocking

**Patterns:**

1. **Module mocking with `hoisted()`:**
```typescript
const mocks = vi.hoisted(() => ({
  singleTask: vi.fn(),
  markAsRead: vi.fn(),
}))

vi.mock('../hooks/useSingleTask', () => ({
  useSingleTask: (...args: unknown[]) => mocks.singleTask(...args),
}))
```

2. **Hook mocking:**
```typescript
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
```

3. **Component mocking:**
```typescript
vi.mock('../components/TaskDetail', () => ({
  TaskDetail: ({ task }: { task: ClickUpTask }) =>
    <div data-testid="task-detail">{task.name}</div>,
}))
```

4. **Environment variable stubbing:**
```typescript
vi.stubEnv('VITE_MEMORY_OPERATOR_EMAILS', 'ops@example.com, second@example.com')
// Always clean up after tests
afterEach(() => {
  vi.unstubAllEnvs()
})
```

**What to Mock:**
- External dependencies (hooks from other modules)
- Complex components that aren't being tested directly
- Environment variables that control behavior
- Anything that would add external I/O or side effects

**What NOT to Mock:**
- The function/component being tested
- Small utility functions (mapStatus, transforms)
- Simple presentational components that communicate intent
- Return values — let them flow naturally

## Fixtures and Factories

**Test Data:**

Example factory from `task-detail-sheet.test.tsx`:
```typescript
function makeTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: overrides.clickup_id ?? 'task-1',
    clickup_id: overrides.clickup_id ?? 'task-1',
    name: 'Fallback task',
    description: '',
    status: 'open',
    status_color: '#000',
    priority: null,
    priority_color: null,
    due_date: null,
    time_estimate: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    assignees: [],
    tags: [],
    url: '',
    list_id: 'list-1',
    list_name: 'Support',
    ...overrides,
  }
}
```

**Usage:**
- Create fixture functions (factory pattern) that return test data with sensible defaults
- Accept `overrides` object to customize for specific test case
- Prevents duplicating large test data structures across tests

**Location:**
- Inline in test files (not shared yet, since coverage is limited)
- Candidates for extraction to `src/test/fixtures/` if needed across modules

## Coverage

**Requirements:** Not enforced; no coverage threshold in `vitest.config.ts`

**View Coverage:**
```bash
npm run test:coverage
```

Generates report in `coverage/` directory with HTML and text output. Coverage includes:
- Statements
- Branches
- Functions
- Lines

**Current state:** Partial coverage on core modules (tickets, projects); untested areas: file components, most pages

## Test Types

**Unit Tests:**
- Scope: Single function or component behavior
- Approach: Mock dependencies, test inputs/outputs
- Examples: `status-mapping.test.ts`, `memory-access.test.ts`, `transforms.test.ts`

**Integration Tests:**
- Scope: Multiple functions interacting (less common in this codebase)
- Approach: Test data flow through transforms, status mapping
- Example: `overview-interpretation.test.ts` tests full project data transformation

**E2E Tests:**
- Framework: Not used
- Alternative: Playwright could be added for browser-level testing (not currently configured)

## Common Patterns

**Parametrized Testing (test.each):**

From `status-mapping.test.ts`:
```typescript
test.each([
  ['to do',           'open'],
  ['in progress',     'in_progress'],
  ['internal review', 'in_progress'],
  ['rework',          'in_progress'],
  ['client review',   'needs_attention'],
  // ...
])('maps "%s" → "%s"', (clickup, portal) => {
  expect(mapStatus(clickup)).toBe(portal);
});
```

**Renders + Screen Query:**

From `support-chat.test.tsx`:
```typescript
beforeEach(() => {
  mocks.supportTaskChat.mockReturnValue({
    comments: [
      {
        id: 'comment-1',
        text: 'Hallo',
        created_at: '2026-01-01T10:00:00.000Z',
        isFromPortal: false,
        author: { name: 'Portal Team' },
      },
    ],
    // ...
  })
})

test('calls onRead when support chat is active and ready', () => {
  const onRead = vi.fn()
  render(<SupportChat active onRead={onRead} />)

  expect(screen.getByText('Hallo')).toBeInTheDocument()
  expect(onRead).toHaveBeenCalledTimes(1)
})
```

**Async Testing:**

Standard async/await in vitest:
```typescript
test('async operation completes', async () => {
  const result = await fetchData()
  expect(result).toBeDefined()
})
```

Vitest handles async tests automatically; no need for done callbacks.

**Error Testing:**

From `memory-access.test.ts`:
```typescript
test('matches signed-in operator email against allow-list', () => {
  vi.stubEnv('VITE_MEMORY_OPERATOR_EMAILS', 'ops@example.com')
  expect(isMemoryOperator({ email: 'ops@example.com' } as never)).toBe(true)
  expect(isMemoryOperator({ email: 'client@example.com' } as never)).toBe(false)
})
```

**Mock Reset Pattern:**

From `task-detail-sheet.test.tsx`:
```typescript
beforeEach(() => {
  mocks.markAsRead.mockReset()
  mocks.singleTask.mockReturnValue({
    task: null,
    isLoading: false,
    isError: false,
    isNotFound: false,
    error: null,
  })
})
```

Resets all mocks before each test to prevent test pollution. Return default state so tests can customize as needed.

## Critical Testing Constraints

**Module isolation:** Tests mock dependencies from other modules to avoid tight coupling and slow runs

**No external APIs:** All network calls are mocked; tests run offline

**Deterministic:** No time-dependent tests; timestamp mocking possible but not yet used

**Fast:** Tests complete in seconds; vitest watch mode enables rapid feedback

## Test Coverage Gaps (Observed)

**Untested areas:**
- File upload/download components (`FileUpload.tsx`, `FolderView.tsx`)
- Page-level components (`TicketsPage`, `OverviewPage`, `DateienPage`)
- Complex component interactions (TaskDetailSheet rendering logic)
- Error edge cases in hooks (network failures, Realtime subscription failures)
- UI state transitions (sheet open/close, filters)

**Next priorities:**
1. Add integration tests for task/project data flows
2. Page-level smoke tests for navigation
3. Error boundary testing for component recovery

---

*Testing analysis: 2026-03-26*
