# TASK-011: Design Polish Plan

## Based on: 13 Playwright screenshots + user feedback

## Priority Fixes (Batch 1 — Typography + Colors)

### 1. Font sizes — increase across the board
- Task card title: 13px → 14px
- Task card description: 12px → 13px
- Task card metadata (status, date, credits): 11px → 12px
- Sidebar icons: 18px → 20px
- Page headers: keep 1.2rem
- Filter chips: keep
- Credit balance text: make bolder, slightly larger

### 2. Text color — darken secondary text
- `--text-secondary` in tokens.css: current value too gray, darken it
- `--text-tertiary`: also darken slightly
- Task descriptions should use `--text-primary` not `--text-secondary`
- Metadata (dates, credits) can stay `--text-secondary` but darker

### 3. Font weight — increase for readability
- Task card titles: `font-medium` → `font-semibold`
- Navigation labels (if sidebar expands): `font-medium`

## Batch 2 — Cards + Spacing

### 4. Task cards — more visual depth
- Add subtle left border colored by status (like Linear)
- Increase padding: 14px → 16px
- Add hover: subtle shadow elevation + slight y-translate (Motion)
- Separate status badge + credits badge more clearly

### 5. Sidebar — improve readability
- Credits in sidebar: show balance number next to lightning icon (even collapsed)
- Slightly larger icons (18 → 20px)
- Active state: stronger highlight

### 6. Empty states — more prominent
- Inbox empty: add icon + larger text
- Dateien empty folders: add file count "0 Dateien"

## Batch 3 — Motion Animations

### 7. Page transitions
- Content fade-in on route change: `motion.div` with `initial={{ opacity: 0 }} animate={{ opacity: 1 }}`
- Task cards: staggered entry on list load

### 8. Micro-interactions
- Task card hover: `whileHover={{ y: -2 }}` with shadow increase
- Button hover: subtle scale `whileHover={{ scale: 1.02 }}`
- Sheet open: smooth slide with spring physics
- Credit balance: animate number change

### 9. Status transitions
- When status badge changes: `AnimatePresence` color transition

## Batch 4 — Icons (Hugeicons)

### 10. Replace key icons with Hugeicons
- Sidebar: replace Lucide icons with Hugeicons stroke rounded style
- Task actions: Hugeicons for approve/reject/hold
- File types: Hugeicons for file/folder icons
- Keep Lucide in components we're not touching

## Files to modify

### tokens.css
- `--text-secondary`: darken
- `--text-tertiary`: darken slightly

### Task components
- `TaskCard.tsx` — font sizes, hover animation, left border
- `TaskList.tsx` — staggered entry animation

### Layout
- `SidebarUtilities.tsx` — credits readability
- `Sidebar.tsx` — icon sizes

### Shared
- `EmptyState.tsx` — more prominent design
