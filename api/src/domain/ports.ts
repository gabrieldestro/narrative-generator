export interface IUserInput {
  question(prompt: string): Promise<string>;
  close(): void;
}

export interface IOutputWriter {
  write(text: string): void;
  writeLine(text?: string): void;
  clear(): void;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface ILogger {
  trace(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  fatal(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): ILogger;
}
