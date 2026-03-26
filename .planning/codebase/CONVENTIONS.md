# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- Components: PascalCase (`DynamicHero.tsx`, `StatusBadge.tsx`, `FileUpload.tsx`)
- Hooks: camelCase with `use` prefix (`useClickUpTasks.ts`, `useAuth.ts`, `useWorkspaces.ts`)
- Utilities/helpers: camelCase (`status-mapping.ts`, `transforms.ts`, `logger.ts`, `utils.ts`)
- Types: PascalCase in separate `types/` directories (`tasks.ts`, `project.ts`, `common.ts`)
- Tests: `{name}.test.ts` or `{name}.spec.tsx` — co-located in `__tests__/` directory

**Functions:**
- camelCase for all functions: `mapStatus()`, `transformCachedTask()`, `createLogger()`
- React components exported as named exports in PascalCase: `export function DynamicHero()`
- Hooks are functions prefixed with `use`: `export function useClickUpTasks()`
- Helper functions often prefixed with verb: `fetchCachedTasks()`, `updateTaskCache()`, `formatLog()`

**Variables:**
- camelCase for all variables: `queryClient`, `userId`, `realtimeDebounceRef`, `isDragOver`
- Use descriptive names reflecting purpose or type: `isMountedRef` (cleanup marker), `abortControllerRef` (lifecycle control)
- Ref variables suffixed with `Ref`: `inputRef`, `abortControllerRef`, `realtimeDebounceRef`, `isMountedRef`
- Boolean flags prefixed with `is`/`has`: `isLoading`, `hasData`, `isDragOver`, `isRefreshing`

**Types:**
- All types/interfaces in PascalCase: `TaskStatus`, `ClickUpTask`, `CachedTask`, `AuthContextValue`
- Union types readable and grouped: `type TaskStatus = 'open' | 'in_progress' | 'needs_attention'`
- Props interfaces suffixed with `Props`: `FileUploadProps`, `DynamicHeroProps`, `ButtonProps`
- Record types explicit about shape: `Record<string, { bg: string; text: string; dot: string }>`

## Code Style

**Formatting:**
- ESLint v9.39.1 with TypeScript plugin
- No Prettier config — relying on ESLint formatting rules
- Target: ES2022
- Indentation: 2 spaces (inferred from codebase)
- Line length: Pragmatic, no hard limit enforced

**Linting:**
- Config: `eslint.config.js`
- Extends: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- Strict TypeScript enabled (`noUnusedLocals`, `noUnusedParameters`, `strict: true`)
- React hooks plugin enforces dependency arrays and rules of hooks

## Import Organization

**Order:**
1. React/external libraries (`import { useState } from 'react'`)
2. Third-party packages (`import { useQuery } from '@tanstack/react-query'`, `import { toast } from 'sonner'`)
3. Absolute imports from project root (`import { supabase } from '@/shared/lib/supabase'`)
4. Local relative imports (`import { transformCachedTask } from '../lib/transforms'`)
5. Type imports (`import type { ClickUpTask } from '../types/tasks'`)

**Path Aliases:**
- `@/*` maps to `./src/*` — used throughout for cleaner imports
- All imports within `src/` use `@/` prefix: `@/shared/hooks/useAuth`, `@/modules/projects/...`

**Common patterns:**
```typescript
// External + types
import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ClickUpTask } from '../types/tasks'

// Shared layer
import { supabase } from '@/shared/lib/supabase'
import type { Profile } from '@/shared/types/common'
import { useAuth } from '@/shared/hooks/useAuth'

// Module-specific
import { transformCachedTask } from '../lib/transforms'
import type { CachedTask } from '../types/tasks'
```

## Error Handling

**Patterns:**
- Functions return `{ error: Error | null }` tuples for operations that may fail
- Async functions throw errors for unexpected conditions; catch and log at hook/component level
- Supabase query errors checked and handled: `if (error) { log.error(); return []; }`
- React Query uses default error states; components read from `.isError`, `.error` properties
- Toast notifications for user-facing errors: `toast.error('Titel', { description: 'Detail' })`
- No try-catch in render paths; errors from mutations caught at higher level

