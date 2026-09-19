import type {
  DiceRoll,
  GameState,
  GateChannel,
  GateRuling,
  StepAction,
  StepResolution,
} from "../../domain/types.js";
import type { AllowedRuling } from "./TurnService.js";

export type ActiveTurnStatus = 'open' | 'finished' | 'cancelled';

/** Fase da saga: cada uma é 1 chamada HTTP (`react` repete por reator). */
export type TurnPhase =
  | 'awaiting_reactions'
  | 'awaiting_arbiter'
  | 'awaiting_narrate'
  | 'awaiting_finish';

/**
 * Turno em andamento (1 ação + reações): cópia de trabalho + acumuladores
 * das fases. Fases 1-4 (`start/react/arbiter/narrate`) só acumulam;
 * o mundo só é mutado no `finish` (commit).
 */
export interface ActiveTurn {
  turnId: string;
  sessionId: string;
  turnNumber: number;
  status: ActiveTurnStatus;
  phase: TurnPhase;
  actorName: string;
  actorWhere: string;
  /** Ação do jogador (enriquecida) — ausente em turno de NPC. */
  playerText?: string | undefined;
  actionText: string;
  actionReasoning: string;
  diceRoll: DiceRoll;
  action: StepAction;
  /** Reatores permitidos já ordenados por stake (fila do `react`). */
  allowed: AllowedRuling[];
  denied: GateRuling[];
  reactionCursor: number;
  reacted: { who: string; action: string; reasoning: string; channel: Exclude<GateChannel, 'none'> }[];
  ignored: string[];
  priorLines: string[];
  resolution?: StepResolution | undefined;
  resolutionLine?: string | undefined;
  narration?: string | undefined;
  unexpectedEvent: boolean;
  sceneDescription?: string | undefined;
  workingState: GameState;
  createdAt: number;
}

export class TurnError extends Error {
  readonly code:
    | 'TURN_NOT_FOUND'
    | 'TURN_IN_PROGRESS'
    | 'OUT_OF_ORDER'
    | 'SESSION_MISMATCH'
    | 'AWAITING_PLAYER'
    | 'NO_PENDING_REACTIONS'
    | 'NO_ACTORS';
  readonly turnId: string | undefined;
  readonly meta: Record<string, unknown> | undefined;

  constructor(
    code: TurnError['code'],
    message: string,
    turnId?: string | undefined,
    meta?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = 'TurnError';
    this.code = code;
    this.turnId = turnId;
    this.meta = meta;
  }
}

/**
 * Saga de turno em memória, sem TTL (decisão explícita): turnos abertos
 * vivem até `finish`/`cancel`; turnos finalizados são mantidos para
 * `status` (sem expiração). Lock: 1 turno aberto por `sessionId`.
 */
export class TurnStore {
  private readonly turns = new Map<string, ActiveTurn>();
  private readonly openBySession = new Map<string, string>();

  begin(turn: ActiveTurn): void {
    const existingId = this.openBySession.get(turn.sessionId);
    if (existingId) {
      const existing = this.turns.get(existingId);
      if (existing && existing.status === 'open') {
        throw new TurnError(
          'TURN_IN_PROGRESS',
          `Sessão '${turn.sessionId}' já possui turno aberto '${existingId}'.`,
          existingId,
        );
      }
    }
    this.turns.set(turn.turnId, turn);
    this.openBySession.set(turn.sessionId, turn.turnId);
  }

  get(turnId: string): ActiveTurn | undefined {
    return this.turns.get(turnId);
  }

  getOpenBySession(sessionId: string): ActiveTurn | undefined {
    const id = this.openBySession.get(sessionId);
    if (!id) return undefined;
    const turn = this.turns.get(id);
    return turn && turn.status === 'open' ? turn : undefined;
  }

  /** Valida pertencimento à sessão + status aberto. */
  requireOpen(turnId: string, sessionId: string): ActiveTurn {
    const turn = this.turns.get(turnId);
    if (!turn) {
      throw new TurnError('TURN_NOT_FOUND', `Turno '${turnId}' não encontrado.`, turnId);
    }
    if (turn.sessionId !== sessionId) {
      throw new TurnError('SESSION_MISMATCH', `Turno '${turnId}' não pertence à sessão.`, turnId);
    }
    if (turn.status !== 'open') {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' já foi encerrado (${turn.status}).`, turnId);
    }
    return turn;
  }

  finish(turnId: string): ActiveTurn | undefined {
    const turn = this.turns.get(turnId);
    if (!turn) return undefined;
    turn.status = 'finished';
    if (this.openBySession.get(turn.sessionId) === turnId) {
      this.openBySession.delete(turn.sessionId);
    }
    return turn;
  }

  cancel(turnId: string): ActiveTurn | undefined {
    const turn = this.turns.get(turnId);
    if (!turn) return undefined;
    turn.status = 'cancelled';
    if (this.openBySession.get(turn.sessionId) === turnId) {
      this.openBySession.delete(turn.sessionId);
    }
    return turn;
  }
}
