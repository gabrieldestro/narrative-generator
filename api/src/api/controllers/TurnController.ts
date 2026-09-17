import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { PlayerActionPayload } from '../../domain/types.js';
import type { GameService } from '../../application/session/GameService.js';
import type { SessionRepository } from '../../infrastructure/persistence/SessionRepository.js';
import type { CheckpointService } from '../../application/session/CheckpointService.js';
import type { ILogger } from '../../domain/ports.js';
import { ActionBuilderService } from '../../application/turn/ActionBuilderService.js';

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

/** Turno + narração (turn/observe/narrate/state) — tela de jogo (front: game, action-input, guard). */
export class TurnController {
  private readonly logger: ILogger;

  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly gameService: GameService,
    private readonly checkpoints: CheckpointService,
    logger?: ILogger,
  ) {
    this.logger = logger ?? new NullLogger();
  }

  public async processTurn(
    req: FastifyRequest<{ Params: { sessionId: string }; Body: PlayerActionPayload }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);

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
      this.gameService.updateSettings(payload.settings);
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
    const turnResult = await this.gameService.processTurn(state, playerActionsMap);
    reqLog.info('processTurn concluído', { durationMs: Date.now() - turnStart });

    // Gera novo checkpoint imutável
    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, turnResult.state);
    await this.checkpoints.persistCheckpoint(sessionId, newCheckpointId, turnResult.state);

    return reply.status(200).send({
      sessionId: newCheckpointId,
      narrative: turnResult.narrative,
      logicalResolution: turnResult.logicalResolution,
      npcDecisions: turnResult.npcDecisions,
      diceRolls: turnResult.diceRolls,
      // Fila + trace do turno.
      ...(turnResult.npcOrder !== undefined ? { npcOrder: turnResult.npcOrder } : {}),
      ...(turnResult.stepTrace !== undefined ? { stepTrace: turnResult.stepTrace } : {}),
      updatedState: turnResult.state
    });
  }

  public async observe(
    req: FastifyRequest<{ Params: { sessionId: string }; Body: PlayerActionPayload }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);

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
      this.gameService.updateSettings(payload.settings);
    }

    // Identifica o personagem do jogador (primeiro personagem isPlayer ativo)
    const playerChar = state.characters.find((c: { isPlayer: boolean; status?: string }) => c.isPlayer && (!c.status || c.status === 'active'));
    const charName = payload.characterName || (playerChar ? playerChar.name : 'Jogador');

    // Gera a observação detalhada via LLM (não avança a história nem o turno)
    const observeStart = Date.now();
    const observation = await this.gameService.recordObservation(state, payload.playerText, charName);
    reqLog.info('observe concluído', { durationMs: Date.now() - observeStart });

    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, state);
    await this.checkpoints.persistCheckpoint(sessionId, newCheckpointId, state);

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
    const state = await this.checkpoints.resolveSession(sessionId);

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
      this.gameService.updateSettings(payload.settings);
    }

    // Identifica o personagem do jogador (primeiro personagem isPlayer ativo)
    const playerChar = state.characters.find((c: { isPlayer: boolean; status?: string }) => c.isPlayer && (!c.status || c.status === 'active'));
    const charName = payload.characterName || (playerChar ? playerChar.name : 'Jogador');

    // Gera a narração respeitando a declaração do jogador e resolve o estado do mundo
    // (bypassa árbitro, NPCs e dados, e não avança o turno)
    const narrateStart = Date.now();
    const narration = await this.gameService.recordPlayerNarration(state, payload.playerText, charName);
    reqLog.info('narrate concluído', { durationMs: Date.now() - narrateStart });

    const newCheckpointId = randomUUID();
    this.sessionRepo.saveSession(newCheckpointId, state);
    await this.checkpoints.persistCheckpoint(sessionId, newCheckpointId, state);

    return reply.status(200).send({
      sessionId: newCheckpointId,
      narration,
      updatedState: state
    });
  }

  public async getGameState(
    req: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);

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
