import { Injectable, signal, computed } from '@angular/core';
import type { GameState } from '../models/game-state.model';
import type { Character } from '../models/character.model';
import type { Location } from '../models/location.model';
import type { WorldConcept } from '../models/world-concept.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';
import type { TurnResponse, ObserveResponse, NarrateResponse } from '../models/api-payloads.model';

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

  readonly leftPanelOpen = signal(true);
  readonly rightPanelOpen = signal(true);

  setGameState(sessionId: string, state: GameState): void {
    this.sessionId.set(sessionId);
    this.gameState.set(state);
    this.error.set(null);
    this.turnDebugHistory.set([]);
    this.hasProcessedFirstTurn.set(false);
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
  }

  setObservation(result: ObserveResponse): void {
    this.isLoading.set(false);
    this.gameState.set(result.updatedState);
    this.error.set(null);
  }

  setNarration(result: NarrateResponse): void {
    this.isLoading.set(false);
    this.gameState.set(result.updatedState);
    this.error.set(null);
  }

  applyAdminResult(result: import('../models/api-payloads.model').AdminCommandResponse): void {
    this.isLoading.set(false);
    this.gameState.set(result.updatedState);
    this.error.set(null);
  }

  setTurnResult(result: TurnResponse): void {
    const turnBeforeUpdate = this.gameState()?.turnNumber ?? 1;
    this.isLoading.set(false);
    this.currentTurnResult.set(result);
    this.gameState.set(result.updatedState);
    this.arbiterResolution.set(result.logicalResolution);
    this.npcDecisions.set(result.npcDecisions ?? []);
    this.diceRolls.set(result.diceRolls ?? []);
    this.error.set(null);
    this.saveCurrentTurnToHistory(turnBeforeUpdate);
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
