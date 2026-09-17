import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { GameState, GameSettings } from '../../domain/types.js';
import type { WorldTemplate } from '../../domain/types.js';
import type { WorldTemplateRepository } from '../../infrastructure/persistence/WorldTemplateRepository.js';
import type { SessionFactory } from '../../application/session/SessionFactory.js';
import type { GameService } from '../../application/session/GameService.js';
import type { LlmService } from '../../application/shared/LlmService.js';
import type { WorldService } from '../../application/world/WorldService.js';
import type { SessionRepository } from '../../infrastructure/persistence/SessionRepository.js';
import type { CheckpointService } from '../../application/session/CheckpointService.js';
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

export interface CreateGameRequestBody {
  mode: 'template' | 'custom';
  templateName?: string;
  customPrompt?: string;
  world?: WorldTemplate;          // novo: cenário estruturado (custom mode)
  settings?: Partial<GameSettings>;
}

/** Mundos + criação de jogo — tela "Nova Aventura" (front: new-game, world-list, custom-scenario). */
export class SetupController {
  private readonly logger: ILogger;

  constructor(
    private readonly worldRepo: WorldTemplateRepository,
    private readonly sessionFactory: SessionFactory,
    private readonly gameService: GameService,
    private readonly llmService: LlmService,
    private readonly worldService: WorldService,
    private readonly sessionRepo: SessionRepository,
    private readonly checkpoints: CheckpointService,
    logger?: ILogger,
  ) {
    this.logger = logger ?? new NullLogger();
  }

  public async listWorlds(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const templates = await this.worldRepo.listAll();
    this.logger.debug('Listando mundos', { count: templates.length });
    return reply.status(200).send(templates);
  }

  public async createGame(
    req: FastifyRequest<{ Body: CreateGameRequestBody }>,
    reply: FastifyReply
  ): Promise<void> {
    const { mode, templateName, customPrompt, world, settings } = req.body;
    let state: GameState;
    let title = '';

    if (settings) {
      this.gameService.updateSettings(settings);
    }

    if (mode === 'template' && templateName) {
      const templates = await this.worldRepo.listAll();
      const searchName = templateName.toLowerCase().replace(/\.json$/, '');
      const template = templates.find(t =>
        (t.id && t.id.toLowerCase() === searchName) ||
        t.name.toLowerCase() === templateName.toLowerCase() ||
        t.name.toLowerCase().includes(searchName)
      );
      if (!template) {
        this.logger.warn('Template não encontrado', { templateName });
        return reply.status(404).send({ error: `Template '${templateName}' não encontrado.` });
      }
      state = this.sessionFactory.buildFromTemplate(template);
      title = template.name;
      this.logger.info('Jogo criado a partir de template', { templateName: template.name });
    } else if (mode === 'custom' && world) {
      state = this.sessionFactory.buildFromCustomWorld(world);
      title = world.name || state.narrativeStyle;
      this.logger.info('Jogo criado a partir de cenário customizado estruturado', { name: world.name });
    } else if (mode === 'custom' && customPrompt) {
      state = await this.sessionFactory.buildCustomScenario(customPrompt);
      title = state.narrativeStyle;
      this.logger.info('Jogo criado a partir de cenário customizado (prompt legado)');
    } else {
      return reply.status(400).send({
        error: "Parâmetros inválidos. Forneça 'mode': 'template' com 'templateName', ou 'mode': 'custom' com 'world' ou 'customPrompt'."
      });
    }

    // Gera a narrativa inicial via LLM
    const initialNarrative = await this.llmService.generateInitialNarrative(state);
    state.history.push(`Narrativa Inicial: ${initialNarrative}`);

    // Extrai localizações da narrativa inicial para o mapa
    const stateWithUpdates = await this.worldService.applyAutomaticStateUpdates(state, initialNarrative);
    if (stateWithUpdates.locations !== undefined) {
      state.locations = stateWithUpdates.locations;
    }
    state.characters = stateWithUpdates.characters;

    const sessionId = randomUUID();
    this.sessionRepo.saveSession(sessionId, state);
    await this.checkpoints.persistCheckpoint(null, sessionId, state, { mode: req.body.mode, title, rootId: sessionId, branchId: 0, depth: 1 });

    return reply.status(201).send({
      sessionId,
      initialNarrative,
      state
    });
  }
}
