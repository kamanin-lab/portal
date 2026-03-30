# Phase 5: Data Unification & Polish - Research

**Researched:** 2026-03-29
**Domain:** Nextcloud WebDAV integration, ClickUp webhook extension, Motion tab animations, shadcn Skeleton
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**FilesTab Nextcloud Migration (DATA-02)**
- D-01: OverviewTabs FilesTab switches from ClickUp `task.attachments` (always empty) to Nextcloud via `useNextcloudFiles` hook. Shows last 8 recent files from the current project's Nextcloud folder.
- D-02: Files MUST be scoped to the current project's Nextcloud root path (`project_config.nextcloud_root_path`), not all Nextcloud files.
- D-03: Click on a file triggers direct download via `nextcloud-files` Edge Function. No navigation to DateienPage.
- D-04: No data source label needed — users don't need to know files come from Nextcloud.

**Task Folder Auto-Creation (expanded scope beyond DATA-02)**
- D-05: When a new task is created in ClickUp (via webhook), automatically create a corresponding folder in Nextcloud inside the chapter's folder. Example: `Projekt_MBM/01_Konzept/Moodboard/`
- D-06: Folder naming: task name only (e.g., `Moodboard/`), no order prefix.
- D-07: Trigger: ClickUp task creation event (via existing `clickup-webhook` Edge Function).
- D-08: In task detail modal (StepFilesTab), show files from the task's corresponding Nextcloud folder (matched by task name → folder name).

**Tab Transitions (DATA-03)**
- D-09: Claude's Discretion — add Motion fade+slide animation (opacity 0→1, y 8→0) when switching between OverviewTabs (Aktivität/Dateien/Nachrichten). Use existing Motion patterns from Phase 4.

**PhaseTimeline Loading Skeleton (DATA-04)**
- D-10: Claude's Discretion — show shadcn Skeleton placeholder while `useProject` is loading, matching the PhaseTimeline stepper shape. Never show blank space or broken layout.

### Claude's Discretion
- Tab transition animation duration and easing (D-09)
- PhaseTimeline skeleton shape — whether dots, bars, or full stepper outline (D-10)
- StepFilesTab fallback behavior when no matching Nextcloud folder exists (D-08)

### Deferred Ideas (OUT OF SCOPE)
- DATA-01: ProjectContextSection on OverviewPage — deferred to admin dashboard scope
- DATA-05: ProjectContextAdminPanel Refactor — deferred with DATA-01
- ENRICH-02: Manual Re-enrichment Trigger — still pending from Phase 3, belongs in admin dashboard scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-02 | FilesTab clearly labels data source and link destination (reinterpreted per CONTEXT: switch to Nextcloud, direct download, scoped to project) | `useNextcloudFilesByPath` + `downloadFile` helper already exist; FilesTab is a complete rewrite; `project_config.nextcloud_root_path` is the scope key |
| DATA-02 (ext) | Auto-create Nextcloud folder per task on ClickUp task creation | `clickup-webhook` taskCreated branch already exists; `nextcloud-files` mkdir action already works; need to call mkdir from webhook using service-role Nextcloud credentials |
| DATA-02 (ext) | StepFilesTab shows files from task-named folder in Nextcloud | `useNextcloudFilesByPath` with constructed path (chapter folder + slugified task name); fallback to EmptyState when folder 404s (already handled by Edge Function) |
| DATA-03 | Page transitions use Motion fade+slide animations (opacity 0→1, y 8→0) | `motion/react` already in use (PhaseNode); wrap `TabsContent` with `motion.div` + `AnimatePresence` keyed on tab value |
| DATA-04 | PhaseTimeline shows shadcn Skeleton state while useProject is loading | Current architecture: `useProject` is called in `UebersichtPage`, project is passed to `OverviewPage` → `ContextStrip` → `PhaseTimeline`. `isLoading` must be passed to `ContextStrip`/`PhaseTimeline` or a skeleton replaces `PhaseTimeline` at the ContextStrip level |
</phase_requirements>

---

## Summary

Phase 5 has four active implementation work items (DATA-02 which has three sub-parts, DATA-03, DATA-04) plus one deferred pair (DATA-01, DATA-05).

