# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- **TypeScript** 5.9.3 - Full frontend (React components, hooks, utilities) and Edge Function implementations
- **TSX/JSX** - React component syntax throughout `src/modules/` and `src/shared/`

**Secondary:**
- **JavaScript** (Deno runtime) - Edge Functions use Deno TypeScript runtime (TypeScript compiled to JavaScript at deploy)

## Runtime

**Environment:**
- **Deno** (server-side Edge Functions only) - Supabase Edge Functions runtime, deployed to Coolify via volume mount at `/home/deno/functions/`
- **Node.js** - Development tooling only (Vite, Vitest, ESLint, TypeScript compiler)
- **Browser** (modern) - Frontend SPA runs in Chrome, Firefox, Safari, Edge; localStorage for session persistence

**Package Manager:**
- **npm** 10+ - Primary package manager for frontend dependencies
- **Lockfile:** `package-lock.json` present

## Frameworks

**Core:**
- **React** 19.2.0 - UI library and component system
- **React Router v7** 7.13.1 - Client-side routing (hash-based on production, file-based in dev)
- **Vite** 7.3.1 - Build tool and dev server (replaces Create React App)

**State & Data:**
- **TanStack React Query (Tanstack)** 5.90.21 - Server state management, caching, sync
- **React Context API** - UI state (auth context, workspace selection, notifications)
- **Supabase Realtime** - Built into `@supabase/supabase-js`, enables real-time subscriptions on database tables (task_cache, comment_cache, notifications)

**UI & Animation:**
- **Tailwind CSS** 4.2.1 + **@tailwindcss/vite** 4.2.1 - Utility-first CSS framework with Vite integration
- **Motion** 12.38.0 - Successor to Framer Motion; GPU-accelerated animations, layout transitions, spring physics
- **shadcn/ui** - Radix UI-based component library (Button, Input, Tabs, Badge, Skeleton, Avatar, AlertDialog, Textarea, etc.)
- **Radix UI primitives** (v1.x) - Base unstyled components for accessibility (react-alert-dialog, react-avatar, react-dialog, react-dropdown-menu, react-separator, react-slot, react-tabs, react-toast, react-tooltip)
- **Lucide React** 0.577.0 - Icon library (default for most UI icons)
- **Phosphor Icons** 2.1.10 - Alternative icon set (supplementary)
- **HugeIcons** 1.1.6 + core-free-icons 4.0.0 - Additional icon sets

**Utilities:**
- **class-variance-authority** 0.7.1 - Component variant management for shadcn/ui customization
- **clsx** 2.1.1 - Conditional className builder
- **tailwind-merge** 3.5.0 - Merge Tailwind classes without conflicts
- **Sonner** 2.0.7 - Toast notifications library

**Testing:**
- **Vitest** 4.0.18 - Unit and integration test runner (Vite-native)
- **@vitest/coverage-v8** 4.1.0 - Code coverage reporting
- **@testing-library/react** 16.3.2 - React component testing utilities
- **@testing-library/jest-dom** 6.9.1 - DOM matchers
- **jsdom** 28.1.0 - JSDOM environment for testing

## Key Dependencies

**Critical:**
- **@supabase/supabase-js** 2.99.0 - Official Supabase client SDK for auth, database queries, Realtime subscriptions, and file storage
  - Used in `src/shared/lib/supabase.ts` (singleton export)
  - Realtime configured with 10 events per second rate limit
  - Auth uses localStorage persistence, auto token refresh, magic link + password auth

**Infrastructure:**
- **TypeScript** 5.9.3 - Type safety across entire codebase
- **eslint** 9.39.1 + typescript-eslint 8.48.0 - Linting and type checking
- **@vitejs/plugin-react** 5.1.1 - React JSX/Fast Refresh support for Vite

## Configuration

**Environment:**
- **Frontend variables** (in `.env.local`):
  - `VITE_SUPABASE_URL` - Self-hosted Supabase instance URL (e.g., `https://portal.db.kamanin.at`)
  - `VITE_SUPABASE_ANON_KEY` - Public anonymous key for client SDK
  - `VITE_MEMORY_OPERATOR_EMAILS` - Comma-separated list of emails allowed to manage project memory (optional, parsed in `src/modules/projects/lib/memory-access.ts`)
  - `OPENROUTER_API_KEY` - API key for post-code review script (in `.env.local`)

- **Edge Function environment variables** (deployed via Coolify env):
  - `SUPABASE_URL` - Self-hosted instance URL for Edge Functions
  - `SUPABASE_SERVICE_ROLE_KEY` - Service role key for server-side Supabase operations
  - `CLICKUP_API_TOKEN` - ClickUp API token (Bearer auth for ClickUp HTTP API)
  - `CLICKUP_WEBHOOK_SECRET` - Secret for validating incoming ClickUp webhooks
  - `CLICKUP_VISIBLE_FIELD_ID` - Custom field ID for task visibility toggle
  - `CLICKUP_CREDITS_FIELD_ID` - Custom field ID for credit amount tracking
  - `NEXTCLOUD_URL` - Nextcloud instance URL (e.g., `https://files.kamanin.at`)
  - `NEXTCLOUD_USER` - WebDAV username for Nextcloud access
  - `NEXTCLOUD_PASSWORD` - WebDAV password for Nextcloud access
  - `MAILJET_API_KEY` - Mailjet API key for transactional email (Basic auth)
  - `MAILJET_API_SECRET` - Mailjet API secret
  - `JWT_SECRET` - Secret for JWT verification in main router (if `VERIFY_JWT=true`)
  - `VERIFY_JWT` - Boolean ("true"/"false") to enable JWT verification on incoming requests
  - `CLAUDE_API_KEY` - Anthropic API key for AI enrichment (used in `fetch-project-tasks`)

**Build:**
- `vite.config.ts` - Vite configuration:
  - Plugin: `@tailwindcss/vite` for CSS processing
  - Plugin: `@vitejs/plugin-react` for React/JSX
  - Path alias: `@/` → `src/`
  - Test environment: JSDOM (vitest.config.ts)
  - Chunk splitting: vendor chunks for React, Query, Supabase, Radix UI, UI libraries
  - Chunk size warning limit: 550KB
- `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` - TypeScript project references
- `eslint.config.js` - ESLint rules for React, React Hooks, React Refresh
- `.prettierrc` - Code formatting (if present; otherwise defaults apply)
- `vercel.json` - Deployment config for Vercel:
  - Framework: `vite`
  - Build command: `npm run build`
  - Output directory: `dist/`
  - SPA rewrites: `/(.*)`→ `/index.html`
  - Proxy rewrite: `/auth/v1/*` → `https://portal.db.kamanin.at/auth/v1/*` (self-hosted auth endpoint)

## Platform Requirements

**Development:**
- **Node.js** 16+ (npm 8+)
- **Deno** 1.x (for local Edge Function testing; optional)
- **Git** (version control)
- **Terminal/Bash** (build scripts, git operations)

**Production:**
- **Vercel** - Frontend hosting (auto-deploys from `main` branch)
- **Coolify** - Self-hosted Docker platform for Supabase + Edge Functions
  - Supabase instance (PostgreSQL + Auth + Realtime) running on Coolify
  - Edge Functions deployed via volume mount to `/home/deno/functions/`
  - Main router at `/functions/main` dispatches to individual worker functions
  - Self-signed HTTPS at `portal.db.kamanin.at` for backend
- **Nextcloud** - File storage (WebDAV access from Edge Functions)
- **ClickUp** - Task management system (API calls via Edge Functions proxy)
- **Mailjet** - Transactional email service

---

*Stack analysis: 2026-03-26*
