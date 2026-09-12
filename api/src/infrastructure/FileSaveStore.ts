import * as fs from 'fs/promises';
import * as path from 'path';
import type { SessionBundle, SavedGameSummary } from '../domain/types.js';
import { SAVE_SCHEMA_VERSION } from '../domain/types.js';
import type { ILogger } from '../domain/ports.js';

export interface PruneResult {
  deleted: number;
  kept: string | null;
}

export interface ISaveStore {
  list(): Promise<SessionBundle[]>;
  listLatestPerRoot(): Promise<SavedGameSummary[]>;
  listByRootId(rootId: string): Promise<SavedGameSummary[]>;
  get(id: string): Promise<SessionBundle | null>;
  save(bundle: SessionBundle): Promise<void>;
  delete(id: string): Promise<void>;
  prune(options: { keepLatest?: boolean; rootId?: string }): Promise<PruneResult>;
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

export function calculateNextBranchId(parent: SessionBundle, all: SessionBundle[]): number {
  const siblings = all.filter(b => b.parentId === parent.id);
  if (siblings.length === 0) {
    return parent.branchId ?? 0; // continua a mesma linha
  }
  const max = Math.max(...all.map(b => b.branchId ?? 0), 0);
  return max + 1; // novo ramo bifurcado
}

// Repositório de checkpoints de save em disco (1 arquivo JSON por checkpoint: api/saves/<checkpointId>.json).
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

  private sortByUpdatedAtDesc<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
    return items.sort((a, b) => {
      const timeA = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const timeB = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return timeB - timeA;
    });
  }

  private toSummary(bundle: SessionBundle): SavedGameSummary {
    const { state: _state, schemaVersion: _v, ...summary } = bundle;
    return summary;
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
    return this.sortByUpdatedAtDesc(bundles);
  }

  // Retorna apenas 1 checkpoint mais recente por campanha (rootId), ordenado DESC.
  // Payload leve sem GameState.
  public async listLatestPerRoot(): Promise<SavedGameSummary[]> {
    const bundles = await this.list();
    const latestMap = new Map<string, SessionBundle>();

    for (const bundle of bundles) {
      const root = bundle.rootId || bundle.id;
      const current = latestMap.get(root);
      if (!current) {
        latestMap.set(root, bundle);
      } else {
        const timeCurrent = new Date(current.updatedAt ?? current.createdAt ?? 0).getTime();
        const timeBundle = new Date(bundle.updatedAt ?? bundle.createdAt ?? 0).getTime();
        if (timeBundle > timeCurrent) {
          latestMap.set(root, bundle);
        }
      }
    }

    const summaries = Array.from(latestMap.values()).map(b => this.toSummary(b));
    return this.sortByUpdatedAtDesc(summaries);
  }

  // Retorna todos os checkpoints de uma campanha (rootId), ordenados DESC.
  public async listByRootId(rootId: string): Promise<SavedGameSummary[]> {
    const bundles = await this.list();
    const filtered = bundles.filter(b => b.rootId === rootId || b.id === rootId);
    const summaries = filtered.map(b => this.toSummary(b));
    return this.sortByUpdatedAtDesc(summaries);
  }

  public async prune(options: { keepLatest?: boolean; rootId?: string }): Promise<PruneResult> {
    const bundles = await this.list();
    if (bundles.length === 0) {
      return { deleted: 0, kept: null };
    }

    if (options.rootId) {
      const rootBundles = bundles.filter(b => b.rootId === options.rootId || b.id === options.rootId);
      if (rootBundles.length <= 1) {
        return { deleted: 0, kept: rootBundles[0]?.id ?? null };
      }
      // O list() já está ordenado DESC por updatedAt
      const [latest, ...toDelete] = rootBundles;
      let deleted = 0;
      for (const item of toDelete) {
        await this.delete(item.id);
        deleted++;
      }
      this.logger.info('Histórico de campanha podado (prune)', { rootId: options.rootId, deleted, kept: latest!.id });
      return { deleted, kept: latest!.id };
    }

    if (options.keepLatest) {
      if (bundles.length <= 1) {
        return { deleted: 0, kept: bundles[0]?.id ?? null };
      }
      const [latest, ...toDelete] = bundles;
      let deleted = 0;
      for (const item of toDelete) {
        await this.delete(item.id);
        deleted++;
      }
      this.logger.info('Histórico global podado (prune)', { deleted, kept: latest!.id });
      return { deleted, kept: latest!.id };
    }

    return { deleted: 0, kept: bundles[0]?.id ?? null };
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

  // Migração de versão: bundles antigos (sem schemaVersion ou v1/v2) são migrados para v5.
  // Nunca destrói dados — preserva campos desconhecidos ao re-gravar.
  public migrate(bundle: SessionBundle): SessionBundle {
    const raw = bundle as any;
    let schemaVersion = raw.schemaVersion ?? 1;
    let state = { ...bundle.state };

    if (schemaVersion === 1) {
      if (!state.concepts) {
        state.concepts = [];
      }
      schemaVersion = 2;
    }

    if (schemaVersion === 2) {
      // v2 -> v3: metadados de branching (sem mudança no GameState).
      schemaVersion = 3;
    }

    if (schemaVersion === 3) {
      // v3 -> v4 (doc 27, Fase 0): campos opcionais do micro-turno.
      // Nunca destrói: só preenche defaults quando ausentes.
      if (!Array.isArray(state.events)) {
        state.events = [];
      }
      if (typeof state.nextSeq !== 'number') {
        const maxSeq = state.events.reduce(
          (m: number, e: any) => Math.max(m, typeof e?.seq === 'number' ? e.seq : 0),
          0,
        );
        state.nextSeq = maxSeq + 1;
      }
      if (Array.isArray(state.characters)) {
        state.characters = state.characters.map((c: any) => ({
          vitality: 'ileso',
          conditions: [],
          ...c,
        }));
      }
      schemaVersion = 4;
    }

    if (schemaVersion === 4) {
      // v4 -> v5 (doc 27, Fase 4): memória factual da cena.
      // Nunca destrói: só preenche defaults quando ausentes.
      if (state.factSheet === undefined || state.factSheet === null || typeof state.factSheet !== 'object') {
        state.factSheet = { facts: [], threads: [] };
      } else {
        if (!Array.isArray((state.factSheet as any).facts)) {
          (state.factSheet as any).facts = [];
        }
        if (!Array.isArray((state.factSheet as any).threads)) {
          (state.factSheet as any).threads = [];
        }
      }
      schemaVersion = 5;
    }

    const rootId = raw.rootId ?? raw.id;
    const parentId = raw.parentId !== undefined ? raw.parentId : null;
    const branchId = typeof raw.branchId === 'number' ? raw.branchId : 0;
    const depth = typeof raw.depth === 'number' ? raw.depth : (raw.turnNumber ?? state.turnNumber ?? 1);

    if (schemaVersion !== SAVE_SCHEMA_VERSION) {
      this.logger.warn('schemaVersion desconhecido, tratando como v5', { id: bundle.id, schemaVersion });
    }

    return {
      ...bundle,
      schemaVersion: SAVE_SCHEMA_VERSION,
      rootId,
      parentId,
      branchId,
      depth,
      state,
    };
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