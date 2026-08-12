import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { GameState, GameSettings, PlayerActionPayload, NpcDecision, DiceRoll, SessionBundle } from '../../domain/types.js';
import { SAVE_SCHEMA_VERSION } from '../../domain/types.js';
import type { WorldTemplateRepository } from '../../infrastructure/WorldTemplateRepository.js';
import type { SessionFactory } from '../../application/SessionFactory.js';
import type { GameEngine } from '../../application/GameEngine.js';
import type { LlmService } from '../../application/LlmService.js';
import type { GameManagementService } from '../../application/GameManagementService.js';
import type { SessionRepository } from '../../infrastructure/SessionRepository.js';
import type { FileSaveStore } from '../../infrastructure/FileSaveStore.js';
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
  settings?: Partial<GameSettings>;
}

export class GameController {
  private readonly logger: ILogger;

  constructor(
    private readonly worldRepo: WorldTemplateRepository,
    private readonly sessionFactory: SessionFactory,
    private readonly gameEngine: GameEngine,
    private readonly llmService: LlmService,
    private readonly gameManagementService: GameManagementService,
    private readonly sessionRepo: SessionRepository,
    private readonly saveStore: FileSaveStore,
    logger?: ILogger,
  ) {
    this.logger = logger ?? new NullLogger();
  }

  // Monta/atualiza o bundle de save e grava no disco (auto-save).
  private async persistBundle(
    sessionId: string,
    state: GameState,
    meta: { mode?: 'template' | 'custom'; title?: string } = {},
  ): Promise<void> {
    const existing = await this.saveStore.get(sessionId);
    const now = new Date().toISOString();
    const playerChar = state.characters.find((c) => c.isPlayer && (!c.status || c.status === 'active'));
    const bundle: SessionBundle = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      id: sessionId,
      mode: meta.mode ?? existing?.mode ?? 'custom',
      title: meta.title ?? existing?.title ?? state.narrativeStyle,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      narrativeStyle: state.narrativeStyle,
      writingStyle: state.writingStyle,
      turnNumber: state.turnNumber,
      playerCharacterName: playerChar?.name ?? 'Jogador',
      lastNarrative: state.history.length > 0 ? state.history[state.history.length - 1]! : '',
      state,
    };
    await this.saveStore.save(bundle);
  }

  public async listSaves(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const bundles = await this.saveStore.list();
    this.logger.debug('Listando partidas salvas', { count: bundles.length });
    return reply.status(200).send(bundles);
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

  public async listWorlds(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const templates = await this.worldRepo.listAll();
    this.logger.debug('Listando mundos', { count: templates.length });
    return reply.status(200).send(templates);
  }

  public async createGame(
    req: FastifyRequest<{ Body: CreateGameRequestBody }>,
    reply: FastifyReply
  ): Promise<void> {
    const { mode, templateName, customPrompt, settings } = req.body;
    let state: GameState;
    let title = '';

    if (settings) {
      this.gameEngine.updateSettings(settings);
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
    } else if (mode === 'custom' && customPrompt) {
      state = await this.sessionFactory.buildCustomScenario(customPrompt);
      title = state.narrativeStyle;
      this.logger.info('Jogo criado a partir de cenário customizado');
    } else {
      return reply.status(400).send({
        error: "Parâmetros inválidos. Forneça 'mode': 'template' com 'templateName', ou 'mode': 'custom' com 'customPrompt'."
      });
    }

    // Gera a narrativa inicial via LLM
    const initialNarrative = await this.llmService.generateInitialNarrative(state);
    state.history.push(`Narrativa Inicial: ${initialNarrative}`);

    // Extrai localizações da narrativa inicial para o mapa
    const stateWithUpdates = await this.gameManagementService.applyAutomaticStateUpdates(state, initialNarrative);
    if (stateWithUpdates.locations !== undefined) {
      state.locations = stateWithUpdates.locations;
    }
    state.characters = stateWithUpdates.characters;

    const sessionId = randomUUID();
    this.sessionRepo.saveSession(sessionId, state);
    await this.persistBundle(sessionId, state, { mode: req.body.mode, title });

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

    if (payload.settings) {
      this.gameEngine.updateSettings(payload.settings);
    }

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
    await this.persistBundle(sessionId, turnResult.state);

    return reply.status(200).send({
      sessionId,
      narrative: turnResult.narrative,
      logicalResolution: turnResult.logicalResolution,
      npcDecisions: turnResult.npcDecisions,
      diceRolls: turnResult.diceRolls,
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

    if (payload.settings) {
      this.gameEngine.updateSettings(payload.settings);
    }

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
    await this.persistBundle(sessionId, turnResult.state);

    sendSseEvent('done', {
      sessionId,
      narrative: turnResult.narrative,
      logicalResolution: turnResult.logicalResolution,
      updatedState: turnResult.state
    });

    reply.raw.end();
  }

  public async observe(
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
    reqLog.info('observe chamado');

    if (payload.settings) {
      this.gameEngine.updateSettings(payload.settings);
    }

    // Identifica o personagem do jogador (primeiro personagem isPlayer ativo)
    const playerChar = state.characters.find((c: { isPlayer: boolean; status?: string }) => c.isPlayer && (!c.status || c.status === 'active'));
    const charName = payload.characterName || (playerChar ? playerChar.name : 'Jogador');

    // Gera a observação detalhada via LLM (não avança a história nem o turno)
    const observeStart = Date.now();
    const observation = await this.gameEngine.recordObservation(state, payload.playerText, charName);
    reqLog.info('observe concluído', { durationMs: Date.now() - observeStart });

    this.sessionRepo.saveSession(sessionId, state);
    await this.persistBundle(sessionId, state);

    return reply.status(200).send({
      sessionId,
      observation,
      updatedState: state
    });
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
