import type { FastifyRequest, FastifyReply } from 'fastify';
import type { WorldTemplate } from '../../domain/types.js';
import type { LlmService } from '../../application/LlmService.js';
import { EnrichService } from '../../application/EnrichService.js';
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

export interface EnrichRequestBody {
  field: string;
  value: string;
  context?: Partial<WorldTemplate>;
}

export class EnrichController {
  private readonly enrichService: EnrichService;
  private readonly logger: ILogger;

  constructor(llmService: LlmService, logger?: ILogger) {
    this.enrichService = new EnrichService(llmService);
    this.logger = logger ?? new NullLogger();
  }

  public async enrich(
    req: FastifyRequest<{ Body: EnrichRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { field, value, context } = req.body ?? ({} as EnrichRequestBody);

    if (!field || typeof value !== 'string') {
      return reply.status(400).send({ error: "Os campos 'field' e 'value' são obrigatórios." });
    }

    try {
      const enriched = await this.enrichService.enrichField(field, value, context ?? {});
      return reply.status(200).send({ enriched });
    } catch (err) {
      this.logger.error('[Enrich] falha ao enriquecer campo', err instanceof Error ? err : new Error(String(err)));
      // Em caso de erro (timeout, rate limit), devolve o valor original para não quebrar o fluxo do usuário.
      return reply.status(200).send({ enriched: value });
    }
  }
}
