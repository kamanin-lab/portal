/**
 * nextcloud-files — WebDAV proxy for Nextcloud file operations.
 *
 * Project-scoped actions (require project_config_id):
 *   list     — PROPFIND depth:1, returns NextcloudFile[]
 *   download — streams file bytes back to browser
 *   upload   — accepts multipart/form-data, PUTs file to Nextcloud
 *   mkdir    — recursive MKCOL, creates folder hierarchy
 *
 * Client-root actions (use profiles.nextcloud_client_root):
 *   browse-client        — PROPFIND on client portal root + optional sub_path
 *   download-client-file — streams file from client root (no project_config_id needed)
 *   upload-client-file   — accepts multipart/form-data, PUTs file to client root + optional sub_path
 *   mkdir-client         — recursive MKCOL under client root, accepts folder_path
 *
 * Hybrid actions (project_access auth + client-root path):
 *   upload-task-file — auto-creates aufgaben/{YYYY-MM}_{slug}/ and PUTs file
 *
 * Targeting:
 *   - chapter_sort_order — resolves to chapter folder via buildChapterFolder()
 *   - sub_path           — arbitrary relative path within project/client root
 *   - folder_path        — used by mkdir action only
 *   - task_name/task_date — used by upload-task-file to build folder name
 *
 * Security:
 *   - Path sanitisation via isPathSafe() (reject "..", leading "/", control chars)
 *   - project_access check per user (project-scoped actions)
 *   - nextcloud_client_root derived from JWT (client-root actions)
 *   - All resolved paths prefix-checked against their root
 *   - Chapter folder names normalized via shared slugify()
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import {
  getCorsHeaders,
  corsHeaders as defaultCorsHeaders,
} from "../_shared/cors.ts";
import { slugify, buildChapterFolder } from "../_shared/slugify.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reject path-traversal attempts and absolute paths. */
function isPathSafe(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return false;
  // Split on both / and \ to catch Windows-style injections
  const segments = p.split(/[/\\]/);
  return !segments.some((s) => s === ".." || s === "." || s.includes("%") || s.includes("\0") || /[\x00-\x1f\x7f]/.test(s));
}

/** Build WebDAV base URL once. */
function webdavBase(ncUrl: string, ncUser: string): string {
  const base = ncUrl.replace(/\/+$/, "");
  return `${base}/remote.php/dav/files/${encodeURIComponent(ncUser)}`;
}

