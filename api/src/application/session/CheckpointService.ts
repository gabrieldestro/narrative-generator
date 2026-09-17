import type { GameState, SessionBundle } from '../../domain/types.js';
import { SAVE_SCHEMA_VERSION } from '../../domain/types.js';
import type { SessionRepository } from '../../infrastructure/persistence/SessionRepository.js';
import { CheckpointRepository, calculateNextBranchId } from '../../infrastructure/persistence/CheckpointRepository.js';
import type { ILogger } from '../../domain/ports.js';

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export interface CheckpointMeta {
  mode?: 'template' | 'custom';
  title?: string;
  rootId?: string;
  branchId?: number;
  depth?: number;
  branchLabel?: string;
}

/**
 * Checkpoints imutáveis de sessão: resolve (memória → disco) e persiste
 * bundles no `CheckpointRepository`. Compartilhado pelos controllers de turno,
 * setup e admin — cada turno/comando gera um checkpoint filho.
 */
export class CheckpointService {
  private readonly logger: ILogger;

  constructor(
    private readonly checkpointRepo: CheckpointRepository,
    private readonly sessionRepo: SessionRepository,
    logger?: ILogger,
  ) {
    this.logger = logger ?? new NullLogger();
  }

  /** Sessão da memória; se ausente, hidrata do disco e devolve `undefined` se não existir. */
  public async resolveSession(sessionId: string): Promise<GameState | undefined> {
    const cached = this.sessionRepo.getSession(sessionId);
    if (cached) return cached;
    const bundle = await this.checkpointRepo.get(sessionId);
    if (!bundle) return undefined;
    this.sessionRepo.saveSession(sessionId, bundle.state);
    return bundle.state;
  }

  /** Cria e persiste um novo checkpoint de save no disco. */
  public async persistCheckpoint(
    parentId: string | null,
    checkpointId: string,
    state: GameState,
    meta: CheckpointMeta = {},
  ): Promise<SessionBundle> {
    const now = new Date().toISOString();
    const playerChar = state.characters.find((c) => c.isPlayer && (!c.status || c.status === 'active'));
    let rootId = meta.rootId;
    let branchId = meta.branchId;
    let depth = meta.depth;
    let mode = meta.mode;
    let title = meta.title;

    if (parentId) {
      const parent = await this.checkpointRepo.get(parentId);
      if (parent) {
        rootId = rootId ?? parent.rootId ?? parent.id;
        mode = mode ?? parent.mode;
        title = title ?? parent.title;
        depth = depth ?? ((parent.depth ?? parent.turnNumber ?? 1) + 1);
        if (branchId === undefined) {
          const allBundles = await this.checkpointRepo.list();
          branchId = calculateNextBranchId(parent, allBundles);
        }
      }
    }

    rootId = rootId ?? checkpointId;
    branchId = branchId ?? 0;
    depth = depth ?? state.turnNumber ?? 1;
    mode = mode ?? 'custom';
    title = title ?? state.narrativeStyle ?? 'Aventura';

    const bundle: SessionBundle = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      id: checkpointId,
      rootId,
      parentId,
      branchId,
      depth,
      ...(meta.branchLabel !== undefined ? { branchLabel: meta.branchLabel } : {}),
      mode,
      title,
      createdAt: now,
      updatedAt: now,
      narrativeStyle: state.narrativeStyle,
      writingStyle: state.writingStyle,
      turnNumber: state.turnNumber,
      playerCharacterName: playerChar?.name ?? 'Jogador',
      lastNarrative: state.history.length > 0 ? state.history[state.history.length - 1]! : '',
      state,
    };

    await this.checkpointRepo.save(bundle);
    this.logger.debug('Checkpoint persistido', { checkpointId, parentId, turnNumber: state.turnNumber });
    return bundle;
  }
}