**Example from `useClickUpTasks`:**
```typescript
const { data, error } = await supabase.auth.getUser();
if (!user) return [];

const { data, error } = await supabase
  .from('task_cache')
  .select('*')
  .eq('profile_id', user.id);

if (error) {
  log.error('Failed to fetch cached tasks', { error: error.message });
  return [];
}
```

## Logging

**Framework:** Custom `createLogger()` utility in `src/modules/tickets/lib/logger.ts`

**Patterns:**
- Create contextual logger at module top: `const log = createLogger('useClickUpTasks')`
- Levels: DEBUG, INFO, WARN, ERROR
- Development: all levels logged; Production: INFO+ only
- Sensitive data auto-redacted (email, password, token, apikey, secret)
- Format: `[timestamp] [level] [context] message`

**Usage:**
```typescript
log.debug('Debug info', { data: value });
log.info('Returning cached tasks', { count: cached.length });
log.warn('Potential issue', { value });
log.error('Failed to fetch cached tasks', { error: error.message });
```

**Data object automatically sanitized:**
- Keys matching `['email', 'password', 'token', 'authorization', 'apikey', 'secret']` redacted to `'[REDACTED]'`
- Safe to log objects without manual secrets filtering

## Comments

**When to Comment:**
- Explain *why*, not what: `// Realtime subscription — matches the working pattern from useProject.ts`
- Mark critical architectural rules: `// CRITICAL: top-level task_cache columns ALWAYS override raw_data`
- Document non-obvious state management: `// Background refresh — once per mount to catch up on missed changes`
- Flag known limitations or workarounds: `// Key differences vs previous broken version:`
- Leave architectural decisions for code, not comments — use code structure to communicate

**JSDoc/TSDoc:**
- Minimal use observed — code is self-documenting through types and names
- Main exports may have brief summary: `// Structured logging utility. Shared-quality but kept in module for now.`
- Function interfaces describe intent through parameter names: `function fetchCachedTasks(): Promise<ClickUpTask[]>`

## Function Design

**Size:** Components and custom hooks stay under 150 lines; helpers extracted to lib/ as needed

**Parameters:**
- Destructured from objects when 2+ params: `function DynamicHero({ project, overview, onOpenStep }: DynamicHeroProps)`
- React event handlers use `React.ChangeEvent<T>` types: `(e: React.ChangeEvent<HTMLInputElement>)`
- Type parameters when needed: `<T extends object>` for generic utilities

**Return Values:**
- Functions return single values or typed objects
- Async functions return Promises with explicit type: `Promise<ClickUpTask[]>`
- Query hooks return custom objects with computed properties: `return { ...query, forceRefresh };`
- Hooks may return objects destructured by consumer: `const { user, isLoading } = useAuth();`

## Module Design

**Exports:**
- All exports are named, not default
- Components: `export function ComponentName()`
- Hooks: `export function useHookName()`
- Types: `export type TypeName = ...` and `export interface InterfaceName { ... }`
- Constants: `export const CONSTANT_NAME = value`

**Barrel Files:**
- Not used — imports are direct to modules/files
- Example: `import { useClickUpTasks } from '@/modules/tickets/hooks/useClickUpTasks'` (not from index)

**Module Structure:**
```
src/modules/{module}/
├── components/        # React components
├── hooks/             # Custom hooks (useModule, useData, etc.)
├── lib/               # Utilities, transforms, constants, logger
├── types/             # TypeScript types and interfaces
├── pages/             # Page-level components (full layouts)
├── __tests__/         # Test files co-located by module
└── index.ts?          # Rarely used; direct imports preferred
```

## React Patterns

