import { Injectable, Optional, Inject, InjectionToken, inject } from '@angular/core';
import { GameStateService } from './game-state.service';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_TOKEN = new InjectionToken<LogLevel>('LOG_LEVEL');

const STORAGE_KEY = 'narrative_app_logs';
const MAX_STORED_LOGS = 500;
const API_BASE = 'http://localhost:3000/api';
const FLUSH_INTERVAL_MS = 2000;
const FLUSH_MAX_BATCH = 50;

// Mapeamento de nível para número (maior = mais grave)
const LEVEL_NUM: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// Mapeamento para o método do console correto.
// PROBLEMA ANTERIOR: console.debug() é filtrado como "Verbose" no Chrome/Edge por padrão —
// a maioria dos devs nunca habilita esse filtro, então logs de debug/info sumiam.
// SOLUÇÃO: mapear debug→console.log e info→console.log para garantir visibilidade.
// warn e error continuam nos canais corretos.
const CONSOLE_METHOD: Record<LogLevel, 'log' | 'warn' | 'error'> = {
  debug: 'log',
  info: 'log',
  warn: 'warn',
  error: 'error',
};

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
  // GameStateService injetado para ler o sessionId atual nos logs
  private readonly gameStateLazy = inject(GameStateService);

  private get sessionId(): string | null {
    // Leitura lazy: evita dependência circular na inicialização
    return this.gameStateLazy.sessionId();
  }

  private readonly pending: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Optional() @Inject(LOG_LEVEL_TOKEN) private level: LogLevel | null = null) {
    this.level = level ?? 'debug';
    if (typeof window !== 'undefined') {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
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
      context,
      error: error ? { message: error.message, name: error.name, stack: error.stack } : undefined,
    };

    const prefix = `[${entry.timestamp}] [ERROR] [${this.sessionId ?? 'no-session'}]`;
    if (error) {
      console.error(prefix, msg, error, context ?? '');
    } else {
      console.error(prefix, msg, context ?? '');
    }

    this.persist(entry);
  }

  private log(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
    if (LEVEL_NUM[level] < LEVEL_NUM[this.level!]) {
      return;
    }

    const prefix = `[${formatTimestamp()}] [${level.toUpperCase()}] [${this.sessionId ?? 'no-session'}]`;
    const method = CONSOLE_METHOD[level];

    if (context && Object.keys(context).length > 0) {
      console[method](prefix, msg, context);
    } else {
      console[method](prefix, msg);
    }

    this.persist({ timestamp: formatTimestamp(), level, message: msg, sessionId: this.sessionId, context });
  }

  private persist(entry: LogEntry): void {
    this.pending.push(entry);
    if (this.pending.length >= FLUSH_MAX_BATCH) {
      this.flush();
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const logs: LogEntry[] = stored ? JSON.parse(stored) : [];
      logs.push(entry);
      if (logs.length > MAX_STORED_LOGS) {
        logs.splice(0, logs.length - MAX_STORED_LOGS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // localStorage pode estar cheio ou indisponível — falha silenciosa intencional
    }
  }

  private async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0, FLUSH_MAX_BATCH);
    try {
      await fetch(`${API_BASE}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: batch.map(e => ({ level: e.level, message: e.message, context: e.context })) }),
      });
    } catch {
      // falha silenciosa — log não pode quebrar a aplicação
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

  downloadLogs(): void {
    const logs = this.getStoredLogs();
    if (logs.length === 0) return;

    const jsonl = logs.map(e => JSON.stringify(e)).join('\n');
    const blob = new Blob([jsonl], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frontend-logs-${new Date().toISOString().slice(0, 10)}.jsonl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
