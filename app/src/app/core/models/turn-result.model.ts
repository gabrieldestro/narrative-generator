import type { GameState } from './game-state.model';

export interface NpcDecision {
  characterName: string;
  action: string;
  reasoning: string;
  success: boolean;
}

export interface DiceRoll {
  characterName: string;
  roll: number;
  isGodMode?: boolean;
}

export interface UnexpectedEvent {
  triggered: boolean;
  description?: string;
}

export interface TurnResult {
  narrative: string;
  logicalResolution: string;
  updatedState: GameState;
  npcDecisions?: NpcDecision[];
  diceRolls?: DiceRoll[];
  unexpectedEvent?: UnexpectedEvent;
}