The heaviest task is the Nextcloud files pipeline: FilesTab and StepFilesTab both need a Nextcloud-backed rewrite, and a new webhook side-effect must auto-create Nextcloud folders when ClickUp tasks are created. All the infrastructure is already present — `useNextcloudFiles`, `useNextcloudFilesByPath`, `downloadFile`, the `nextcloud-files` Edge Function with `list`/`mkdir`/`download` actions, and the `clickup-webhook` handler with a working `taskCreated` branch. The implementation is wiring, not building from scratch.

Tab transition animation (DATA-03) is the smallest task: wrap `TabsContent` children with `AnimatePresence` + `motion.div`, keyed on the active tab value, reusing Phase 4's established `{ opacity: 0/1, y: 8/0 }` pattern.

The PhaseTimeline skeleton (DATA-04) is a medium task. The current loading gate in `UebersichtPage` renders a full-page `LoadingSkeleton` before passing `project` to `OverviewPage`, so `PhaseTimeline` never sees a loading state — the project is always non-null by the time it renders. The requirement is to show a skeleton at the `ContextStrip`/`PhaseTimeline` location specifically. This requires either threading `isLoading` down from `UebersichtPage` → `OverviewPage` → `ContextStrip` → `PhaseTimeline`, or changing the loading gate so the page renders with `isLoading` before the project resolves.

**Primary recommendation:** Wire existing infrastructure. No new Edge Function or hook needed except: (1) adding a Nextcloud mkdir call inside the existing `taskCreated` branch of `clickup-webhook`, and (2) replacing FilesTab + StepFilesTab data sources. PhaseTimeline skeleton and tab animations are pure frontend.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| motion/react | 12.x (project standard) | Tab fade+slide transition | Already used in PhaseNode, AnimatePresence pattern established |
| @shadcn/ui Skeleton | project version | PhaseTimeline loading state | Already used across modules; `Skeleton` component available |
| useNextcloudFilesByPath | internal hook | Fetch files by sub-path | Existing hook, path-based query, `enabled` guard prevents spurious calls |
| downloadFile | internal helper | Trigger browser file download | Already in `useNextcloudFiles.ts`; streams via Edge Function |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | project version | Query caching for Nextcloud file lists | `useNextcloudFilesByPath` returns cached results with 30s staleTime |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AnimatePresence on TabsContent | CSS transitions only | Motion gives spring/easing control; CSS is lighter but less controllable; project already uses Motion |
| useNextcloudFilesByPath | new dedicated hook | Hook already exists and is general-purpose; no reason to duplicate |

---

## Architecture Patterns

### Recommended Project Structure

No new files/folders needed. Changes are modifications to existing files:

```
src/modules/projects/
├── components/overview/
│   ├── OverviewTabs.tsx         ← add AnimatePresence, motion.div per TabsContent
│   ├── FilesTab.tsx             ← complete rewrite (Nextcloud source + downloadFile)
│   ├── ContextStrip.tsx         ← pass isLoading, conditionally render skeleton
│   └── PhaseTimeline.tsx        ← accept isLoading prop, render Skeleton when true
├── pages/
│   └── UebersichtPage.tsx       ← pass isLoading to OverviewPage (or restructure loading gate)
└── components/steps/
    └── StepFilesTab.tsx         ← rewrite to use useNextcloudFilesByPath by task name

supabase/functions/clickup-webhook/index.ts   ← add mkdir call in taskCreated branch
```

### Pattern 1: FilesTab Nextcloud Rewrite

**What:** Replace `allFiles` (from `p.chapters.flatMap(ch => ch.steps.flatMap(s => s.files))`, which is always empty after fixing ClickUp attachment removal) with `useNextcloudFiles(project.configId)` at root level. Show last 8, clicking triggers `downloadFile`.

**Props change:** `FilesTab` currently accepts `{ files: FileItem[] }`. After rewrite it needs `{ projectConfigId: string }` (fetches own data) OR the parent `OverviewTabs` passes files from the hook.

**Recommended:** `FilesTab` fetches internally via `useNextcloudFiles(projectConfigId)`. Keeps component self-contained and avoids drilling. `OverviewTabs` passes `project.id` (the `project_config` UUID).

**Key insight:** `useNextcloudFiles` without `chapterSortOrder` lists the project root. This satisfies D-02 (scoped to project root) and D-01 (last 8 files).

