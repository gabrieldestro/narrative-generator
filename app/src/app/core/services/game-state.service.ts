import { Injectable, signal, computed } from '@angular/core';
import type { GameState } from '../models/game-state.model';
import type { Character } from '../models/character.model';
import type { Location } from '../models/location.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly gameState = signal<GameState | null>(null);
  readonly sessionId = signal<string | null>(null);
  readonly isStreaming = signal<boolean>(false);
  readonly currentTurnResult = signal<any>(null);

  readonly characters = computed(() => this.gameState()?.characters ?? []);
  readonly playerCharacter = computed(() =>
    this.characters().find(c => c.isPlayer)
  );
  readonly npcCharacters = computed(() =>
    this.characters().filter(c => !c.isPlayer && c.status === 'active')
  );
  readonly locations = computed(() => this.gameState()?.locations ?? []);
  readonly turnNumber = computed(() => this.gameState()?.turnNumber ?? 0);
  readonly history = computed(() => this.gameState()?.history ?? []);
  readonly worldContext = computed(() => this.gameState()?.worldContext ?? '');
  readonly narrativeStyle = computed(() => this.gameState()?.narrativeStyle ?? '');
  readonly writingStyle = computed(() => this.gameState()?.writingStyle ?? '');

  readonly npcDecisions = signal<NpcDecision[]>([]);
  readonly diceRolls = signal<DiceRoll[]>([]);
  readonly arbiterResolution = signal<string | null>(null);
  readonly narrativeTokens = signal<string>('');

  readonly leftPanelOpen = signal(true);
  readonly rightPanelOpen = signal(true);

  setGameState(sessionId: string, state: GameState): void {
    this.sessionId.set(sessionId);
    this.gameState.set(state);
  }

  clearNpcDecisions(): void {
    this.npcDecisions.set([]);
    this.diceRolls.set([]);
    this.arbiterResolution.set(null);
    this.narrativeTokens.set('');
  }

  addNpcDecision(decision: NpcDecision): void {
    this.npcDecisions.update(decisions => [...decisions, decision]);
  }

  addDiceRoll(roll: DiceRoll): void {
    this.diceRolls.update(rolls => [...rolls, roll]);
  }

  addNarrativeToken(token: string): void {
    this.narrativeTokens.update(text => text + token);
  }

  toggleLeftPanel(): void {
    this.leftPanelOpen.update(v => !v);
  }

  toggleRightPanel(): void {
    this.rightPanelOpen.update(v => !v);
  }
}
