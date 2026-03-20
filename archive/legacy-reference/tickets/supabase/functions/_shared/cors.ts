// Shared CORS configuration for all Edge Functions
// SECURITY: Restrict to allowed origins only

const ALLOWED_ORIGINS = [
  'https://portal.kamanin.at',
  'https://cconnect.lovable.app',
  'http://localhost:5173',
  'http://localhost:5174',
];

// Pattern for Lovable preview URLs (e.g., id-preview--uuid.lovable.app)
const PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/;
// Pattern for lovableproject.com domains
const PROJECT_PATTERN = /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/;

// Check if origin is allowed
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (PREVIEW_PATTERN.test(origin)) return true;
  if (PROJECT_PATTERN.test(origin)) return true;
  return false;
}

// Get CORS headers for the given origin
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Default headers (for backward compatibility - uses first allowed origin)
export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};
