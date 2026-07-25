import { join } from 'path';

export function resolveLogPath(filename: string): string {
  const logDir = process.env.LOG_DIR ?? 'logs';
  return join(logDir, filename);
}
