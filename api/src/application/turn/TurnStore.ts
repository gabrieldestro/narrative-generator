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

export interface ReactedEntry {
  who: string;
  action: string;
  reasoning: string;
  channel: Exclude<GateChannel, 'none'>;
}

export interface IgnoredEntry {
  ignored: true;
  who: string;
}

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
  /**
   * F1 (doc 31): slots reservados de forma síncrona (índice = cursor no
   * momento do claim, antes de qualquer `await`). `null` = claim ainda não
   * resolvido. `reacted`/`ignored`/`priorLines` são reconstruídos a partir
   * daqui em ordem de slot — a ordem do array não depende da ordem de
   * resolução dos `await`s.
   */
  reactionSlots?: (ReactedEntry | IgnoredEntry | null)[];
  /** Claims reservados ainda não resolvidos (paralelos em voo). */
  pendingReactions?: number;
  /** F1: `finish` em voo (reivindicado antes dos `await`s do commit). */
  committing?: boolean;
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
  /**
   * F1 (doc 31, R6): sessões com `beginTurn` em voo (entre a marcação
   * síncrona na entrada e o `turnStore.begin`). Limpo em `finally` —
   * nunca bloqueia ou enfileira, só falha rápido com TURN_IN_PROGRESS.
   */
  private readonly starting = new Set<string>();

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
    if (turn.status !== 'open') return turn; // idempotente: 2º finish não re-aplica
    turn.status = 'finished';
    turn.committing = false;
    if (this.openBySession.get(turn.sessionId) === turnId) {
      this.openBySession.delete(turn.sessionId);
    }
    return turn;
  }

  cancel(turnId: string): ActiveTurn | undefined {
    const turn = this.turns.get(turnId);
    if (!turn) return undefined;
    if (turn.status !== 'open') return turn; // idempotente
    turn.status = 'cancelled';
    turn.committing = false;
    this.starting.delete(turn.sessionId);
    if (this.openBySession.get(turn.sessionId) === turnId) {
      this.openBySession.delete(turn.sessionId);
    }
    return turn;
  }

  /**
   * F1 (doc 31, R4): reivindica o próximo reator de forma síncrona —
   * ler `allowed[cursor]` + `cursor++` + `pendingReactions++` acontecem
   * antes de qualquer `await`, logo nenhum outro request intercala no meio
   * (event loop do Node). O 2º `react` concorrente já enxerga o cursor
   * avançado e recebe o próximo reator (ou `NO_PENDING_REACTIONS`).
   */
  tryClaimReaction(turnId: string, sessionId: string): { turn: ActiveTurn; ruling: AllowedRuling; index: number } {
    const turn = this.requireOpen(turnId, sessionId);
    if (turn.phase !== 'awaiting_reactions') {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' não aguarda reações (fase: ${turn.phase}).`, turnId);
    }
    const ruling = turn.allowed[turn.reactionCursor];
    if (!ruling) {
      throw new TurnError('NO_PENDING_REACTIONS', `Turno '${turnId}' sem reações pendentes.`, turnId);
    }
    const index = turn.reactionCursor;
    turn.reactionCursor++;
    turn.pendingReactions = (turn.pendingReactions ?? 0) + 1;
    if (!turn.reactionSlots || turn.reactionSlots.length !== turn.allowed.length) {
      turn.reactionSlots = new Array(turn.allowed.length).fill(null);
    }
    return { turn, ruling, index };
  }

  /**
   * F1 (doc 31, R5): reivindica o commit de forma síncrona, antes dos
   * `await`s de `commitTurn`/pós-processamento. O 2º `finish` concorrente
   * recebe `OUT_OF_ORDER` imediato — sem duplo commit, sem espera.
   */
  tryClaimCommit(turnId: string, sessionId: string): ActiveTurn {
    const turn = this.requireOpen(turnId, sessionId);
    if (turn.phase !== 'awaiting_finish' || !turn.resolution || turn.narration === undefined) {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' não está pronto para commit (fase: ${turn.phase}).`, turnId);
    }
    if (turn.committing) {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' já está em commit.`, turnId);
    }
    turn.committing = true;
    return turn;
  }

  /** Libera o claim de commit após falha (sucesso limpa via `finish`). */
  clearCommit(turnId: string): void {
    const turn = this.turns.get(turnId);
    if (turn) turn.committing = false;
  }

  /**
   * F1 (doc 31, R6): marca `beginTurn` em voo para a sessão. Chamar na
   * entrada (antes dos LLMs); limpar em `finally`. O 2º `start`
   * concorrente falha rápido sem gastar chamadas LLM.
   */
  tryMarkStarting(sessionId: string): void {
    if (this.starting.has(sessionId)) {
      throw new TurnError(
        'TURN_IN_PROGRESS',
        `Sessão '${sessionId}' já está iniciando um turno.`,
        this.openBySession.get(sessionId),
      );
    }
    this.starting.add(sessionId);
  }

  clearStarting(sessionId: string): void {
    this.starting.delete(sessionId);
  }
}
