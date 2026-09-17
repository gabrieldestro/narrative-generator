import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { GameSettings } from '../../domain/types.js';
import type { GameService } from '../../application/session/GameService.js';
import type { SessionRepository } from '../../infrastructure/persistence/SessionRepository.js';
import type { CheckpointService } from '../../application/session/CheckpointService.js';
import type { ILogger } from '../../domain/ports.js';
import { AdminCommandService } from '../../application/admin/AdminCommandService.js';

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

/** Comandos administrativos (itens, personagens, locais, conceitos, extrações) — front: admin-command-dialog. */
export class AdminController {
  private readonly logger: ILogger;

  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly GameService: GameService,
    private readonly adminCommandService: AdminCommandService,
    private readonly checkpoints: CheckpointService,
    logger?: ILogger,
  ) {
    this.logger = logger ?? new NullLogger();
  }

  public async executeCommand(
    req: FastifyRequest<{
      Params: { sessionId: string };
      Body: {
        command: string;
        args?: string[];
        fields?: Record<string, unknown>;
        settings?: Partial<GameSettings>;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const payload = req.body;
    const state = await this.checkpoints.resolveSession(sessionId);

    if (!state) {
      this.logger.warn('Sessão não encontrada para executeCommand', { sessionId });
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }

    if (!payload || !payload.command) {
      return reply.status(400).send({ error: "O campo 'command' é obrigatório no corpo da requisição." });
    }

    if (payload.settings) {
      this.GameService.updateSettings(payload.settings);
    }

    const reqLog = this.logger.child({ sessionId, command: payload.command });
    reqLog.info('executeCommand chamado');

    const result = await this.adminCommandService.execute(state, {
      command: payload.command,
      ...(payload.args !== undefined ? { args: payload.args } : {}),
      ...(payload.fields !== undefined ? { fields: payload.fields } : {})
    });

    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, result.state);
    await this.checkpoints.persistCheckpoint(sessionId, newCheckpointId, result.state);

    return reply.status(200).send({
      sessionId: newCheckpointId,
      message: result.message,
      updatedState: result.state,
      payload: result.payload
    });
  }
}
