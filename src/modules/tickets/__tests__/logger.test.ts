import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../lib/logger';

// Tests exercise the public createLogger API.
// sanitizeData is private — we verify its effect through logged output.

describe('createLogger', () => {
  test('returns object with debug, info, warn, error methods', () => {
    const logger = createLogger('TestContext');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

describe('createLogger — sanitization of sensitive data', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('redacts "password" key from logged data', () => {
    const logger = createLogger('Auth');
    logger.info('user action', { userId: 'u1', password: 'secret123' });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.password).toBe('[REDACTED]');
    expect(loggedData.userId).toBe('u1');
  });

  test('redacts "token" key from logged data', () => {
    const logger = createLogger('Auth');
    logger.info('api call', { token: 'abc123', endpoint: '/tasks' });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.token).toBe('[REDACTED]');
    expect(loggedData.endpoint).toBe('/tasks');
  });

  test('redacts "authorization" key from logged data', () => {
    const logger = createLogger('HTTP');
    logger.info('request', { authorization: 'Bearer xyz', method: 'GET' });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.authorization).toBe('[REDACTED]');
    expect(loggedData.method).toBe('GET');
  });

  test('redacts "email" key from logged data', () => {
    const logger = createLogger('User');
    logger.info('login', { email: 'user@example.com', status: 'ok' });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.email).toBe('[REDACTED]');
    expect(loggedData.status).toBe('ok');
  });

  test('redacts "apikey" key from logged data', () => {
    const logger = createLogger('Integration');
    logger.info('sync', { apikey: 'pk_live_123', service: 'clickup' });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.apikey).toBe('[REDACTED]');
  });

  test('redacts "secret" key from logged data', () => {
    const logger = createLogger('Config');
    logger.info('init', { secret: 'shh', region: 'eu' });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.secret).toBe('[REDACTED]');
  });

  test('redacts keys that contain a sensitive word (case-insensitive substring match)', () => {
    const logger = createLogger('Test');
    logger.info('call', { accessToken: 'tok', userPassword: 'pass', name: 'ok' });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.accessToken).toBe('[REDACTED]');
    expect(loggedData.userPassword).toBe('[REDACTED]');
    expect(loggedData.name).toBe('ok');
  });

  test('passes non-sensitive data through unchanged', () => {
    const logger = createLogger('Task');
    logger.info('loaded', { taskId: 'T-1', status: 'done', count: 5 });
    const loggedData = logSpy.mock.calls[0][1];
    expect(loggedData.taskId).toBe('T-1');
    expect(loggedData.status).toBe('done');
    expect(loggedData.count).toBe(5);
  });

  test('handles primitive data without throwing', () => {
    const logger = createLogger('Test');
    expect(() => logger.info('msg', 'just a string')).not.toThrow();
    expect(() => logger.info('msg', 42)).not.toThrow();
    expect(() => logger.info('msg', null)).not.toThrow();
  });

  test('handles undefined data (no second argument)', () => {
    const logger = createLogger('Test');
    expect(() => logger.info('no data')).not.toThrow();
  });
});

describe('createLogger — log routing', () => {
  afterEach(() => vi.restoreAllMocks());

  test('error() routes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createLogger('X').error('boom');
    expect(spy).toHaveBeenCalledOnce();
  });

  test('warn() routes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createLogger('X').warn('careful');
    expect(spy).toHaveBeenCalledOnce();
  });

  test('info() routes to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createLogger('X').info('hello');
    expect(spy).toHaveBeenCalledOnce();
  });

  test('debug() routes to console.debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    createLogger('X').debug('trace');
    expect(spy).toHaveBeenCalledOnce();
  });

  test('logged message includes context name', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createLogger('MyContext').info('test message');
    const formatted: string = spy.mock.calls[0][0];
    expect(formatted).toContain('[MyContext]');
    expect(formatted).toContain('test message');
  });
});
