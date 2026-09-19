import { Injectable, signal, computed } from '@angular/core';
import type { GameState } from '../models/game-state.model';
import type { Character } from '../models/character.model';
import type { Location } from '../models/location.model';
import type { WorldConcept } from '../models/world-concept.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';
import type { TurnResponse, ObserveResponse, NarrateResponse, StartTurnResponse, ReactTurnResponse, ArbiterTurnResponse, TurnPhase } from '../models/api-payloads.model';
import type { ActionEvent, TurnStep } from '../models/turn-step.model';

export interface TurnProgress {
  label: string;
  done: number;
  total: number;
}

export interface PendingMessage {
  type: 'action' | 'reaction' | 'resolution' | 'narrative';
  text: string;
}

export interface AppError {
  message: string;
  code?: string;
  timestamp: Date;
}

export interface TurnDebugEntry {
  turnNumber: number;
  npcDecisions: NpcDecision[];
  diceRolls: DiceRoll[];
  arbiterResolution: string | null;
}

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly gameState = signal<GameState | null>(null);
  readonly sessionId = signal<string | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly currentTurnResult = signal<TurnResponse | null>(null);
  readonly error = signal<AppError | null>(null);

  readonly characters = computed(() => this.gameState()?.characters ?? []);
  readonly playerCharacter = computed(() =>
    this.characters().find(c => c.isPlayer)
  );
  readonly npcCharacters = computed(() =>
    this.characters().filter(c => !c.isPlayer && c.status === 'active')
  );
  readonly locations = computed(() => this.gameState()?.locations ?? []);
  readonly concepts = computed(() => this.gameState()?.concepts ?? []);
  readonly turnNumber = computed(() => this.gameState()?.turnNumber ?? 0);
  readonly history = computed(() => this.gameState()?.history ?? []);
  readonly worldContext = computed(() => this.gameState()?.worldContext ?? '');
  readonly narrativeStyle = computed(() => this.gameState()?.narrativeStyle ?? '');
  readonly writingStyle = computed(() => this.gameState()?.writingStyle ?? '');

  readonly npcDecisions = signal<NpcDecision[]>([]);
  readonly diceRolls = signal<DiceRoll[]>([]);
  readonly arbiterResolution = signal<string | null>(null);
  readonly turnDebugHistory = signal<TurnDebugEntry[]>([]);
  readonly hasProcessedFirstTurn = signal<boolean>(false);

  // Turno = 1 ação + reações: fase + mensagens parciais ao vivo,
  // sem esperar o `finish`.
  readonly activeTurnId = signal<string | null>(null);
  readonly turnPhase = signal<TurnPhase | null>(null);
  readonly turnActor = signal<string | null>(null);
  readonly turnProgress = signal<TurnProgress | null>(null);
  readonly pendingMessages = signal<PendingMessage[]>([]);

  // Trace do turno (ator + reatores), fechado no `finish`.
  readonly stepTrace = signal<TurnStep[]>([]);
  readonly selectedStepIndex = signal<number>(0);
  readonly hasTrace = computed(() => this.stepTrace().length > 0);
  readonly selectedStep = computed<TurnStep | null>(() => {
    const trace = this.stepTrace();
    if (trace.length === 0) return null;
    return trace[Math.min(this.selectedStepIndex(), trace.length - 1)] ?? null;
  });
  readonly turnQueue = computed(() => this.selectedStep()?.queue ?? []);
  readonly nextInOrder = computed<string | null>(() => {
    const queue = this.turnQueue();
    // queue[0] = foco (ator); o próximo é o primeiro após o foco.
    return queue.length > 1 ? queue[1]!.who : null;
  });
  readonly eventsLedger = computed<ActionEvent[]>(() => this.gameState()?.events ?? []);

  readonly leftPanelOpen = signal(true);
  readonly rightPanelOpen = signal(true);

  setGameState(sessionId: string, state: GameState): void {
    this.sessionId.set(sessionId);
    this.gameState.set(state);
    this.error.set(null);
    this.turnDebugHistory.set([]);
    this.hasProcessedFirstTurn.set(false);
    this.stepTrace.set([]);
    this.selectedStepIndex.set(0);
    this.clearPhasedTurn();
  }

  // Restaura uma partida salva: aplica o estado completo (incl. history) sem tocar nos settings.
  restore(sessionId: string, state: GameState): void {
    this.sessionId.set(sessionId);
    this.gameState.set(state);
    this.error.set(null);
    this.currentTurnResult.set(null);
    this.npcDecisions.set([]);
    this.diceRolls.set([]);
    this.arbiterResolution.set(null);
    this.turnDebugHistory.set([]);
    this.hasProcessedFirstTurn.set(false);
    this.stepTrace.set([]);
    this.selectedStepIndex.set(0);
    this.clearPhasedTurn();
  }

  /** Fase `start`: ação + dado + fila de percepção, ao vivo. */
  beginPhasedTurn(started: StartTurnResponse): void {
    this.activeTurnId.set(started.turnId);
    this.turnPhase.set(started.reactionsPending > 0 ? 'awaiting_reactions' : 'awaiting_arbiter');
    this.turnActor.set(started.actor);
    this.pendingMessages.set([
      { type: 'action', text: `${started.actor} tenta: ${started.actionText} (d20: ${started.diceRoll.roll})` },
    ]);
    this.addDiceRoll(started.diceRoll);
    this.stepTrace.set([]);
    this.selectedStepIndex.set(0);
    const total = started.reactionsPending + 3; // reações + árbitro + narração + commit
    this.turnProgress.set({ label: `${started.actor} agiu`, done: 1, total });
  }

  /** Fase `react`: 1 reação resolvida, ao vivo. */
  applyReaction(res: ReactTurnResponse, done: number, total: number): void {
    if (!res.ignored && res.action) {
      this.pendingMessages.update(m => [...m, { type: 'reaction', text: `${res.who} reage: ${res.action}` }]);
    }
    this.turnPhase.set(res.reactionsDone ? 'awaiting_arbiter' : 'awaiting_reactions');
    this.turnProgress.set({ label: res.ignored ? `${res.who} ignorou` : `${res.who} reagiu`, done, total });
  }

  /** Fase `arbiter`: julgamento visível antes da prosa. */
  applyArbiter(res: ArbiterTurnResponse, done: number, total: number): void {
    this.arbiterResolution.set(res.resolutionLine);
    this.pendingMessages.update(m => [...m, { type: 'resolution', text: res.resolutionLine }]);
    this.turnPhase.set('awaiting_narrate');
    this.turnProgress.set({ label: `Árbitro: ${res.outcome}`, done, total });
  }

  /** Fase `narrate`: prosa antes do commit. */
  applyNarration(narration: string, done: number, total: number): void {
    this.pendingMessages.update(m => [...m, { type: 'narrative', text: narration }]);
    this.turnPhase.set('awaiting_finish');
    const actor = this.turnActor() ?? '';
    this.turnProgress.set({ label: actor ? `${actor} narrado` : 'Narrado', done, total });
  }

  clearPhasedTurn(): void {
    this.activeTurnId.set(null);
    this.turnPhase.set(null);
    this.turnActor.set(null);
    this.turnProgress.set(null);
    this.pendingMessages.set([]);
  }

  setObservation(result: ObserveResponse): void {
    if (result.sessionId) {
      this.sessionId.set(result.sessionId);
    }
    this.isLoading.set(false);
    this.gameState.set(result.updatedState);
    this.error.set(null);
  }

  setNarration(result: NarrateResponse): void {
    if (result.sessionId) {
      this.sessionId.set(result.sessionId);
    }
    this.isLoading.set(false);
    this.gameState.set(result.updatedState);
    this.error.set(null);
  }

  applyAdminResult(result: import('../models/api-payloads.model').AdminCommandResponse): void {
    if (result.sessionId) {
      this.sessionId.set(result.sessionId);
    }
    this.isLoading.set(false);
    this.gameState.set(result.updatedState);
    this.error.set(null);
  }

  setTurnResult(result: TurnResponse): void {
    const turnBeforeUpdate = this.gameState()?.turnNumber ?? 1;
    if (result.sessionId) {
      this.sessionId.set(result.sessionId);
    }
    this.isLoading.set(false);
    this.currentTurnResult.set(result);
    this.gameState.set(result.updatedState);
    this.arbiterResolution.set(result.logicalResolution);
    this.npcDecisions.set(result.npcDecisions ?? []);
    this.diceRolls.set(result.diceRolls ?? []);
    // Armazena o trace junto; default = último step.
    this.stepTrace.set(result.stepTrace ?? []);
    this.selectedStepIndex.set(Math.max(0, (result.stepTrace ?? []).length - 1));
    this.error.set(null);
    this.clearPhasedTurn();
    this.saveCurrentTurnToHistory(turnBeforeUpdate);
  }

  selectStep(index: number): void {
    const trace = this.stepTrace();
    if (trace.length === 0) return;
    this.selectedStepIndex.set(Math.min(Math.max(0, index), trace.length - 1));
  }

  saveCurrentTurnToHistory(turnNumber: number): void {
    const entry: TurnDebugEntry = {
      turnNumber,
      npcDecisions: this.npcDecisions(),
      diceRolls: this.diceRolls(),
      arbiterResolution: this.arbiterResolution()
    };

    this.turnDebugHistory.update(history => {
      const filtered = history.filter(h => h.turnNumber !== turnNumber);
      return [...filtered, entry];
    });
    this.hasProcessedFirstTurn.set(true);
  }

  clearNpcDecisions(): void {
    this.npcDecisions.set([]);
    this.diceRolls.set([]);
    this.arbiterResolution.set(null);
  }


  addNpcDecision(decision: NpcDecision): void {
    this.npcDecisions.update(decisions => [...decisions, decision]);
  }

  addDiceRoll(roll: DiceRoll): void {
    this.diceRolls.update(rolls => [...rolls, roll]);
  }

  toggleLeftPanel(): void {
    this.leftPanelOpen.update(v => !v);
  }

  toggleRightPanel(): void {
    this.rightPanelOpen.update(v => !v);
  }
}
