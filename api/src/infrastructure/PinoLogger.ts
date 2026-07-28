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

    const streams: pino.StreamEntry[] = [
      {
        stream: pino.destination({ dest: logFile, sync: true, mkdir: true }),
        level,
      },
    ];

    if (consolePretty) {
      streams.push({
        stream: pino.transport({
          target: 'pino-pretty',
          options: { colorize: true, sync: true },
        }),
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
      pino.multistream(streams),
    );
  }

  // CORREÇÃO: A API do pino é logger.method(mergeObject, message) quando há contexto,
  // ou logger.method(message) quando não há. Antes estava invertido (args, msg),
  // fazendo a string de mensagem ir para o campo errado.
  trace(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.trace(args[0] as object, msg);
    else this.logger.trace(msg);
  }

  debug(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.debug(args[0] as object, msg);
    else this.logger.debug(msg);
  }

  info(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.info(args[0] as object, msg);
    else this.logger.info(msg);
  }

  warn(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.warn(args[0] as object, msg);
    else this.logger.warn(msg);
  }

  error(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.error(args[0] as object, msg);
    else this.logger.error(msg);
  }

  fatal(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.fatal(args[0] as object, msg);
    else this.logger.fatal(msg);
  }

  child(bindings: Record<string, unknown>): ILogger {
    const childLogger = this.logger.child(bindings as Record<string, any>);
    return new PinoLoggerChild(childLogger);
  }
}

class PinoLoggerChild implements ILogger {
  constructor(private readonly logger: pino.Logger) {}

  trace(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.trace(args[0] as object, msg);
    else this.logger.trace(msg);
  }

  debug(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.debug(args[0] as object, msg);
    else this.logger.debug(msg);
  }

  info(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.info(args[0] as object, msg);
    else this.logger.info(msg);
  }

  warn(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.warn(args[0] as object, msg);
    else this.logger.warn(msg);
  }

  error(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.error(args[0] as object, msg);
    else this.logger.error(msg);
  }

  fatal(msg: string, ...args: unknown[]): void {
    if (args.length > 0) this.logger.fatal(args[0] as object, msg);
    else this.logger.fatal(msg);
  }

  child(bindings: Record<string, unknown>): ILogger {
    return new PinoLoggerChild(this.logger.child(bindings as Record<string, any>));
  }
}
