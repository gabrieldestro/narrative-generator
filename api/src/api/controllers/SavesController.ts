import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionRepository } from '../../infrastructure/SessionRepository.js';
import { FileSaveStore } from '../../infrastructure/FileSaveStore.js';
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

/** Partidas salvas / checkpoints — tela "Continuar" e histórico da campanha (front: new-game, history). */
export class SavesController {
  private readonly logger: ILogger;

  constructor(
    private readonly saveStore: FileSaveStore,
    private readonly sessionRepo: SessionRepository,
    logger?: ILogger,
  ) {
    this.logger = logger ?? new NullLogger();
  }

  public async listSaves(
    req: FastifyRequest<{ Querystring: { all?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const showAll = req.query?.all === 'true' || req.query?.all === '1';
    if (showAll) {
      const bundles = await this.saveStore.list();
      this.logger.debug('Listando todos os checkpoints salvos', { count: bundles.length });
      return reply.status(200).send(bundles);
    }
    const summaries = await this.saveStore.listLatestPerRoot();
    this.logger.debug('Listando partidas salvas (latest por campanha)', { count: summaries.length });
    return reply.status(200).send(summaries);
  }

  public async listHistory(
    req: FastifyRequest<{ Params: { rootId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { rootId } = req.params;
    const history = await this.saveStore.listByRootId(rootId);
    this.logger.debug('Listando histórico de checkpoints da campanha', { rootId, count: history.length });
    return reply.status(200).send(history);
  }

  public async pruneSaves(
    req: FastifyRequest<{ Body?: { keepLatest?: boolean; rootId?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const options = req.body ?? {};
    const result = await this.saveStore.prune(options);
    this.logger.info('Checkpoints podados', { deleted: result.deleted, kept: result.kept });
    return reply.status(200).send(result);
  }

  public async getSave(
    req: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const bundle = await this.saveStore.get(sessionId);

    if (!bundle) {
      this.logger.warn('Save não encontrado', { sessionId });
      return reply.status(404).send({ error: `Save '${sessionId}' não encontrado.` });
    }

    return reply.status(200).send(bundle);
  }

  public async deleteSave(
    req: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    await this.saveStore.delete(sessionId);
    this.sessionRepo.deleteSession(sessionId);
    this.logger.info('Save apagado', { sessionId });
    return reply.status(204).send();
  }
}
