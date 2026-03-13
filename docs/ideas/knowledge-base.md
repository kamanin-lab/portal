# Feature Idea: Per-Client Knowledge Base for AI Enrichment

> Status: Planned | Priority: High | Target: Phase 4+

## Problem

AI enrichment (`why_it_matters`, `what_becomes_fixed`) sends only task name + description to Claude — no client context. Result: generic boilerplate texts regardless of client industry, goals, or audience.

## Vision

Each client has a **persistent knowledge base** (like Claude Projects) that grows organically throughout the relationship:

- Manual entries: briefs, brand guidelines, technical specs
- **Auto-captured task discussions** (comments from ClickUp)
- Document uploads (PDF, DOCX) via portal
- All content created in tasks and projects

Over 2-3 months, the portal knows **everything** about the client.

## Architecture

### Two-Level Model: Client + Project

```
knowledge_base table
├── scope = 'client'    → shared across all projects (brand, industry, tone)
│   └── client_id → profiles.id
└── scope = 'project'   → project-specific (goals, audience, requirements)
    └── project_config_id → project_config.id
```

At enrichment time: **client-level + project-level entries** → concatenated → system prompt.

### Database Schema

```sql
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'project'
    CHECK (scope IN ('client', 'project')),
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  project_config_id UUID REFERENCES project_config(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('brand', 'technical', 'content', 'process', 'general', 'conversation')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  source_type TEXT DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'imported', 'auto_captured')),
  source_ref TEXT,  -- e.g. clickup_task_id for auto-captured comments
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CHECK (
    (scope = 'client' AND client_id IS NOT NULL) OR
    (scope = 'project' AND project_config_id IS NOT NULL)
  )
);

-- RLS
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see KB for their projects/client" ON knowledge_base FOR SELECT
  USING (
    (scope = 'project' AND project_config_id IN (
      SELECT project_config_id FROM project_access WHERE profile_id = auth.uid()
    ))
    OR (scope = 'client' AND client_id = auth.uid())
  );

CREATE POLICY "Service role full access" ON knowledge_base FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_kb_project ON knowledge_base(project_config_id) WHERE is_active = true;
CREATE INDEX idx_kb_client ON knowledge_base(client_id) WHERE is_active = true;
CREATE UNIQUE INDEX idx_kb_source_unique ON knowledge_base(source_type, source_ref)
  WHERE source_ref IS NOT NULL;
```

## Data Sources (How KB Gets Populated)

### 1. Manual entries (Phase 1)
Agency fills at project start: brief, client profile, tone, requirements. Via SQL initially, admin UI later.

### 2. Auto-capture task discussions (Phase 1)
During `fetch-project-tasks` sync — fetch ClickUp comments per task, format as conversation thread, upsert as KB entry with `source_type = 'auto_captured'`, `source_ref = 'task_comments:{clickup_id}'`. Idempotent via unique index.

### 3. Document upload (Phase 2)
Upload to Supabase Storage → text extraction Edge Function → KB entry with `source_type = 'imported'`.

### 4. Task content (Phase 2)
Task descriptions, checklists → KB entries (`source_ref: 'task_desc:{id}'`).

## Implementation: Edge Function Changes

### File: `supabase/functions/fetch-project-tasks/index.ts`

**Load KB context per project:**
```typescript
async function loadKnowledgeBase(projectId: string, clientId: string | null): Promise<string> {
  const parts: string[] = [];

  if (clientId) {
    const { data: clientKb } = await supabaseService
      .from('knowledge_base')
      .select('title, content_text, category')
      .eq('scope', 'client').eq('client_id', clientId).eq('is_active', true)
      .order('sort_order');
    if (clientKb?.length) {
      parts.push('=== Allgemeiner Kundenkontext ===');
      parts.push(...clientKb.map(e => `### ${e.title}\n${e.content_text}`));
    }
  }

  const { data: projectKb } = await supabaseService
    .from('knowledge_base')
    .select('title, content_text, category')
    .eq('scope', 'project').eq('project_config_id', projectId).eq('is_active', true)
    .order('sort_order');
  if (projectKb?.length) {
    parts.push('=== Projektspezifischer Kontext ===');
    parts.push(...projectKb.map(e => `### ${e.title}\n${e.content_text}`));
  }

  return parts.join('\n\n');
}
```

**Prompt restructure** — use `system` parameter for context, `messages` for tasks:
```typescript
function buildSystemMessage(clientContext: string | null): string {
  const base = `Du bist ein Projektberater fur KAMANIN IT Solutions (Webagentur, Salzburg).
Du generierst kurze, spezifische deutsche Texte fur das Kundenportal.`;
  if (!clientContext) return base;
  return `${base}\n\n${clientContext}\n\nBeziehe diesen Kontext ein. Sei konkret — keine generischen Texte.`;
}

// API call uses system parameter:
body: JSON.stringify({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 4000,
  system: buildSystemMessage(clientContext),
  messages: [{ role: "user", content: userMessage }],
}),
```

**Batch enrichment per project** (not globally) so each project gets its own context.

## Phased Rollout

### Phase 1 (MVP)
- CREATE TABLE knowledge_base
- Manual seed entries via SQL
- Auto-capture task comments
- Inject context into enrichment prompt
- Per-project batching in Edge Function

### Phase 2 (Rich Content)
- Admin UI for KB management (CRUD, preview, token budget indicator)
- Document upload: PDF/DOCX → Supabase Storage → text extraction → KB entry
- Nextcloud sync: WebDAV pull → text extraction
- Auto re-enrichment trigger on KB changes
- Task description auto-capture

### Phase 3 (Intelligence)
- pgvector: embedding column → relevance-based retrieval when KB > 30K tokens
- Context budget management via token_count
- Periodic distillation: summarize large conversation threads
- Cross-project learning: auto-pull client-level context for new projects

## Data Flow

```
Manual entries ──────────────────────┐
ClickUp comments ──► auto-capture ──►│──► knowledge_base table
Document uploads ──► text extract ──►│        │
                                     │  ┌─────┴─────┐
                                     │  │ client    │ project  │
                                     │  └─────┬─────┘
                                     │        │ concat
                                     │        ▼
                                     │  fetch-project-tasks Edge Function
                                     │        │ system: context
                                     │        │ user: task batch
                                     │        ▼
                                     │  Claude Haiku API
                                     │        │
                                     │        ▼
                                     │  step_enrichment table
                                     │        │
                                     │        ▼
                                     └  UI: why_it_matters / what_becomes_fixed
```

## Token Budget (Phase 1)

At <10 clients with a few pages of text per project: ~5-10K tokens per project context. Haiku supports 200K. Full context strategy is viable. pgvector/RAG only needed when KB grows past ~30K tokens per project (Phase 3).

## Schema Future-Proofing

- `source_type` / `source_url` → ready for Phase 2 document imports
- `token_count` → Phase 3 budget management
- `category` → Phase 3 relevance filtering
- `embedding VECTOR(1536)` can be added without breaking changes (pgvector is additive)
- `is_active` → soft-delete without data loss
- `created_by` → admin audit trail