**Example:**
```typescript
// Source: src/modules/projects/hooks/useNextcloudFiles.ts (existing)
export function FilesTab({ projectConfigId }: { projectConfigId: string }) {
  const { files, isLoading, notConfigured } = useNextcloudFiles(projectConfigId);
  // sort by lastModified desc, slice(0, 8)
  // each file row: onClick → downloadFile(projectConfigId, file.path)
}
```

### Pattern 2: Tab Transition Animation

**What:** Wrap each `TabsContent` in `AnimatePresence` + `motion.div`. Key the motion div on the tab value so AnimatePresence detects a new child on tab switch.

**Phase 4 established pattern** (from `PhaseNode.tsx`):
```typescript
// Source: src/modules/projects/components/overview/PhaseNode.tsx (Phase 4)
<AnimatePresence mode="wait">
  <motion.span
    key={stateLabel}
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 4 }}
    transition={{ duration: 0.2 }}
  >
```

**For tab transitions** — adjust to `y: 8` per D-09:
```typescript
// OverviewTabs.tsx modification
import { motion, AnimatePresence } from 'motion/react';

// Replace each <TabsContent value="...">...</TabsContent> with:
<TabsContent value="updates">
  <AnimatePresence mode="wait">
    <motion.div
      key={activeTab}  // need to track active tab in state
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <ActivityFeed ... />
    </motion.div>
  </AnimatePresence>
</TabsContent>
```

**Note:** shadcn Tabs uses Radix UI. `TabsContent` does not unmount when inactive by default (it hides via `data-[state=inactive]:hidden`). For `AnimatePresence` exit animations to fire, either: (a) conditionally render content only when tab is active (controlled `value` + conditional render), or (b) use a single `AnimatePresence` container outside of `TabsContent` and render a single active content block. Option (b) is cleaner for exit animations.

**Cleaner approach:**
```typescript
// Track active tab in local state
const [activeTab, setActiveTab] = useState('updates');

// Single AnimatePresence around the visible content
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>...</TabsList>
  <AnimatePresence mode="wait">
    <motion.div key={activeTab} initial={...} animate={...} exit={...}>
      {activeTab === 'updates' && <ActivityFeed ... />}
      {activeTab === 'dateien' && <FilesTab ... />}
      {activeTab === 'nachrichten' && <MessagesTab ... />}
    </motion.div>
  </AnimatePresence>
</Tabs>
```

### Pattern 3: PhaseTimeline Skeleton

**What:** Pass `isLoading` down from `UebersichtPage` to `OverviewPage` to `ContextStrip` to `PhaseTimeline`. When `isLoading === true`, render a skeleton that matches the 4-node stepper shape.

**Current loading gate problem:** `UebersichtPage` returns early with a full-page `LoadingSkeleton` before passing `project` to `OverviewPage`. The `PhaseTimeline` never sees `isLoading` because the page doesn't render at all. To show an inline skeleton, the loading gate must be relaxed — let `OverviewPage` render with `isLoading` state, and render a skeleton only at the `ContextStrip`/`PhaseTimeline` slot.

**Approach:**
```typescript
// UebersichtPage.tsx: remove the early-return isLoading guard for OverviewPage
// Pass isLoading down
<OverviewPage project={project} isLoading={isLoading} />

// ContextStrip.tsx: accept isLoading
if (isLoading) return <PhaseTimelineSkeleton />;
// or pass to PhaseTimeline

// PhaseTimeline.tsx: accept optional isLoading prop
if (isLoading) return <PhaseTimelineSkeleton />;
```

