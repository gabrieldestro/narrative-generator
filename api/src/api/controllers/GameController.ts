import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { GameState, PlayerActionPayload } from '../../domain/types.js';
import type { WorldTemplateRepository } from '../../infrastructure/WorldTemplateRepository.js';
import type { SessionFactory } from '../../application/SessionFactory.js';
import type { GameEngine } from '../../application/GameEngine.js';
import type { LlmService } from '../../application/LlmService.js';
import type { SessionRepository } from '../../infrastructure/SessionRepository.js';
import type { ILogger } from '../../domain/ports.js';
import { ActionBuilderService } from '../../application/ActionBuilderService.js';

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
}

export class GameController {
  private readonly logger: ILogger;

  constructor(
    private readonly worldRepo: WorldTemplateRepository,
    private readonly sessionFactory: SessionFactory,
    private readonly gameEngine: GameEngine,
    private readonly llmService: LlmService,
    private readonly sessionRepo: SessionRepository,
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
    const { mode, templateName, customPrompt } = req.body;
    let state: GameState;

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
      this.logger.info('Jogo criado a partir de template', { templateName: template.name });
    } else if (mode === 'custom' && customPrompt) {
      state = await this.sessionFactory.buildCustomScenario(customPrompt);
      this.logger.info('Jogo criado a partir de cenário customizado');
    } else {
      return reply.status(400).send({
        error: "Parâmetros inválidos. Forneça 'mode': 'template' com 'templateName', ou 'mode': 'custom' com 'customPrompt'."
      });
    }

    // Gera a narrativa inicial via LLM
    const initialNarrative = await this.llmService.generateInitialNarrative(state);
    state.history.push(`Narrativa Inicial: ${initialNarrative}`);

    const sessionId = randomUUID();
    this.sessionRepo.saveSession(sessionId, state);

    return reply.status(201).send({
      sessionId,
      initialNarrative,
      state
    });
  }

  public async processTurn(
    req: FastifyRequest<{ Params: { sessionId: string }; Body: PlayerActionPayload }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      this.logger.warn('Sessão não encontrada', { sessionId });
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }

    const payload = req.body;
    if (!payload || !payload.playerText) {
      return reply.status(400).send({ error: "O campo 'playerText' é obrigatório no corpo da requisição." });
    }

    const reqLog = this.logger.child({ sessionId, turnNumber: state.turnNumber });
    reqLog.info('processTurn chamado');

    // Enriquece a ação do jogador usando o ActionBuilderService
    const enrichedAction = ActionBuilderService.buildActionString(payload);

    // Identifica o personagem do jogador (primeiro personagem isPlayer ativo)
    const playerChar = state.characters.find((c: { isPlayer: boolean; status?: string }) => c.isPlayer && (!c.status || c.status === 'active'));
    const charName = payload.characterName || (playerChar ? playerChar.name : 'Jogador');

    const playerActionsMap = new Map<string, string>();
    playerActionsMap.set(charName, enrichedAction);

    // Executa o turno narrativo no engine
    const turnStart = Date.now();
    const turnResult = await this.gameEngine.processTurn(state, playerActionsMap);
    reqLog.info('processTurn concluído', { durationMs: Date.now() - turnStart });

    // Atualiza o repositório de sessões
    this.sessionRepo.saveSession(sessionId, turnResult.state);

    return reply.status(200).send({
      sessionId,
      narrative: turnResult.narrative,
      logicalResolution: turnResult.logicalResolution,
      updatedState: turnResult.state
    });
  }

  public async processTurnStream(
    req: FastifyRequest<{ Params: { sessionId: string }; Body: PlayerActionPayload }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      this.logger.warn('Sessão não encontrada', { sessionId });
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }

    const payload = req.body;
    if (!payload || !payload.playerText) {
      return reply.status(400).send({ error: "O campo 'playerText' é obrigatório no corpo da requisição." });
    }

    const reqLog = this.logger.child({ sessionId, turnNumber: state.turnNumber });
    reqLog.info('processTurnStream iniciado');

    // Define cabeçalhos de resposta para Server-Sent Events (SSE)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendSseEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const enrichedAction = ActionBuilderService.buildActionString(payload);
    const playerChar = state.characters.find((c: { isPlayer: boolean; status?: string }) => c.isPlayer && (!c.status || c.status === 'active'));
    const charName = payload.characterName || (playerChar ? playerChar.name : 'Jogador');

    const playerActionsMap = new Map<string, string>();
    playerActionsMap.set(charName, enrichedAction);

    sendSseEvent('start', { message: 'Iniciando processamento do turno...' });

    const turnStart = Date.now();
    const turnResult = await this.gameEngine.processTurn(state, playerActionsMap, (token: string) => {
      sendSseEvent('token', { token });
    });
    reqLog.info('processTurnStream concluído', { durationMs: Date.now() - turnStart });

    this.sessionRepo.saveSession(sessionId, turnResult.state);

    sendSseEvent('done', {
      sessionId,
      narrative: turnResult.narrative,
      logicalResolution: turnResult.logicalResolution,
      updatedState: turnResult.state
    });

    reply.raw.end();
  }

  public async getGameState(
    req: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      this.logger.warn('Sessão não encontrada para getGameState', { sessionId });
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }

    return reply.status(200).send({
      sessionId,
      state
    });
  }
}
