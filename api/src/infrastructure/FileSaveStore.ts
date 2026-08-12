import * as fs from 'fs/promises';
import * as path from 'path';
import type { SessionBundle } from '../domain/types.js';
import { SAVE_SCHEMA_VERSION } from '../domain/types.js';
import type { ILogger } from '../domain/ports.js';

export interface ISaveStore {
  list(): Promise<SessionBundle[]>;
  get(id: string): Promise<SessionBundle | null>;
  save(bundle: SessionBundle): Promise<void>;
  delete(id: string): Promise<void>;
}

class NullSaveLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

// Repositório de saves em disco (1 arquivo JSON por partida: api/saves/<sessionId>.json).
// Escrita atômica (temp + rename) para não corromper o save se o processo cair no meio.
export class FileSaveStore implements ISaveStore {
  private readonly dir: string;
  private readonly logger: ILogger;

  constructor(dir: string = path.join(process.cwd(), 'saves'), logger?: ILogger) {
    this.dir = dir;
    this.logger = logger ?? new NullSaveLogger();
  }

  private filePath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  public async list(): Promise<SessionBundle[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.dir);
    const bundles: SessionBundle[] = [];

    for (const file of files) {
      if (!file.endsWith('.json') || file.endsWith('.tmp.json')) {
        continue;
      }
      const bundle = await this.readBundle(path.join(this.dir, file));
      if (bundle) {
        bundles.push(this.migrate(bundle));
      }
    }
    return bundles;
  }

  public async get(id: string): Promise<SessionBundle | null> {
    const bundle = await this.readBundle(this.filePath(id));
    return bundle ? this.migrate(bundle) : null;
  }

  public async save(bundle: SessionBundle): Promise<void> {
    await this.ensureDir();
    const finalPath = this.filePath(bundle.id);
    const tempPath = `${finalPath}.tmp`;
    const data = JSON.stringify(bundle, null, 2);
    await fs.writeFile(tempPath, data, 'utf-8');
    await fs.rename(tempPath, finalPath);
  }

  public async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(id));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Falha ao apagar save', { id, error: String((error as Error)?.message ?? error) });
        throw error;
      }
    }
  }

  // Migração de versão: bundles antigos (sem schemaVersion) são tratados como v1.
  // Nunca destrói dados — preserva campos desconhecidos ao re-gravar.
  public migrate(bundle: SessionBundle): SessionBundle {
    const raw = bundle as SessionBundle & { schemaVersion?: number };
    const schemaVersion = raw.schemaVersion ?? 1;
    if (schemaVersion !== SAVE_SCHEMA_VERSION) {
      this.logger.warn('schemaVersion desconhecido, tratando como v1', { id: bundle.id, schemaVersion });
    }
    return { ...bundle, schemaVersion: SAVE_SCHEMA_VERSION };
  }

  private async readBundle(filePath: string): Promise<SessionBundle | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as SessionBundle;
    } catch (error: unknown) {
      this.logger.warn('Arquivo de save corrompido ou ilegível; ignorando', {
        filePath,
        error: String((error as Error)?.message ?? error),
      });
      return null;
    }
  }
}