/** Encode a full Nextcloud path (encode each segment individually). */
function encodePath(raw: string): string {
  return raw
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/** Basic-auth header value. */
function basicAuth(user: string, pass: string): string {
  // btoa is available in Deno
  return "Basic " + btoa(`${user}:${pass}`);
}

// ---------------------------------------------------------------------------
// PROPFIND XML body (minimal — request only the props we need)
// ---------------------------------------------------------------------------
const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
    <d:getcontenttype/>
  </d:prop>
</d:propfind>`;

// ---------------------------------------------------------------------------
// XML parsing helpers (regex-based, no external library)
// ---------------------------------------------------------------------------

interface PropfindEntry {
  href: string;
  displayname: string;
  isCollection: boolean;
  contentLength: number;
  lastModified: string;
  contentType: string;
}

function xmlTag(xml: string, tag: string): string {
  // Handles both <d:tag> and <D:tag> (case-insensitive namespace prefix)
  const re = new RegExp(`<(?:[a-zA-Z]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function parsePropfindResponse(xml: string): PropfindEntry[] {
  const entries: PropfindEntry[] = [];
  // Split on <d:response> ... </d:response> (case-insensitive prefix)
  const responseRe = /<(?:[a-zA-Z]+:)?response[^>]*>([\s\S]*?)<\/(?:[a-zA-Z]+:)?response>/gi;
  let match: RegExpExecArray | null;
  while ((match = responseRe.exec(xml)) !== null) {
    const block = match[1];
    const href = xmlTag(block, "href");
    const displayname = xmlTag(block, "displayname");
    const contentLength = parseInt(xmlTag(block, "getcontentlength") || "0", 10);
    const lastModified = xmlTag(block, "getlastmodified");
    const contentType = xmlTag(block, "getcontenttype");
    // A collection has <d:collection/> inside <d:resourcetype>
    const resourcetype = xmlTag(block, "resourcetype");
    const isCollection = /<(?:[a-zA-Z]+:)?collection/i.test(resourcetype);

    entries.push({
      href: decodeURIComponent(href),
      displayname,
      isCollection,
      contentLength: isNaN(contentLength) ? 0 : contentLength,
      lastModified,
      contentType,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Shared data-loading helpers
// ---------------------------------------------------------------------------

interface ProjectContext {
  rootPath: string;        // nextcloud_root_path from project_config
  chapterFolder?: string;  // e.g. "01_Konzept"
}

async function resolveProjectContext(
  supabase: ReturnType<typeof createClient>,
  supabaseService: ReturnType<typeof createClient>,
  userId: string,
  projectConfigId: string,
  chapterSortOrder: number | undefined,
  log: ReturnType<typeof createLogger>,
): Promise<{ ctx: ProjectContext | null; errorResponse?: Response; corsHeaders: Record<string, string>; accessDenied?: boolean }> {
  // Dummy corsHeaders — caller should pass the right ones, but this type-satisfies the object
  const ch: Record<string, string> = {};

  // 1. Verify project access
  const { data: access, error: accessErr } = await supabase
    .from("project_access")
    .select("project_config_id")
    .eq("profile_id", userId)
    .eq("project_config_id", projectConfigId)
    .maybeSingle();

  if (accessErr || !access) {
    log.warn("No project access", { projectConfigId });
    return { ctx: null, errorResponse: undefined, corsHeaders: ch, accessDenied: true };
  }

  // 2. Load project_config.nextcloud_root_path
  const { data: config } = await supabaseService
    .from("project_config")
    .select("nextcloud_root_path")
    .eq("id", projectConfigId)
    .single();

  const rootPath: string | null = (config as { nextcloud_root_path: string | null } | null)?.nextcloud_root_path ?? null;
  if (!rootPath) {
    return { ctx: null, corsHeaders: ch }; // caller handles NEXTCLOUD_NOT_CONFIGURED
  }

  // 3. Optionally resolve chapter folder name
  let chapterFolder: string | undefined;
  if (chapterSortOrder !== undefined && chapterSortOrder !== null) {
    const { data: chapter } = await supabaseService
      .from("chapter_config")
      .select("title, sort_order")
      .eq("project_config_id", projectConfigId)
      .eq("sort_order", chapterSortOrder)
      .eq("is_active", true)
      .maybeSingle();

    if (chapter) {
      chapterFolder = buildChapterFolder(chapter.sort_order, chapter.title);
    }
  }

  return { ctx: { rootPath: rootPath.replace(/\/+$/, ""), chapterFolder }, corsHeaders: ch };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("nextcloud-files", requestId);

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth -----------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", correlationId: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ncUrl = Deno.env.get("NEXTCLOUD_URL");
    const ncUser = Deno.env.get("NEXTCLOUD_USER");
    const ncPass = Deno.env.get("NEXTCLOUD_PASS");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      log.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ ok: false, code: "SERVER_ERROR", correlationId: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!ncUrl || !ncUser || !ncPass) {
      log.error("Missing Nextcloud configuration");
      return new Response(
        JSON.stringify({ ok: false, code: "SERVER_ERROR", message: "Nextcloud not configured on server", correlationId: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Supabase clients
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", correlationId: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // --- Parse request body / form-data ---------------------------------
    const contentType = req.headers.get("content-type") || "";
    let action: string;
    let projectConfigId: string;
    let chapterSortOrder: number | undefined;
    let filePath: string | undefined;
    let uploadFile: File | null = null;
    let subPath: string | undefined;
    let folderPath: string | undefined;
    let taskName: string | undefined;
    let taskDate: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      action = (formData.get("action") as string) || "";
      projectConfigId = (formData.get("project_config_id") as string) || "";
      const cso = formData.get("chapter_sort_order");
      chapterSortOrder = cso !== null && cso !== "" ? parseInt(cso as string, 10) : undefined;
      filePath = (formData.get("file_path") as string) || undefined;
      uploadFile = formData.get("file") as File | null;
      subPath = (formData.get("sub_path") as string) || undefined;
      folderPath = (formData.get("folder_path") as string) || undefined;
      taskName = (formData.get("task_name") as string) || undefined;
      taskDate = (formData.get("task_date") as string) || undefined;
    } else {
      const body = await req.json();
      action = body.action || "";
      projectConfigId = body.project_config_id || "";
      chapterSortOrder = body.chapter_sort_order !== undefined && body.chapter_sort_order !== null
        ? Number(body.chapter_sort_order)
        : undefined;
      filePath = body.file_path || undefined;
      subPath = body.sub_path || undefined;
      folderPath = body.folder_path || undefined;
      taskName = body.task_name || undefined;
      taskDate = body.task_date || undefined;
    }

    if (!action) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "action required", correlationId: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Actions that use profile-based client root instead of project_config_id
    const CLIENT_ROOT_ACTIONS = ["browse-client", "download-client-file", "upload-client-file", "mkdir-client"];
    const requiresProjectConfigId = !CLIENT_ROOT_ACTIONS.includes(action);

    if (requiresProjectConfigId && !projectConfigId) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "project_config_id required", correlationId: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log.info("Request received", { action });

    // --- Validate chapter_sort_order ------------------------------------
    if (chapterSortOrder !== undefined && (!Number.isInteger(chapterSortOrder) || chapterSortOrder < 0 || chapterSortOrder > 99)) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid chapter_sort_order", correlationId: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Validate sub_path -------------------------------------------------
    if (subPath !== undefined && !isPathSafe(subPath)) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid sub_path", correlationId: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Project-context-dependent validation (skip for client-root actions) ---
    let ctx: ProjectContext | null = null;
    let targetPath = "";

    if (requiresProjectConfigId) {
      // Validate project_config_id format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectConfigId)) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid project_config_id", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Resolve project context
      const resolved = await resolveProjectContext(
        supabase, supabaseService, user.id, projectConfigId,
        subPath ? undefined : chapterSortOrder, log,
      );

      if (resolved.accessDenied) {
        return new Response(
          JSON.stringify({ ok: false, code: "FORBIDDEN", correlationId: requestId }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!resolved.ctx) {
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED", correlationId: requestId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      ctx = resolved.ctx;

      // Build the target path
      targetPath = ctx.rootPath;
      if (subPath) {
        targetPath = `${targetPath}/${subPath}`;
      } else if (ctx.chapterFolder) {
        targetPath = `${targetPath}/${ctx.chapterFolder}`;
      }
    }

    const base = webdavBase(ncUrl, ncUser);
    const authHeaderNC = basicAuth(ncUser, ncPass);

    // ====================================================================
    // Client-root actions are handled separately below (browse-client, upload-task-file).
    // Project-based actions (list, download, upload, mkdir) require ctx.
    // ====================================================================

    // ====================================================================
    // ACTION: list
    // ====================================================================
    if (action === "list") {
      const davUrl = `${base}${encodePath(targetPath)}/`;
      log.info("PROPFIND", { davUrl });

      const propfindResp = await fetch(davUrl, {
        method: "PROPFIND",
        headers: {
          Authorization: authHeaderNC,
          "Content-Type": "application/xml",
          Depth: "1",
        },
        body: PROPFIND_BODY,
      });

      // 404 means folder doesn't exist yet — treat as empty
      if (propfindResp.status === 404) {
        log.info("Folder not found, returning empty list");
        return new Response(
          JSON.stringify({ ok: true, code: "OK", correlationId: requestId, data: { files: [] } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!propfindResp.ok) {
        const errText = await propfindResp.text();
        log.error("PROPFIND failed", { status: propfindResp.status, body: errText.slice(0, 500) });
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", correlationId: requestId }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const xml = await propfindResp.text();
      const entries = parsePropfindResponse(xml);

      // First entry is the folder itself — skip it
      const files = entries.slice(1).map((e) => {
        // Derive relative path from href
        const fullHref = e.href;
        // Extract just the file/folder name from href
        const segments = fullHref.split("/").filter(Boolean);
        const name = e.displayname || segments[segments.length - 1] || "";

        // Relative path: from project root
        let relativePath = "";
        if (subPath) {
          relativePath = `${subPath}/${name}`;
        } else if (ctx!.chapterFolder) {
          relativePath = `${ctx!.chapterFolder}/${name}`;
        } else {
          relativePath = name;
        }

        return {
          name,
          path: relativePath,
          type: e.isCollection ? "folder" as const : "file" as const,
          mimeType: e.contentType || undefined,
          size: e.contentLength,
          lastModified: e.lastModified
            ? new Date(e.lastModified).toISOString()
            : new Date().toISOString(),
        };
      });

      log.info("Listed files", { count: files.length });

      return new Response(
        JSON.stringify({ ok: true, code: "OK", correlationId: requestId, data: { files } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ====================================================================
    // ACTION: download
    // ====================================================================
    if (action === "download") {
      if (!filePath) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "file_path required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Security: validate file_path
      if (!isPathSafe(filePath)) {
        log.warn("Path traversal attempt blocked", { filePath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid file path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fullPath = `${ctx!.rootPath}/${filePath}`;
      // Double-check the resolved path starts with the root (belt-and-suspenders)
      if (!fullPath.startsWith(ctx!.rootPath)) {
        log.warn("Path escape attempt", { fullPath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid file path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const davUrl = `${base}${encodePath(fullPath)}`;
      log.info("GET file", { davUrl });

      const fileResp = await fetch(davUrl, {
        headers: { Authorization: authHeaderNC },
      });

      if (!fileResp.ok) {
        log.error("Download failed", { status: fileResp.status });
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", message: "File not found", correlationId: requestId }),
          { status: fileResp.status === 404 ? 404 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Stream the response back to the browser
      const fileName = filePath.split("/").pop() || "download";
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Content-Type", fileResp.headers.get("Content-Type") || "application/octet-stream");
      responseHeaders.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      const cl = fileResp.headers.get("Content-Length");
      if (cl) responseHeaders.set("Content-Length", cl);

      log.info("Streaming download", { fileName });

      return new Response(fileResp.body, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // ====================================================================
    // ACTION: upload
    // ====================================================================
    if (action === "upload") {
      if (!uploadFile) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "file field required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 50 MB limit
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
      if (uploadFile.size > MAX_UPLOAD_SIZE) {
        return new Response(
          JSON.stringify({ ok: false, code: "FILE_TOO_LARGE", message: "Max 50 MB", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fileName = uploadFile.name;
      // Sanitise filename
      if (!isPathSafe(fileName)) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid file name", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fullPath = `${targetPath}/${fileName}`;
      const davUrl = `${base}${encodePath(fullPath)}`;

      log.info("PUT file", { davUrl, size: uploadFile.size });

      // Stream the file body directly to Nextcloud (no buffering)
      const putResp = await fetch(davUrl, {
        method: "PUT",
        headers: {
          Authorization: authHeaderNC,
          "Content-Type": uploadFile.type || "application/octet-stream",
        },
        body: uploadFile.stream(),
      });

      if (!putResp.ok) {
        const errText = await putResp.text();
        log.error("Upload PUT failed", { status: putResp.status, body: errText.slice(0, 500) });

        // 409 means parent folder doesn't exist
        if (putResp.status === 409) {
          return new Response(
            JSON.stringify({ ok: false, code: "FOLDER_NOT_FOUND", message: "Target folder does not exist in Nextcloud", correlationId: requestId }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", correlationId: requestId }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      log.info("Upload succeeded", { fileName });

      let relativePath = "";
      if (subPath) {
        relativePath = `${subPath}/${fileName}`;
      } else if (ctx!.chapterFolder) {
        relativePath = `${ctx!.chapterFolder}/${fileName}`;
      } else {
        relativePath = fileName;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          code: "OK",
          correlationId: requestId,
          data: { name: fileName, size: uploadFile.size, path: relativePath },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ====================================================================
    // ACTION: mkdir
    // ====================================================================
    if (action === "mkdir") {
      if (!folderPath) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "folder_path required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!isPathSafe(folderPath)) {
        log.warn("Invalid folder_path", { folderPath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid folder path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Recursive creation: MKCOL each segment from root down
      const segments = folderPath.split("/");
      let currentPath = ctx!.rootPath;

      for (const segment of segments) {
        currentPath = `${currentPath}/${segment}`;
        const davUrl = `${base}${encodePath(currentPath)}`;

        log.info("MKCOL", { davUrl });

        const mkcolResp = await fetch(davUrl, {
          method: "MKCOL",
          headers: { Authorization: authHeaderNC },
        });

        if (mkcolResp.status === 201) {
          log.info("Folder created", { segment });
        } else if (mkcolResp.status === 405) {
          // Folder already exists — idempotent success
          log.info("Folder already exists", { segment });
        } else if (!mkcolResp.ok) {
          const errText = await mkcolResp.text();
          log.error("MKCOL failed", { status: mkcolResp.status, body: errText.slice(0, 500) });
          return new Response(
            JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", message: "Failed to create folder", correlationId: requestId }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      log.info("mkdir complete", { folderPath });

      return new Response(
        JSON.stringify({
          ok: true,
          code: "OK",
          correlationId: requestId,
          data: { path: folderPath },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ====================================================================
    // ACTION: browse-client
    // ====================================================================
    if (action === "browse-client") {
      // Derive client root from the authenticated user's own profile
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("nextcloud_client_root")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr || !profileRow) {
        log.warn("Profile not found for browse-client");
        return new Response(
          JSON.stringify({ ok: false, code: "FORBIDDEN", correlationId: requestId }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const clientRoot: string | null = (profileRow as { nextcloud_client_root: string | null }).nextcloud_client_root;
      if (!clientRoot) {
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED", message: "No client root configured", correlationId: requestId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const cleanClientRoot = clientRoot.replace(/\/+$/, "");

      // Validate sub_path if provided (already validated above for non-browse-client,
      // but browse-client may also arrive with sub_path)
      if (subPath !== undefined && !isPathSafe(subPath)) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid sub_path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const browseTarget = subPath ? `${cleanClientRoot}/${subPath}` : cleanClientRoot;

      // Prefix check: resolved path must stay within client root
      if (!browseTarget.startsWith(cleanClientRoot)) {
        log.warn("Path escape attempt in browse-client", { browseTarget });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const base = webdavBase(ncUrl, ncUser);
      const authHeaderNC = basicAuth(ncUser, ncPass);
      const davUrl = `${base}${encodePath(browseTarget)}/`;
      log.info("browse-client PROPFIND", { davUrl });

      const propfindResp = await fetch(davUrl, {
        method: "PROPFIND",
        headers: {
          Authorization: authHeaderNC,
          "Content-Type": "application/xml",
          Depth: "1",
        },
        body: PROPFIND_BODY,
      });

      if (propfindResp.status === 404) {
        log.info("Client folder not found, returning empty list");
        return new Response(
          JSON.stringify({ ok: true, code: "OK", correlationId: requestId, data: { files: [] } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!propfindResp.ok) {
        const errText = await propfindResp.text();
        log.error("browse-client PROPFIND failed", { status: propfindResp.status, body: errText.slice(0, 500) });
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", correlationId: requestId }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const xml = await propfindResp.text();
      const entries = parsePropfindResponse(xml);

      const files = entries.slice(1).map((e) => {
        const segments = e.href.split("/").filter(Boolean);
        const name = e.displayname || segments[segments.length - 1] || "";
        const relativePath = subPath ? `${subPath}/${name}` : name;

        return {
          name,
          path: relativePath,
          type: e.isCollection ? "folder" as const : "file" as const,
          mimeType: e.contentType || undefined,
          size: e.contentLength,
          lastModified: e.lastModified
            ? new Date(e.lastModified).toISOString()
            : new Date().toISOString(),
        };
      });

      log.info("browse-client listed files", { count: files.length });

      return new Response(
        JSON.stringify({ ok: true, code: "OK", correlationId: requestId, data: { files } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ====================================================================
    // ACTION: download-client-file
    // ====================================================================
    if (action === "download-client-file") {
      if (!filePath) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "file_path required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Security: validate file_path
      if (!isPathSafe(filePath)) {
        log.warn("Path traversal attempt blocked in download-client-file", { filePath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid file path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Derive client root from the authenticated user's profile
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("nextcloud_client_root")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr || !profileRow) {
        log.warn("Profile not found for download-client-file");
        return new Response(
          JSON.stringify({ ok: false, code: "FORBIDDEN", correlationId: requestId }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const clientRoot: string | null = (profileRow as { nextcloud_client_root: string | null }).nextcloud_client_root;
      if (!clientRoot) {
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED", message: "No client root configured", correlationId: requestId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const cleanClientRoot = clientRoot.replace(/\/+$/, "");
      const fullPath = `${cleanClientRoot}/${filePath}`;

      // Prefix check: resolved path must stay within client root
      if (!fullPath.startsWith(cleanClientRoot)) {
        log.warn("Path escape attempt in download-client-file", { fullPath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid file path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const davUrl = `${base}${encodePath(fullPath)}`;
      log.info("download-client-file GET", { davUrl });

      const fileResp = await fetch(davUrl, {
        headers: { Authorization: authHeaderNC },
      });

      if (!fileResp.ok) {
        log.error("download-client-file failed", { status: fileResp.status });
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", message: "File not found", correlationId: requestId }),
          { status: fileResp.status === 404 ? 404 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Stream the response back to the browser
      const fileName = filePath.split("/").pop() || "download";
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Content-Type", fileResp.headers.get("Content-Type") || "application/octet-stream");
      responseHeaders.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      const cl = fileResp.headers.get("Content-Length");
      if (cl) responseHeaders.set("Content-Length", cl);

      log.info("download-client-file streaming", { fileName });

      return new Response(fileResp.body, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // ====================================================================
    // ACTION: upload-client-file
    // ====================================================================
    if (action === "upload-client-file") {
      if (!uploadFile) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "file field required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 50 MB limit
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
      if (uploadFile.size > MAX_UPLOAD_SIZE) {
        return new Response(
          JSON.stringify({ ok: false, code: "FILE_TOO_LARGE", message: "Max 50 MB", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Derive client root from the authenticated user's profile
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("nextcloud_client_root")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr || !profileRow) {
        log.warn("Profile not found for upload-client-file");
        return new Response(
          JSON.stringify({ ok: false, code: "FORBIDDEN", correlationId: requestId }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const clientRoot: string | null = (profileRow as { nextcloud_client_root: string | null }).nextcloud_client_root;
      if (!clientRoot) {
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED", message: "No client root configured", correlationId: requestId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const cleanClientRoot = clientRoot.replace(/\/+$/, "");

      // Validate sub_path if provided
      if (subPath !== undefined && !isPathSafe(subPath)) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid sub_path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const uploadTarget = subPath ? `${cleanClientRoot}/${subPath}` : cleanClientRoot;

      // Prefix check: resolved path must stay within client root
      if (!uploadTarget.startsWith(cleanClientRoot)) {
        log.warn("Path escape attempt in upload-client-file", { uploadTarget });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Sanitise filename
      const fileName = uploadFile.name;
      if (!isPathSafe(fileName)) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid file name", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fullFilePath = `${uploadTarget}/${fileName}`;
      const davUrl = `${base}${encodePath(fullFilePath)}`;

      log.info("upload-client-file PUT", { davUrl, size: uploadFile.size });

      const putResp = await fetch(davUrl, {
        method: "PUT",
        headers: {
          Authorization: authHeaderNC,
          "Content-Type": uploadFile.type || "application/octet-stream",
        },
        body: uploadFile.stream(),
      });

      if (!putResp.ok) {
        const errText = await putResp.text();
        log.error("upload-client-file PUT failed", { status: putResp.status, body: errText.slice(0, 500) });

        if (putResp.status === 409) {
          return new Response(
            JSON.stringify({ ok: false, code: "FOLDER_NOT_FOUND", message: "Target folder does not exist in Nextcloud", correlationId: requestId }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", correlationId: requestId }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const relativePath = subPath ? `${subPath}/${fileName}` : fileName;
      log.info("upload-client-file succeeded", { fileName });

      return new Response(
        JSON.stringify({
          ok: true,
          code: "OK",
          correlationId: requestId,
          data: { name: fileName, size: uploadFile.size, path: relativePath },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ====================================================================
    // ACTION: mkdir-client
    // ====================================================================
    if (action === "mkdir-client") {
      if (!folderPath) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "folder_path required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!isPathSafe(folderPath)) {
        log.warn("Invalid folder_path in mkdir-client", { folderPath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid folder path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Derive client root from the authenticated user's profile
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("nextcloud_client_root")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr || !profileRow) {
        log.warn("Profile not found for mkdir-client");
        return new Response(
          JSON.stringify({ ok: false, code: "FORBIDDEN", correlationId: requestId }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const clientRoot: string | null = (profileRow as { nextcloud_client_root: string | null }).nextcloud_client_root;
      if (!clientRoot) {
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED", message: "No client root configured", correlationId: requestId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const cleanClientRoot = clientRoot.replace(/\/+$/, "");
      const fullFolderPath = `${cleanClientRoot}/${folderPath}`;

      // Prefix check: resolved path must stay within client root
      if (!fullFolderPath.startsWith(cleanClientRoot)) {
        log.warn("Path escape attempt in mkdir-client", { fullFolderPath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Recursive creation: MKCOL each segment from client root down
      const segments = folderPath.split("/");
      let currentPath = cleanClientRoot;

      for (const segment of segments) {
        currentPath = `${currentPath}/${segment}`;
        const davUrl = `${base}${encodePath(currentPath)}`;

        log.info("mkdir-client MKCOL", { davUrl });

        const mkcolResp = await fetch(davUrl, {
          method: "MKCOL",
          headers: { Authorization: authHeaderNC },
        });

        if (mkcolResp.status === 201) {
          log.info("Client folder created", { segment });
        } else if (mkcolResp.status === 405) {
          // Folder already exists — idempotent success
          log.info("Client folder already exists", { segment });
        } else if (!mkcolResp.ok) {
          const errText = await mkcolResp.text();
          log.error("mkdir-client MKCOL failed", { status: mkcolResp.status, body: errText.slice(0, 500) });
          return new Response(
            JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", message: "Failed to create folder", correlationId: requestId }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      log.info("mkdir-client complete", { folderPath });

      return new Response(
        JSON.stringify({
          ok: true,
          code: "OK",
          correlationId: requestId,
          data: { path: folderPath },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ====================================================================
    // ACTION: upload-task-file
    // ====================================================================
    if (action === "upload-task-file") {
      if (!uploadFile) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "file field required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!taskName) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "task_name required", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 50 MB limit
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
      if (uploadFile.size > MAX_UPLOAD_SIZE) {
        return new Response(
          JSON.stringify({ ok: false, code: "FILE_TOO_LARGE", message: "Max 50 MB", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build task slug
      const taskSlug = slugify(taskName, 50);
      if (!taskSlug) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "task_name produces empty slug", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Date prefix: use task_date or current month
      let datePrefix: string;
      if (taskDate) {
        const d = new Date(taskDate);
        if (isNaN(d.getTime())) {
          return new Response(
            JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid task_date", correlationId: requestId }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        datePrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else {
        const now = new Date();
        datePrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }

      const taskFolderName = `${datePrefix}_${taskSlug}`;
      const taskFolderPath = `aufgaben/${taskFolderName}`;

      // Validate constructed path
      if (!isPathSafe(taskFolderPath)) {
        log.warn("Invalid task folder path", { taskFolderPath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid task folder path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Derive client root from the user's profile
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("nextcloud_client_root")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr || !profileRow) {
        log.warn("Profile not found for upload-task-file");
        return new Response(
          JSON.stringify({ ok: false, code: "FORBIDDEN", correlationId: requestId }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const clientRoot: string | null = (profileRow as { nextcloud_client_root: string | null }).nextcloud_client_root;
      if (!clientRoot) {
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED", message: "No client root configured", correlationId: requestId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const cleanClientRoot = clientRoot.replace(/\/+$/, "");
      const fullFolderPath = `${cleanClientRoot}/${taskFolderPath}`;

      // Prefix check
      if (!fullFolderPath.startsWith(cleanClientRoot)) {
        log.warn("Path escape attempt in upload-task-file", { fullFolderPath });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid path", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const base = webdavBase(ncUrl, ncUser);
      const authHeaderNC = basicAuth(ncUser, ncPass);

      // MKCOL: create aufgaben/ and the task folder (recursive)
      const folderSegments = taskFolderPath.split("/");
      let currentPath = cleanClientRoot;
      for (const segment of folderSegments) {
        currentPath = `${currentPath}/${segment}`;
        const mkcolUrl = `${base}${encodePath(currentPath)}`;
        const mkcolResp = await fetch(mkcolUrl, {
          method: "MKCOL",
          headers: { Authorization: authHeaderNC },
        });
        if (mkcolResp.status === 201) {
          log.info("Task folder segment created", { segment });
        } else if (mkcolResp.status === 405) {
          log.info("Task folder segment exists", { segment });
        } else if (!mkcolResp.ok) {
          const errText = await mkcolResp.text();
          log.error("MKCOL failed for task folder", { status: mkcolResp.status, body: errText.slice(0, 500) });
          return new Response(
            JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", message: "Failed to create task folder", correlationId: requestId }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // Sanitise filename
      const fileName = uploadFile.name;
      if (!isPathSafe(fileName)) {
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid file name", correlationId: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // PUT file
      const fullFilePath = `${fullFolderPath}/${fileName}`;
      const davUrl = `${base}${encodePath(fullFilePath)}`;
      log.info("upload-task-file PUT", { davUrl, size: uploadFile.size });

      const putResp = await fetch(davUrl, {
        method: "PUT",
        headers: {
          Authorization: authHeaderNC,
          "Content-Type": uploadFile.type || "application/octet-stream",
        },
        body: uploadFile.stream(),
      });

      if (!putResp.ok) {
        const errText = await putResp.text();
        log.error("upload-task-file PUT failed", { status: putResp.status, body: errText.slice(0, 500) });
        return new Response(
          JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", correlationId: requestId }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      log.info("upload-task-file succeeded", { fileName, taskFolderPath });

      return new Response(
        JSON.stringify({
          ok: true,
          code: "OK",
          correlationId: requestId,
          data: { name: fileName, size: uploadFile.size, path: `${taskFolderPath}/${fileName}` },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({ ok: false, code: "BAD_REQUEST", message: `Unknown action: ${action}`, correlationId: requestId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    log.error("Function error", { error: (error as Error).message });
    return new Response(
      JSON.stringify({ ok: false, code: "SERVER_ERROR", correlationId: requestId }),
      { status: 500, headers: { ...defaultCorsHeaders, "Content-Type": "application/json" } },
    );
  }
});
