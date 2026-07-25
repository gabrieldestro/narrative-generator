import { Injectable, Optional, Inject, InjectionToken } from '@angular/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_TOKEN = new InjectionToken<LogLevel>('LOG_LEVEL');

const STORAGE_KEY = 'narrative_app_logs';
const MAX_STORED_LOGS = 500;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  sessionId?: string | null;
  context?: Record<string, unknown>;
  error?: { message: string; name: string; stack?: string };
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

@Injectable({ providedIn: 'root' })
export class LoggingService {
  private readonly sessionId: string | null = null;

  constructor(@Optional() @Inject(LOG_LEVEL_TOKEN) private level: LogLevel | null = null) {
    this.level = level ?? 'debug';
  }

  debug(msg: string, context?: Record<string, unknown>): void {
    this.log('debug', msg, context);
  }

  info(msg: string, context?: Record<string, unknown>): void {
    this.log('info', msg, context);
  }

  warn(msg: string, context?: Record<string, unknown>): void {
    this.log('warn', msg, context);
  }

  error(msg: string, error?: Error, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: 'error',
      message: msg,
      sessionId: this.sessionId,
      ...context,
      error: error ? { message: error.message, name: error.name, stack: error.stack } : undefined,
    };

    if (error) {
      console.error(`[${entry.timestamp}] [ERROR] [${this.sessionId ?? 'no-session'}] ${msg}`, error, context ?? '');
    } else {
      console.error(`[${entry.timestamp}] [ERROR] [${this.sessionId ?? 'no-session'}] ${msg}`, context ?? '');
    }

    this.persist(entry);
  }

  private log(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
    const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] < levels[this.level!]) {
      return;
    }

    const prefix = `[${formatTimestamp()}] [${level.toUpperCase()}] [${this.sessionId ?? 'no-session'}]`;

    switch (level) {
      case 'debug':
        console.debug(prefix, msg, context ?? '');
        break;
      case 'info':
        console.info(prefix, msg, context ?? '');
        break;
      case 'warn':
        console.warn(prefix, msg, context ?? '');
        break;
    }

    this.persist({ timestamp: formatTimestamp(), level, message: msg, sessionId: this.sessionId, context });
  }

  private persist(entry: LogEntry): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const logs: LogEntry[] = stored ? JSON.parse(stored) : [];
      logs.push(entry);
      if (logs.length > MAX_STORED_LOGS) {
        logs.splice(0, logs.length - MAX_STORED_LOGS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // localStorage pode estar cheio ou indisponível
    }
  }

  getStoredLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  clearStoredLogs(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignora
    }
  }
}
