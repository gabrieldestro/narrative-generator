import pino from 'pino';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ILogger, LogLevel } from '../domain/ports.js';
import { resolveLogPath } from './LoggerPaths.js';

export interface PinoLoggerOptions {
  level?: LogLevel;
  logFile?: string;
  consolePretty?: boolean;
}

export class PinoLogger implements ILogger {
  private readonly logger: pino.Logger;

  constructor(options: PinoLoggerOptions = {}) {
    const level = options.level ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info';
    const logFile = options.logFile ?? process.env.LOG_FILE ?? resolveLogPath('app.log');
    const consolePretty = options.consolePretty ?? process.env.LOG_CONSOLE_PRETTY !== 'false';

    mkdirSync(dirname(logFile), { recursive: true });

    const transports: pino.TransportTargetOptions[] = [
      {
        target: 'pino/file',
        options: { destination: logFile, mkdir: true },
        level,
      },
    ];

    if (consolePretty) {
      transports.push({
        target: 'pino-pretty',
        options: { colorize: true },
        level,
      });
    }

    this.logger = pino(
      {
        level,
        formatters: {
          level: (label) => ({ level: label }),
        },
        serializers: {
          err: pino.stdSerializers.err,
          error: pino.stdSerializers.err,
        },
      },
      pino.transport({ targets: transports }),
    );
  }

  trace(msg: string, ...args: unknown[]): void { this.logger.trace(args, msg); }
  debug(msg: string, ...args: unknown[]): void { this.logger.debug(args, msg); }
  info(msg: string, ...args: unknown[]): void { this.logger.info(args, msg); }
  warn(msg: string, ...args: unknown[]): void { this.logger.warn(args, msg); }
  error(msg: string, ...args: unknown[]): void { this.logger.error(args, msg); }
  fatal(msg: string, ...args: unknown[]): void { this.logger.fatal(args, msg); }

  child(bindings: Record<string, unknown>): ILogger {
    const childLogger = this.logger.child(bindings as Record<string, any>);
    return new PinoLoggerChild(childLogger);
  }
}

class PinoLoggerChild implements ILogger {
  constructor(private readonly logger: pino.Logger) {}

  trace(msg: string, ...args: unknown[]): void { this.logger.trace(args, msg); }
  debug(msg: string, ...args: unknown[]): void { this.logger.debug(args, msg); }
  info(msg: string, ...args: unknown[]): void { this.logger.info(args, msg); }
  warn(msg: string, ...args: unknown[]): void { this.logger.warn(args, msg); }
  error(msg: string, ...args: unknown[]): void { this.logger.error(args, msg); }
  fatal(msg: string, ...args: unknown[]): void { this.logger.fatal(args, msg); }

  child(bindings: Record<string, unknown>): ILogger {
    return new PinoLoggerChild(this.logger.child(bindings as Record<string, any>));
  }
}