**Hooks Dependencies:**
- All useEffect/useCallback deps explicitly listed and verified by linter
- Refs for lifecycle cleanup: `isMountedRef`, `abortControllerRef` prevent memory leaks
- Realtime subscriptions cleanup in useEffect return: `supabase.removeChannel(channel)`
- AbortController used for fetch cancellation in background operations

**Context & Providers:**
- Single context created with `createContext<T | null>(null)`
- Hook throws descriptive error if used outside provider: `throw new Error('useAuth must be used within AuthProvider')`
- Provider wraps tree with `createElement()` to avoid React Fast Refresh issues

**Event Handlers:**
- useCallback for all event handlers to maintain referential equality
- Drag/drop: `onDrop`, `onDragOver`, `onDragLeave` with `preventDefault()`
- Change events: `onInputChange` follows React naming convention

## Status Mapping (Critical Pattern)

**All status comparisons use `mapStatus()`:**
- ClickUp status strings are raw from API (`'client review'`, `'in progress'`)
- Portal normalizes to enum-like TaskStatus: `'needs_attention'`, `'in_progress'`, `'done'`
- **RULE:** Always call `mapStatus(task.status)` before comparing or rendering
- Source of truth: `src/modules/tickets/lib/status-mapping.ts`

```typescript
// CORRECT
const isAttention = mapStatus(task.status) === 'needs_attention';

// WRONG — string comparison unreliable
if (task.status === 'client review') { ... }
```

## Data Transformation

**Pattern:** Separate `transforms.ts` file for data shape conversions

- `transformCachedTask(cached: CachedTask): ClickUpTask` — merges cache row with raw_data
- **CRITICAL:** Top-level cache columns ALWAYS override raw_data (webhooks update fields first)
- `transformCachedComment(cached: CachedComment): TaskComment` — normalizes comment rows
- Transformations happen at fetch boundary, never in components

**Example:**
```typescript
export function transformCachedTask(cached: CachedTask): ClickUpTask {
  if (cached.raw_data) {
    return {
      ...cached.raw_data,
      // Top-level task_cache columns ALWAYS override raw_data
      status: cached.status,
      status_color: cached.status_color ?? cached.raw_data.status_color,
      // ...
    };
  }
  // Fallback to top-level columns only
  return { ... };
}
```

## Colors & Design Tokens

**All styling uses CSS custom properties from `src/shared/styles/tokens.css`:**
- Phase colors: `var(--phase-1)`, `var(--phase-2)`, `var(--phase-3)`, `var(--phase-4)` + `-light` variants
- Status colors: `var(--awaiting)`, `var(--committed)`, `var(--ready)`, `var(--credit-approval)`
- UI: `var(--cta)`, `var(--accent)`, `var(--border)`, `var(--surface)`, `var(--text-primary)`, etc.
- Radius: `var(--r-sm)`, `var(--r-md)`, `var(--r-full)` — never hardcoded px values

**Tailwind + CSS vars:**
- Tailwind v4 with custom property integration: `bg-[var(--phase-2-light)]`, `text-[var(--phase-2)]`
- StatusBadge component demonstrates pattern: color maps are Record<status, { bg, text, dot }>
- Dynamic classes wrapped in safelist or template literals to ensure Tailwind scans them

## TypeScript Strictness

**Always enforced:**
- `strict: true` — null/undefined checking required
- `noUnusedLocals: true` — no dead variables
- `noUnusedParameters: true` — parameters must be used or prefixed with `_`
- `noUncheckedSideEffectImports: true` — side effects explicitly marked
- `verbatimModuleSyntax: true` — `type` imports must use `import type`

**Type usage:**
```typescript
// CORRECT — explicit type imports
import type { ClickUpTask } from '../types/tasks';
const task: ClickUpTask = { ... };

// CORRECT — inferred when obvious
const user = { id: 'user-1', name: 'John' };

// CORRECT — union types
type Status = 'open' | 'closed';
export const STATUSES: Status[] = ['open', 'closed'];
```

---

*Convention analysis: 2026-03-26*
