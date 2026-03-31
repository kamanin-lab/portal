# TASK-017: Hilfe FAQ Page

**Status:** DONE
**Date completed:** 2026-03-31
**Commits:** 9fecb7c, aab008e, e8aaa99, 59fb730, 3c72e24, f558476

---

## Goal

Replace the placeholder `HilfePage` with a fully functional FAQ page. Clients should be able to find answers to common questions about the portal without contacting support.

---

## Scope

### In Scope
- FAQ data layer (`hilfe-faq-data.ts`) — types + content
- `FaqItem` component — animated accordion item
- `FaqSection` component — section card with icon and items
- `HilfePage` — full page replacing placeholder
- Unit tests for all three new components/page
- `IntersectionObserver` mock in test setup (required for Motion `whileInView`)
- `tsconfig.app.json` test exclusion (prevents test files in production build)
- GitHub Actions workflows removal (CI cleanup)

### Out of Scope
- Backend — FAQ is entirely static
- Search/filtering across FAQ items
- Admin CMS for FAQ content

---

## What Was Built

### Data Layer
**`src/shared/lib/hilfe-faq-data.ts`**
- `FaqItemData` type: `{ question: string; answer: string }`
- `FaqSectionData` type: `{ id: string; title: string; iconName: string; items: FaqItemData[] }`
- `FAQ_SECTIONS` array — 6 sections, 20 items total, German Sie-form:
  1. Projekte
  2. Tickets & Anfragen
  3. Dateien
  4. Kredite
  5. Benachrichtigungen
  6. Konto & Einstellungen

### Components
**`src/shared/components/help/FaqItem.tsx`**
- Independent accordion item
- `AnimatePresence` + height animation (`motion/react`)
- Chevron rotation on open/closed state
- `isLast` prop controls `border-b` separator

**`src/shared/components/help/FaqSection.tsx`**
- Section card: Hugeicons icon + h2 heading + divider + `FaqItem` list
- Receives `FaqSectionData` and renders all items

### Page
**`src/shared/pages/HilfePage.tsx`**
- Replaced empty placeholder with full FAQ layout
- `ICON_MAP` object maps `iconName` strings from data to actual Hugeicons components
- `whileInView` stagger animation on section cards using `motion/react`
- Uses `ContentContainer width="narrow"` per architecture rule 11

### Tests
- `src/shared/components/help/__tests__/FaqItem.test.tsx`
- `src/shared/components/help/__tests__/FaqSection.test.tsx`
- `src/shared/pages/__tests__/HilfePage.test.tsx`
- `src/test/setup.ts` — added `IntersectionObserver` mock (required for jsdom + Motion `whileInView`)
- `tsconfig.app.json` — added `src/**/__tests__` and `src/test` to `exclude`

### CI Cleanup
- Deleted `.github/workflows/claude-code-review.yml`
- Deleted `.github/workflows/claude.yml`
- Reason: Claude Code GitHub App not installed on this repo; `ANTHROPIC_API_KEY` not in GitHub Secrets — both workflows caused CI failures on every push

---

## Files Changed

| File | Change |
|------|--------|
| `src/shared/lib/hilfe-faq-data.ts` | New — FAQ data and types |
| `src/shared/components/help/FaqItem.tsx` | New — accordion item component |
| `src/shared/components/help/FaqSection.tsx` | New — section card component |
| `src/shared/components/help/__tests__/FaqItem.test.tsx` | New — unit tests |
| `src/shared/components/help/__tests__/FaqSection.test.tsx` | New — unit tests |
| `src/shared/pages/HilfePage.tsx` | Modified — replaced placeholder with full FAQ |
| `src/shared/pages/__tests__/HilfePage.test.tsx` | New — page tests |
| `src/test/setup.ts` | Modified — IntersectionObserver mock added |
| `tsconfig.app.json` | Modified — test dirs excluded from build |
| `.github/workflows/claude-code-review.yml` | Deleted |
| `.github/workflows/claude.yml` | Deleted |

---

## Notes

- Icon name fix: `FolderOpen01Icon` does not exist in `@hugeicons/core-free-icons`; corrected to `FolderOpenIcon` in both data and ICON_MAP (commit 3c72e24)
- FAQ content is static — future CMS or search can be built on top of the existing `FaqSectionData` / `FaqItemData` types
