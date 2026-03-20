# Context Hub References

Project-local reference copies and notes derived from Context Hub (`chub`).

## Purpose

For this project, Context Hub is the preferred source for curated, versioned API/framework documentation when available.

## Current local references

- `react.md`
- `react-dom.md`
- `tailwindcss.md`
- `vite.md`
- `vitest.md`
- `../supabase-context-hub/` (Supabase reference imported separately)

## Working rule

When touching these technologies, prefer this order:

1. project-local Context Hub reference copy
2. linked official documentation
3. only if Context Hub has no coverage, fall back to other trusted official docs/manual research

## Important note about local CLI state

`chub search` currently works in this environment.
`chub get` currently appears broken on this Windows setup (path/cache issue), so some local reference files were imported via direct Context Hub CDN paths discovered from `chub search --json`.

This does **not** change the working rule: Context Hub remains the preferred curated source where available.
