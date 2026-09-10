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
import { FileSaveStore, calculateNextBranchId } from '../../infrastructure/FileSaveStore.js';
import type { ILogger } from '../../domain/ports.js';
import type { WorldTemplate } from '../../domain/types.js';
import { ActionBuilderService } from '../../application/ActionBuilderService.js';
import { AdminCommandService } from '../../application/AdminCommandService.js';

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

export class GameController {
  private readonly logger: ILogger;
  private readonly adminCommandService: AdminCommandService;

  constructor(
    private readonly worldRepo: WorldTemplateRepository,
    private readonly sessionFactory: SessionFactory,
    private readonly gameEngine: GameEngine,
    private readonly llmService: LlmService,
    private readonly gameManagementService: GameManagementService,
    private readonly sessionRepo: SessionRepository,
    private readonly saveStore: FileSaveStore,
    logger?: ILogger,
    adminCommandService?: AdminCommandService,
  ) {
    this.logger = logger ?? new NullLogger();
    this.adminCommandService = adminCommandService ?? new AdminCommandService(this.gameManagementService, this.llmService, this.logger);
  }

  // Cria e persiste um novo checkpoint de save no disco.
  private async persistCheckpoint(
    parentId: string | null,
    checkpointId: string,
    state: GameState,
    meta: {
      mode?: 'template' | 'custom';
      title?: string;
      rootId?: string;
      branchId?: number;
      depth?: number;
      branchLabel?: string;
    } = {},
  ): Promise<SessionBundle> {
    const now = new Date().toISOString();
    const playerChar = state.characters.find((c) => c.isPlayer && (!c.status || c.status === 'active'));
    let rootId = meta.rootId;
    let branchId = meta.branchId;
    let depth = meta.depth;
    let mode = meta.mode;
    let title = meta.title;

    if (parentId) {
      const parent = await this.saveStore.get(parentId);
      if (parent) {
        rootId = rootId ?? parent.rootId ?? parent.id;
        mode = mode ?? parent.mode;
        title = title ?? parent.title;
        depth = depth ?? ((parent.depth ?? parent.turnNumber ?? 1) + 1);
        if (branchId === undefined) {
          const allBundles = await this.saveStore.list();
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
      branchLabel: meta.branchLabel,
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

    await this.saveStore.save(bundle);
    return bundle;
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
    const stateWithUpdates = await this.gameManagementService.applyAutomaticStateUpdates(state, initialNarrative);
    if (stateWithUpdates.locations !== undefined) {
      state.locations = stateWithUpdates.locations;
    }
    state.characters = stateWithUpdates.characters;

    const sessionId = randomUUID();
    this.sessionRepo.saveSession(sessionId, state);
    await this.persistCheckpoint(null, sessionId, state, { mode: req.body.mode, title, rootId: sessionId, branchId: 0, depth: 1 });

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
    let state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      const parentBundle = await this.saveStore.get(sessionId);
      if (parentBundle) {
        state = parentBundle.state;
        this.sessionRepo.saveSession(sessionId, state);
      }
    }

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

    // Gera novo checkpoint imutável
    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, turnResult.state);
    await this.persistCheckpoint(sessionId, newCheckpointId, turnResult.state);

    return reply.status(200).send({
      sessionId: newCheckpointId,
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
    let state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      const parentBundle = await this.saveStore.get(sessionId);
      if (parentBundle) {
        state = parentBundle.state;
        this.sessionRepo.saveSession(sessionId, state);
      }
    }

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

    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, turnResult.state);
    await this.persistCheckpoint(sessionId, newCheckpointId, turnResult.state);

    sendSseEvent('done', {
      sessionId: newCheckpointId,
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
    let state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      const parentBundle = await this.saveStore.get(sessionId);
      if (parentBundle) {
        state = parentBundle.state;
        this.sessionRepo.saveSession(sessionId, state);
      }
    }

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

    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, state);
    await this.persistCheckpoint(sessionId, newCheckpointId, state);

    return reply.status(200).send({
      sessionId: newCheckpointId,
      observation,
      updatedState: state
    });
  }

  public async narrate(
    req: FastifyRequest<{ Params: { sessionId: string }; Body: PlayerActionPayload }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    let state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      const parentBundle = await this.saveStore.get(sessionId);
      if (parentBundle) {
        state = parentBundle.state;
        this.sessionRepo.saveSession(sessionId, state);
      }
    }

    if (!state) {
      this.logger.warn('Sessão não encontrada', { sessionId });
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }

    const payload = req.body;
    if (!payload || !payload.playerText) {
      return reply.status(400).send({ error: "O campo 'playerText' é obrigatório no corpo da requisição." });
    }

    const reqLog = this.logger.child({ sessionId, turnNumber: state.turnNumber });
    reqLog.info('narrate chamado');

    if (payload.settings) {
      this.gameEngine.updateSettings(payload.settings);
    }

    // Identifica o personagem do jogador (primeiro personagem isPlayer ativo)
    const playerChar = state.characters.find((c: { isPlayer: boolean; status?: string }) => c.isPlayer && (!c.status || c.status === 'active'));
    const charName = payload.characterName || (playerChar ? playerChar.name : 'Jogador');

    // Gera a narração respeitando a declaração do jogador e resolve o estado do mundo
    // (bypassa árbitro, NPCs e dados, e não avança o turno)
    const narrateStart = Date.now();
    const narration = await this.gameEngine.recordPlayerNarration(state, payload.playerText, charName);
    reqLog.info('narrate concluído', { durationMs: Date.now() - narrateStart });

    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, state);
    await this.persistCheckpoint(sessionId, newCheckpointId, state);

    return reply.status(200).send({
      sessionId: newCheckpointId,
      narration,
      updatedState: state
    });
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
    let state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      const parentBundle = await this.saveStore.get(sessionId);
      if (parentBundle) {
        state = parentBundle.state;
        this.sessionRepo.saveSession(sessionId, state);
      }
    }

    if (!state) {
      this.logger.warn('Sessão não encontrada para executeCommand', { sessionId });
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }

    if (!payload || !payload.command) {
      return reply.status(400).send({ error: "O campo 'command' é obrigatório no corpo da requisição." });
    }

    if (payload.settings) {
      this.gameEngine.updateSettings(payload.settings);
    }

    const reqLog = this.logger.child({ sessionId, command: payload.command });
    reqLog.info('executeCommand chamado');

    const result = await this.adminCommandService.execute(state, {
      command: payload.command,
      args: payload.args,
      fields: payload.fields
    });

    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, result.state);
    await this.persistCheckpoint(sessionId, newCheckpointId, result.state);

    return reply.status(200).send({
      sessionId: newCheckpointId,
      message: result.message,
      updatedState: result.state,
      payload: result.payload
    });
  }

  public async getGameState(
    req: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    let state = this.sessionRepo.getSession(sessionId);

    if (!state) {
      const bundle = await this.saveStore.get(sessionId);
      if (bundle) {
        state = bundle.state;
        this.sessionRepo.saveSession(sessionId, state);
      }
    }

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
