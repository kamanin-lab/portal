/**
 * Centralized logging utility for the frontend application.
 * Provides consistent formatting, log levels, and context.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Minimum log level for output (DEBUG in dev, INFO in production)
const MIN_LEVEL: LogLevel = import.meta.env.DEV ? 'DEBUG' : 'INFO';

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level}] [${entry.context}]`;
  return `${prefix} ${entry.message}`;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/**
 * Sanitize data to remove sensitive information before logging.
 */
function sanitizeData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = { ...data as Record<string, unknown> };
  const sensitiveKeys = ['email', 'password', 'token', 'authorization', 'apikey', 'secret'];
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Create a logger instance with a specific context (e.g., component or hook name).
 * 
 * @example
 * const log = createLogger('useClickUpTasks');
 * log.info('Fetching tasks', { count: 10 });
 * log.error('Failed to fetch', { error: err.message });
 */
export function createLogger(context: string) {
  const log = (level: LogLevel, message: string, data?: unknown) => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data: data ? sanitizeData(data) : undefined,
    };

    const formatted = formatLog(entry);

    switch (level) {
      case 'ERROR':
        console.error(formatted, entry.data ?? '');
        break;
      case 'WARN':
        console.warn(formatted, entry.data ?? '');
        break;
      case 'DEBUG':
        console.debug(formatted, entry.data ?? '');
        break;
      default:
        console.log(formatted, entry.data ?? '');
    }
  };

  return {
    debug: (msg: string, data?: unknown) => log('DEBUG', msg, data),
    info: (msg: string, data?: unknown) => log('INFO', msg, data),
    warn: (msg: string, data?: unknown) => log('WARN', msg, data),
    error: (msg: string, data?: unknown) => log('ERROR', msg, data),
  };
}

// Global logger for quick usage
export const logger = createLogger('App');
