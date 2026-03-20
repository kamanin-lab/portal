import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

type MemoryScope = 'client' | 'project';
type MemoryCategory = 'profile' | 'communication' | 'technical_constraint' | 'delivery_constraint' | 'decision' | 'risk' | 'commercial_context';
type MemoryVisibility = 'internal' | 'shared' | 'client_visible';

type MemoryDraft = {
  scope: MemoryScope;
  category: MemoryCategory;
  title: string;
  body: string;
  visibility?: MemoryVisibility;
  source_ref?: string | null;
};

type ManageRequest =
  | { action: 'upsert'; projectId: string; entryId?: string; draft: MemoryDraft }
  | { action: 'archive'; projectId?: string; entryId: string };

function json(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseAllowedEmails() {
  return (Deno.env.get('PROJECT_MEMORY_OPERATOR_EMAILS') ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

function isUuid(value: string | undefined | null) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function requireProjectAccess(supabaseUser: ReturnType<typeof createClient>, projectId: string, userId: string) {
  const { data, error } = await supabaseUser
    .from('project_access')
    .select('id')
    .eq('project_config_id', projectId)
    .eq('profile_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Forbidden');
  }
}

async function resolveAnchoredClientId(supabaseAdmin: ReturnType<typeof createClient>, projectId: string) {
  const { data: existingEntry } = await supabaseAdmin
    .from('project_memory_entries')
    .select('client_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingEntry?.client_id) return existingEntry.client_id as string;

  const { data: primaryAccess } = await supabaseAdmin
    .from('project_access')
    .select('profile_id')
    .eq('project_config_id', projectId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (primaryAccess?.profile_id) return primaryAccess.profile_id as string;
  throw new Error('Project memory anchor could not be resolved');
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('manage-project-memory', requestId);
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json(401, { error: 'Unauthorized' }, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      log.error('Missing Supabase configuration');
      return json(500, { error: 'Service temporarily unavailable' }, corsHeaders);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return json(401, { error: 'Unauthorized' }, corsHeaders);
    }

    const allowedEmails = parseAllowedEmails();
    if (!allowedEmails.includes((user.email ?? '').toLowerCase())) {
      return json(403, { error: 'Memory authoring is restricted to explicitly allow-listed internal operators' }, corsHeaders);
    }

    const body = await req.json() as ManageRequest;
    if (!body || !('action' in body)) {
      return json(400, { error: 'Request body is required' }, corsHeaders);
    }

    if (body.action === 'archive') {
      if (!isUuid(body.entryId)) {
        return json(400, { error: 'Valid entryId is required' }, corsHeaders);
      }

      const { data: currentEntry, error: currentEntryError } = await supabaseAdmin
        .from('project_memory_entries')
        .select('id, project_id')
        .eq('id', body.entryId)
        .maybeSingle();

      if (currentEntryError || !currentEntry) {
        return json(404, { error: 'Memory entry not found' }, corsHeaders);
      }

      const projectId = (body.projectId ?? currentEntry.project_id) as string | null;
      if (!projectId) {
        return json(400, { error: 'Project-scoped archive path requires projectId' }, corsHeaders);
      }

      await requireProjectAccess(supabaseUser, projectId, user.id);

      const { data, error } = await supabaseAdmin
        .from('project_memory_entries')
        .update({
          status: 'archived',
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.entryId)
        .select('*')
        .single();

      if (error || !data) {
        return json(500, { error: error?.message ?? 'Failed to archive memory entry' }, corsHeaders);
      }

      return json(200, data, corsHeaders);
    }

    if (!isUuid(body.projectId)) {
      return json(400, { error: 'Valid projectId is required' }, corsHeaders);
    }

    await requireProjectAccess(supabaseUser, body.projectId, user.id);

    const draft = body.draft;
    if (!draft?.title?.trim() || !draft?.body?.trim()) {
      return json(400, { error: 'Title and body are required' }, corsHeaders);
    }

    const anchoredClientId = await resolveAnchoredClientId(supabaseAdmin, body.projectId);

    let existingEntry: { id: string; created_at: string; created_by: string | null; reviewed_at: string | null; status: string; project_id: string | null; client_id: string } | null = null;
    if (body.entryId) {
      const { data } = await supabaseAdmin
        .from('project_memory_entries')
        .select('id, created_at, created_by, reviewed_at, status, project_id, client_id')
        .eq('id', body.entryId)
        .maybeSingle();
      existingEntry = data;
    }

    const payload = {
      id: existingEntry?.id ?? crypto.randomUUID(),
      client_id: existingEntry?.client_id ?? anchoredClientId,
      project_id: draft.scope === 'project' ? body.projectId : null,
      scope: draft.scope,
      category: draft.category,
      title: draft.title.trim(),
      body: draft.body.trim(),
      visibility: draft.visibility ?? 'internal',
      status: existingEntry?.status ?? 'active',
      source_type: 'manual',
      source_ref: draft.source_ref ?? null,
      created_by: existingEntry?.created_by ?? user.id,
      updated_by: user.id,
      created_at: existingEntry?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      reviewed_at: existingEntry?.reviewed_at ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from('project_memory_entries')
      .upsert(payload)
      .select('*')
      .single();

    if (error || !data) {
      return json(500, { error: error?.message ?? 'Failed to save memory entry' }, corsHeaders);
    }

    return json(200, data, corsHeaders);
  } catch (error) {
    log.error('Unhandled memory management error', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Forbidden' ? 403 : 500;
    return json(status, { error: message }, corsHeaders);
  }
});