**Skeleton shape** (Claude's discretion — D-10):
```typescript
// 4 skeleton nodes matching the 32px dot + text block structure
// Use shadcn Skeleton component
<div className="flex gap-3 mb-3 px-3 py-2 bg-[var(--surface)] border ...">
  {[1,2,3,4].map(i => (
    <div key={i} className="flex flex-col items-start gap-1.5 flex-1">
      <Skeleton className="w-[32px] h-[32px] rounded-full" />
      <Skeleton className="w-16 h-3 rounded" />
      <Skeleton className="w-10 h-3 rounded" />
    </div>
  ))}
</div>
```

**Guard when project is null:** `OverviewPage` currently receives `project: Project` (non-nullable). After this change, it must handle `project: Project | null` during loading. Since most sub-components require a project, the safest approach is to keep `null`-project guard as before but thread `isLoading` separately.

**Alternative (simpler):** Keep the current `UebersichtPage` early-return for `!project` (not found), but change the `isLoading` branch to render `OverviewPage` with `project={null}` and `isLoading={true}`. This requires `OverviewPage` to render a skeleton shell. Given that `OverviewPage` renders many sub-components, the cleanest scope is: pass `isLoading` only to `ContextStrip`, render skeleton at `ContextStrip` level only, all other components only render when `project` is available.

**Simplest valid approach:** Only the `PhaseTimeline` slot needs a skeleton (per DATA-04). Show a fixed skeleton at the top of `UebersichtPage` while loading, then when project loads, replace with the real `OverviewPage`. The requirement just says "PhaseTimeline shows skeleton during load" — a full-page LoadingSkeleton that includes a PhaseTimeline-shaped placeholder satisfies this.

**Final recommendation:** Modify `UebersichtPage`'s `isLoading` branch to render a skeleton that structurally matches the ContextStrip + PhaseTimeline area (4 nodes, narrow container) rather than the generic multi-line `LoadingSkeleton`.

### Pattern 4: Webhook → Nextcloud mkdir on taskCreated

**What:** When `clickup-webhook` receives `taskCreated` for a project task, after upserting to `project_task_cache`, call the `nextcloud-files` Edge Function with `action: 'mkdir'` to create `{chapter_folder}/{task_name}/`.

**Key finding:** The `clickup-webhook` runs as a Deno Edge Function with `SUPABASE_SERVICE_ROLE_KEY`. The `nextcloud-files` Edge Function already has a server-side `mkdir` path that uses `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_PASS` env vars. However, `nextcloud-files` currently requires a valid Bearer JWT (user auth). The webhook cannot use a user JWT.

**Two options:**
1. **Call Nextcloud WebDAV directly from `clickup-webhook`** — duplicate the MKCOL logic inline. Requires `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_PASS` env vars to be available in `clickup-webhook` (they currently are NOT — only in `nextcloud-files`).
2. **Add a service-role bypass path to `nextcloud-files`** — accept `SUPABASE_SERVICE_ROLE_KEY` as Authorization, skip user-JWT validation, use Nextcloud credentials from env. Cleaner architecture.

**Recommended approach:** Option 1 — add the MKCOL call directly inside `clickup-webhook`. The `buildChapterFolder` + `slugify` helper is already in `_shared/slugify.ts` and is importable by any Edge Function. The webhook already has access to `projectConfigId` and can query `chapter_config` + `project_config.nextcloud_root_path` to build the path. Avoids coupling two Edge Functions via HTTP at webhook time.

**Folder path construction:**
1. From `taskData.name` → apply `slugify()` → task folder name
2. From `projectConfigId` → query `project_config.nextcloud_root_path`
3. From `chapter_config_id` → query `chapter_config.sort_order + title` → `buildChapterFolder(sort_order, title)`
4. Full path: `{nextcloud_root_path}/{chapterFolder}/{taskName}/`
5. Call Nextcloud WebDAV MKCOL (recursive) for each path segment

**Error handling:** Folder creation failure must NOT fail the webhook response. ClickUp expects a 200 response. Log the error and continue.

**Pattern 5: StepFilesTab Nextcloud Rewrite**

**What:** Replace `step.files` (always empty — `FileItem[]` is populated from ClickUp attachments which are never set) with `useNextcloudFilesByPath(projectConfigId, chapterFolder + '/' + slugify(step.title))`.

**Inputs needed by StepFilesTab:**
- `projectConfigId` — currently not passed; needs to come from the project
- `chapterSortOrder` + `chapterTitle` to build `chapterFolder`
- `step.title` to build the task sub-folder name

**Current StepFilesTab props:** `{ step: Step }`. Will need to expand to `{ step: Step; projectConfigId: string; chapterFolder: string }` or `{ step: Step; project: Project; chapter: Chapter }`.

**Path example:** For chapter `01_konzept` and step title `"Moodboard"`: `useNextcloudFilesByPath(configId, '01_konzept/moodboard')`.

**Fallback behavior** (Claude's discretion — D-08): When folder doesn't exist (404), the Edge Function already returns `{ ok: true, data: { files: [] } }`. Show `EmptyState` message "Noch keine Dateien für diesen Schritt." (already the current behavior).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Nextcloud file listing by path | Custom WebDAV client | `useNextcloudFilesByPath` hook + `nextcloud-files` Edge Function | Already exists, handles auth, path safety, 404 → empty array |
| File download trigger | Direct Nextcloud URL | `downloadFile(projectConfigId, file.path)` helper | Already streams through Edge Function with auth; direct WebDAV URL would expose credentials |
| Motion tab animation | CSS transitions | `motion/react` AnimatePresence + motion.div | Project standard; exit animations require AnimatePresence which CSS cannot do |
| Loading skeleton shape | Custom skeleton component | shadcn `Skeleton` | Already in project, standardized |
| Task folder path construction | Inline string building | `buildChapterFolder()` + `slugify()` from `_shared/slugify.ts` | Edge Functions share this helper; consistent slug behavior |

---

## Common Pitfalls

### Pitfall 1: AnimatePresence with shadcn Tabs (Radix UI)
**What goes wrong:** Radix `TabsContent` hides inactive tabs with CSS (`display: none` via `data-[state=inactive]:hidden`). `AnimatePresence` exit animations never fire because the element is hidden, not unmounted.
**Why it happens:** Radix Tab panels are kept in DOM for a11y reasons. Exit variants require unmounting.
**How to avoid:** Use a controlled `Tabs` with local state, render content conditionally in a single `AnimatePresence` container outside of `TabsContent`, OR use a single motion.div with `key={activeTab}` above the content switching. See Pattern 2 above.
**Warning signs:** Tab switch animation plays on enter but never on exit.

### Pitfall 2: Nextcloud mkdir from `clickup-webhook` — missing env vars
**What goes wrong:** `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_PASS` are env vars currently only declared for `nextcloud-files`. If they are not also available in the `clickup-webhook` deployment context, the mkdir call fails silently.
**Why it happens:** Coolify env vars are configured per service/function. A new function accessing the same vars needs its own declaration.
**How to avoid:** Verify these env vars are available globally (Supabase service-level) or add them explicitly to `clickup-webhook`. Check Coolify config before implementation.
**Warning signs:** mkdir logs show `NEXTCLOUD_URL is undefined`.

### Pitfall 3: FilesTab passes `project.id` but hook expects `project_config_id`
**What goes wrong:** In the `Project` type, the id field (from `project_config.id`) is what `useNextcloudFiles` expects as `projectConfigId`. The hook passes `project_config_id` to the Edge Function body. If the wrong ID is passed (e.g., `chapter_config.id`), Nextcloud returns 403 or wrong files.
**Why it happens:** Multiple ID types in the project data model.
**How to avoid:** Use `project.id` (which maps to `project_config.id`) — this is what all existing Nextcloud hooks already use. Verify by checking `useProject.ts` fetchProjectData which queries `project_config` by `id`.

### Pitfall 4: StepFilesTab path construction doesn't match folder name created by webhook
**What goes wrong:** Webhook creates folder `moodboard` (slugified), but StepFilesTab queries `Moodboard` (unslugified). Folder not found → always empty.
**Why it happens:** `slugify()` normalizes German chars and lowercases. If StepFilesTab constructs path without slugify, the path doesn't match.
**How to avoid:** Both webhook folder creation AND StepFilesTab path construction MUST use `slugify(step.title)` (or `slugify(taskData.name)` in the webhook). The same `slugify` function must be used in both places. In the frontend, `slugify` must be re-implemented or imported (it's currently only in Edge Function `_shared/` — not importable from `src/`). A frontend copy or a shared utility is needed.
**Warning signs:** StepFilesTab always shows "Noch keine Dateien für diesen Schritt" even after webhook creates the folder.

### Pitfall 5: PhaseTimeline skeleton changes `OverviewPage` null-safety
**What goes wrong:** `OverviewPage` currently receives `project: Project` (always non-null by the time it renders). Changing the loading flow to pass `isLoading` down requires either making `project: Project | null` (which breaks all internal component access) or ensuring the page shell renders independently of project.
**Why it happens:** The current architecture has a hard gate at `UebersichtPage` level.
**How to avoid:** Keep the hard gate for `!project` case. For the skeleton, modify only the `isLoading && !project` branch of `UebersichtPage` to render a structured skeleton (instead of generic `LoadingSkeleton`). No changes needed to `OverviewPage` type signatures.

### Pitfall 6: useNextcloudFiles fetches root, returns folders AND files
**What goes wrong:** `useNextcloudFiles(projectConfigId)` lists the root of the project Nextcloud folder. This includes chapter sub-folders (collections). FilesTab shows folders in the file list, which don't download.
**Why it happens:** PROPFIND depth:1 returns both files and collections.
**How to avoid:** Filter out `type === 'folder'` entries in FilesTab. Sort remaining files by `lastModified` descending, then slice(0, 8).

---

## Code Examples

### Nextcloud file listing and download in FilesTab

```typescript
// Source: src/modules/projects/hooks/useNextcloudFiles.ts (existing)
// useNextcloudFiles returns: { files: NextcloudFile[], isLoading, notConfigured }
// NextcloudFile.type is 'file' | 'folder'
// downloadFile(projectConfigId, file.path) triggers browser download

import { useNextcloudFiles, downloadFile } from '../hooks/useNextcloudFiles';

export function FilesTab({ projectConfigId }: { projectConfigId: string }) {
  const { files, isLoading, notConfigured } = useNextcloudFiles(projectConfigId);

  const recentFiles = files
    .filter(f => f.type === 'file')
    .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
    .slice(0, 8);

  if (isLoading) return <Skeleton className="h-32" />;
  if (notConfigured || recentFiles.length === 0) return <EmptyState message="Noch keine Dateien." />;

  return (
    <div>
      {recentFiles.map(f => (
        <div key={f.path} onClick={() => downloadFile(projectConfigId, f.path)}>
          {f.name}
        </div>
      ))}
    </div>
  );
}
```

### AnimatePresence tab transition (avoiding Radix hiding issue)

```typescript
// Source: motion/react docs + PhaseNode.tsx Phase 4 pattern
import { motion, AnimatePresence } from 'motion/react';

const [activeTab, setActiveTab] = useState('updates');

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="updates">Aktivität</TabsTrigger>
    <TabsTrigger value="dateien">Dateien</TabsTrigger>
    <TabsTrigger value="nachrichten">Nachrichten</TabsTrigger>
  </TabsList>
  <div className="flex-1 min-h-0 overflow-y-auto">
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {activeTab === 'updates' && <ActivityFeed ... />}
        {activeTab === 'dateien' && <FilesTab projectConfigId={project.id} />}
        {activeTab === 'nachrichten' && <MessagesTab ... />}
      </motion.div>
    </AnimatePresence>
  </div>
</Tabs>
```

### PhaseTimeline skeleton

```typescript
// Source: shadcn/ui Skeleton + PhaseTimeline.tsx structure
import { Skeleton } from '@/shared/components/ui/skeleton';

export function PhaseTimelineSkeleton() {
  return (
    <div className="mb-3 px-3 py-2 bg-[var(--surface)] border border-[var(--border-light)] rounded-[var(--r-md)]">
      <div className="flex">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-start gap-1.5 py-1 pr-3">
            <Skeleton className="w-[28px] h-[28px] rounded-full" />
            <Skeleton className="w-14 h-2.5 rounded" />
            <Skeleton className="w-10 h-2 rounded" />
            <Skeleton className="w-12 h-4 rounded-full mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Webhook taskCreated → Nextcloud mkdir

```typescript
// Source: supabase/functions/clickup-webhook/index.ts (existing taskCreated branch)
// After project_task_cache upsert, add:

if (payload.event === "taskCreated" && projectConfigId && taskData?.name) {
  // Best-effort folder creation — never fail the webhook response
  try {
    const { data: projectConfig } = await supabase
      .from("project_config")
      .select("nextcloud_root_path")
      .eq("id", projectConfigId)
      .single();

    const rootPath = projectConfig?.nextcloud_root_path;
    if (rootPath && chapterConfigId) {
      const { data: chapter } = await supabase
        .from("chapter_config")
        .select("sort_order, title")
        .eq("id", chapterConfigId)
        .single();

      if (chapter) {
        const chapterFolder = buildChapterFolder(chapter.sort_order, chapter.title);
        const taskFolder = slugify(taskData.name);
        // MKCOL: {rootPath}/{chapterFolder}/{taskFolder}
        // Use NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS env vars
        await createNextcloudFolder(`${rootPath}/${chapterFolder}/${taskFolder}`, log);
      }
    }
  } catch (err) {
    log.error("Nextcloud folder creation failed (non-fatal)", { error: String(err) });
  }
}
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Build/dev | Yes | v24.11.1 | — |
| Vitest | Test suite | Yes | 4.1.0 | — |
| motion/react | Tab animation (DATA-03) | Yes (project dep) | 12.x | — |
| shadcn Skeleton | PhaseTimeline loading (DATA-04) | Yes (project dep) | project version | — |
| NEXTCLOUD_URL/USER/PASS in `clickup-webhook` | Webhook mkdir (D-05) | UNKNOWN — verify in Coolify | — | Skip folder creation, log warning |

**Missing dependencies with no fallback:**
- None blocking frontend tasks.

**Missing dependencies with fallback:**
- `NEXTCLOUD_URL/USER/PASS` in `clickup-webhook`: if not available, folder creation silently skips (non-fatal). The frontend fallback (StepFilesTab empty state) handles the no-folder case gracefully.

---

## Validation Architecture

nyquist_validation is enabled in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --run src/modules/projects/__tests__/` |
| Full suite command | `npm run test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-02 (FilesTab) | FilesTab renders Nextcloud files (not empty FileItem[]) | unit | `npm run test -- --run src/modules/projects/__tests__/FilesTab.test.tsx` | ❌ Wave 0 |
| DATA-02 (FilesTab) | FilesTab filters out folders, shows only files | unit | same file | ❌ Wave 0 |
| DATA-02 (FilesTab) | FilesTab click triggers downloadFile (mock) | unit | same file | ❌ Wave 0 |
| DATA-02 (StepFilesTab) | StepFilesTab constructs correct Nextcloud path using slugify | unit | `npm run test -- --run src/modules/projects/__tests__/StepFilesTab.test.tsx` | ❌ Wave 0 |
| DATA-02 (StepFilesTab) | StepFilesTab shows EmptyState when folder missing (empty files) | unit | same file | ❌ Wave 0 |
| DATA-03 | OverviewTabs renders tab content (AnimatePresence mock) | unit | `npm run test -- --run src/modules/projects/__tests__/OverviewTabs.test.tsx` | ❌ Wave 0 |
| DATA-04 | PhaseTimeline skeleton renders 4 skeleton nodes when isLoading | unit | `npm run test -- --run src/modules/projects/__tests__/PhaseTimeline.test.tsx` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `npm run test -- --run src/modules/projects/__tests__/`
- **Per wave merge:** `npm run test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/modules/projects/__tests__/FilesTab.test.tsx` — covers DATA-02 FilesTab behavior (mock useNextcloudFiles, downloadFile)
- [ ] `src/modules/projects/__tests__/StepFilesTab.test.tsx` — covers DATA-02 StepFilesTab path construction and empty state
- [ ] `src/modules/projects/__tests__/OverviewTabs.test.tsx` — covers DATA-03 tab rendering with AnimatePresence mock
- [ ] Extend `PhaseTimeline.test.tsx` with DATA-04 skeleton test case

Existing `PhaseTimeline.test.tsx` already has all mocks set up (motion/react, radix-ui, useBreakpoint) — extend it, don't rewrite.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ClickUp attachment files in FilesTab | Nextcloud WebDAV via Edge Function proxy | Phase 5 | FilesTab actually shows real files |
| Generic LoadingSkeleton in UebersichtPage | PhaseTimeline-shaped skeleton | Phase 5 | Better perceived performance |
| Instant tab content swap | Motion fade+slide | Phase 5 | Smoother UX |

**Deprecated/outdated:**
- `FilesTab` props `{ files: FileItem[] }`: replaced with `{ projectConfigId: string }` — `FileItem[]` was always empty in production because ClickUp attachments are never populated in the project pipeline.
- `StepFilesTab` reading from `step.files`: same issue — replace with Nextcloud path-based query.

---

## Open Questions

1. **Are NEXTCLOUD_URL/USER/PASS available in `clickup-webhook` Deno environment?**
   - What we know: These vars are declared for `nextcloud-files` Edge Function in Coolify.
   - What's unclear: Whether they are global service-level vars (available to all functions) or function-specific.
   - Recommendation: Verify in Coolify before implementation. If not available, add them. If global, no action needed.

2. **slugify on the frontend — duplicate or share?**
   - What we know: `slugify` lives in `supabase/functions/_shared/slugify.ts` (Deno). Frontend cannot import from there.
   - What's unclear: Whether to duplicate the function in `src/modules/projects/lib/` or use a frontend slugify library.
   - Recommendation: Duplicate the ~20-line `slugify` function verbatim into `src/modules/projects/lib/slugify.ts`. It has no Deno-specific dependencies. Add a comment linking it to the Edge Function source. Keep both in sync manually. This is the simplest approach with zero new npm dependencies.

3. **chapter_config_id availability in taskCreated webhook branch**
   - What we know: The webhook calls `getProjectChapterConfigId(taskData)` to resolve the chapter. This returns a UUID or null. The slug/sort-order comes from querying `chapter_config` with that UUID.
   - What's unclear: Whether `getProjectChapterConfigId` is already called before the mkdir insertion point, so the result can be reused.
   - Recommendation: In the webhook code, the `chapterConfigId` is already computed (stored in the upsert payload). Pass it to the mkdir call rather than re-resolving.

---

## Project Constraints (from CLAUDE.md)

These directives apply to all Phase 5 implementation work:

- **Icons:** `@hugeicons/react` primary, `@phosphor-icons/react` secondary. Do NOT use Lucide React for new code.
- **Toasts:** `import { toast } from "sonner"` for all toast notifications (e.g., download error handling).
- **Animation:** `import { motion } from "motion/react"` — NOT `framer-motion`.
- **Components < 150 lines:** Extract logic to hooks if FilesTab or StepFilesTab approaches limit.
- **All UI text in German:** Zero English in user-facing strings.
- **`ContentContainer width="narrow"` on all app pages:** FilesTab is inline (not a page), so this does not apply to it directly.
- **shadcn/ui for all new UI primitives:** Use `Skeleton` from shadcn (already available), not custom skeleton divs.
- **Architecture Rule 2:** Edge Functions proxy ALL ClickUp calls — not relevant here but noted.
- **`mapStatus` for status comparisons:** Not applicable to this phase.
- **Docs Update Protocol:** After changes, update `docs/CHANGELOG.md` and `docs/DECISIONS.md`.

---

## Sources

### Primary (HIGH confidence)
- Source code audit: `src/modules/projects/hooks/useNextcloudFiles.ts` — full hook and downloadFile implementation read
- Source code audit: `supabase/functions/nextcloud-files/index.ts` — mkdir action confirmed working, 404 → empty array confirmed
- Source code audit: `supabase/functions/clickup-webhook/index.ts` — taskCreated branch exists, project routing confirmed
- Source code audit: `src/modules/projects/components/overview/PhaseNode.tsx` — Motion AnimatePresence pattern confirmed
- Source code audit: `src/modules/projects/components/overview/ContextStrip.tsx` — PhaseTimeline render location confirmed
- Source code audit: `src/modules/projects/pages/UebersichtPage.tsx` — current loading gate confirmed
- Source code audit: `supabase/functions/_shared/slugify.ts` — buildChapterFolder + slugify implementation confirmed

### Secondary (MEDIUM confidence)
- Motion/React AnimatePresence + shadcn Tabs (Radix): behavior of Radix `TabsContent` hiding vs unmounting is well-established in the ecosystem; the pattern of using controlled state + single AnimatePresence is the standard workaround.

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already in the project; versions confirmed
- Architecture: HIGH — all patterns verified from source code; no speculative claims
- Pitfalls: HIGH — pitfalls derived from direct code analysis (Radix hiding behavior, slug mismatch, env var scope)
- Webhook mkdir: MEDIUM — implementation pattern is clear; env var availability is an open question requiring runtime verification

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (stable stack, no fast-moving dependencies in scope)
