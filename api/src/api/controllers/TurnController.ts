import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { PlayerActionPayload } from '../../domain/types.js';
import type { GameService } from '../../application/session/GameService.js';
import type { SessionRepository } from '../../infrastructure/persistence/SessionRepository.js';
import type { CheckpointService } from '../../application/session/CheckpointService.js';
import type { ILogger } from '../../domain/ports.js';
import { ActionBuilderService } from '../../application/turn/ActionBuilderService.js';
import { TurnError } from '../../application/turn/TurnStore.js';

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

  /**
   * Turno = 1 ação + reações, em fases sequenciais com visual progressivo:
   * `start` (ação+dado+gate) → N× `react` (1 reator) → `arbiter` →
   * `narrate` → `finish` (commit + checkpoint). Ator por rotação automática.
   */

  public async startTurn(
    req: FastifyRequest<{ Params: { sessionId: string }; Body: Partial<PlayerActionPayload> }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);

    if (!state) {
      this.logger.warn('Sessão não encontrada', { sessionId });
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }

    const payload = req.body ?? {};
    const reqLog = this.logger.child({ sessionId, turnNumber: state.turnNumber });
    reqLog.info('startTurn chamado');

    if (payload.settings) {
      this.gameService.updateSettings(payload.settings);
    }

    // Ação do jogador (opcional): presente ⇒ turno do jogador; ausente ⇒
    // próximo da rotação (NPC avança sozinho; jogador na vez ⇒ 409).
    let playerAction: { charName: string; text: string } | null = null;
    if (payload.playerText) {
      const enrichedAction = ActionBuilderService.buildActionString(payload as PlayerActionPayload);
      const playerChar = state.characters.find((c: { isPlayer: boolean; status?: string }) => c.isPlayer && (!c.status || c.status === 'active'));
      const charName = payload.characterName || (playerChar ? playerChar.name : 'Jogador');
      playerAction = { charName, text: enrichedAction };
    }

    try {
      const started = await this.gameService.beginTurn(sessionId, state, playerAction);
      reqLog.info('startTurn concluído', { turnId: started.turnId, actor: started.actor });
      return reply.status(201).send({ sessionId, ...started });
    } catch (err) {
      return this.sendTurnError(reply, err);
    }
  }

  public async reactTurn(
    req: FastifyRequest<{ Params: { sessionId: string; turnId: string }; Body: Partial<{ settings: Partial<PlayerActionPayload['settings']> }> }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId, turnId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);
    if (!state) {
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }
    if (req.body?.settings) {
      this.gameService.updateSettings(req.body.settings);
    }
    try {
      const reaction = await this.gameService.reactNext(turnId, sessionId);
      return reply.status(200).send({ sessionId, ...reaction });
    } catch (err) {
      return this.sendTurnError(reply, err);
    }
  }

  public async arbiterTurn(
    req: FastifyRequest<{ Params: { sessionId: string; turnId: string }; Body: Partial<{ settings: Partial<PlayerActionPayload['settings']> }> }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId, turnId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);
    if (!state) {
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }
    if (req.body?.settings) {
      this.gameService.updateSettings(req.body.settings);
    }
    try {
      const judged = await this.gameService.arbitrateTurn(turnId, sessionId);
      return reply.status(200).send({ sessionId, ...judged });
    } catch (err) {
      return this.sendTurnError(reply, err);
    }
  }

  public async narrateTurn(
    req: FastifyRequest<{ Params: { sessionId: string; turnId: string }; Body: Partial<{ settings: Partial<PlayerActionPayload['settings']> }> }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId, turnId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);
    if (!state) {
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }
    if (req.body?.settings) {
      this.gameService.updateSettings(req.body.settings);
    }
    try {
      const told = await this.gameService.narrateTurn(turnId, sessionId);
      return reply.status(200).send({ sessionId, ...told });
    } catch (err) {
      return this.sendTurnError(reply, err);
    }
  }

  public async finishTurn(
    req: FastifyRequest<{ Params: { sessionId: string; turnId: string }; Body: Partial<{ settings: Partial<PlayerActionPayload['settings']> }> }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId, turnId } = req.params;
    const state = await this.checkpoints.resolveSession(sessionId);
    if (!state) {
      return reply.status(404).send({ error: `Sessão '${sessionId}' não encontrada.` });
    }
    if (req.body?.settings) {
      this.gameService.updateSettings(req.body.settings);
    }
    try {
      const turnResult = await this.gameService.finishTurn(turnId, sessionId);

      // Gera novo checkpoint imutável (só no finish o estado é definitivo)
      const newCheckpointId = randomUUID();
      this.sessionRepo.saveSession(newCheckpointId, turnResult.state);
      await this.checkpoints.persistCheckpoint(sessionId, newCheckpointId, turnResult.state);
      this.gameService.carryRotation(sessionId, newCheckpointId);

      return reply.status(200).send({
        sessionId: newCheckpointId,
        narrative: turnResult.narrative,
        logicalResolution: turnResult.logicalResolution,
        npcDecisions: turnResult.npcDecisions,
        diceRolls: turnResult.diceRolls,
        stepTrace: turnResult.stepTrace,
        nextActor: turnResult.nextActor,
        awaitingPlayer: turnResult.awaitingPlayer,
        updatedState: turnResult.state
      });
    } catch (err) {
      return this.sendTurnError(reply, err);
    }
  }

  public async turnStatus(
    req: FastifyRequest<{ Params: { sessionId: string; turnId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId, turnId } = req.params;
    try {
      const status = this.gameService.getTurnStatus(turnId, sessionId);
      return reply.status(200).send({ sessionId, ...status });
    } catch (err) {
      return this.sendTurnError(reply, err);
    }
  }

  public async cancelTurn(
    req: FastifyRequest<{ Params: { sessionId: string; turnId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId, turnId } = req.params;
    try {
      this.gameService.cancelTurn(turnId, sessionId);
      return reply.status(200).send({ sessionId, turnId, cancelled: true });
    } catch (err) {
      return this.sendTurnError(reply, err);
    }
  }

  private async sendTurnError(reply: FastifyReply, err: unknown): Promise<void> {
    if (err instanceof TurnError) {
      const status =
        err.code === 'TURN_NOT_FOUND' ? 404 :
        err.code === 'SESSION_MISMATCH' ? 400 : 409;
      return reply.status(status).send({
        error: err.message,
        code: err.code,
        ...(err.turnId !== undefined ? { turnId: err.turnId } : {}),
        ...(err.meta !== undefined ? err.meta : {}),
      });
    }
    throw err;
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
    this.gameService.carryRotation(sessionId, newCheckpointId);

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
    this.gameService.carryRotation(sessionId, newCheckpointId);

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
