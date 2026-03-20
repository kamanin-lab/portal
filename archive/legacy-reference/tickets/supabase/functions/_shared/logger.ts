/**
 * Centralized logging utility for Supabase Edge Functions.
 * Outputs structured JSON for easy parsing in Supabase Logs.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  function: string;
  message: string;
  requestId?: string;
  data?: unknown;
}

/**
 * Sanitize data to remove sensitive information before logging.
 * Removes emails, tokens, passwords, and other PII.
 */
function sanitizeData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = { ...data as Record<string, unknown> };
  const sensitiveKeys = ['email', 'password', 'token', 'authorization', 'apikey', 'secret', 'userid', 'user_id', 'profile_id'];
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(k => lowerKey.includes(k))) {
      sanitized[key] = '[REDACTED]';
    }
    // Recursively sanitize nested objects
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }
  
  return sanitized;
}

/**
 * Create a logger instance for an Edge Function.
 * 
 * @param functionName - The name of the Edge Function (e.g., 'fetch-clickup-tasks')
 * @param requestId - Optional unique request ID for tracing
 * 
 * @example
 * const requestId = crypto.randomUUID().slice(0, 8);
 * const log = createLogger('fetch-clickup-tasks', requestId);
 * log.info('Request received', { listCount: 3 });
 * log.error('ClickUp API failed', { status: 500 });
 */
export function createLogger(functionName: string, requestId?: string) {
  const log = (level: LogLevel, message: string, data?: unknown) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      function: functionName,
      message,
      requestId,
      data: data ? sanitizeData(data) : undefined,
    };

    // Output structured JSON for easy parsing in Supabase Logs
    const output = JSON.stringify(entry);

    switch (level) {
      case 'ERROR':
        console.error(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  };

  return {
    debug: (msg: string, data?: unknown) => log('DEBUG', msg, data),
    info: (msg: string, data?: unknown) => log('INFO', msg, data),
    warn: (msg: string, data?: unknown) => log('WARN', msg, data),
    error: (msg: string, data?: unknown) => log('ERROR', msg, data),
  };
}
