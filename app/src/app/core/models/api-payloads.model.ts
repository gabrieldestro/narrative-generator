import type { GameState } from './game-state.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';
import type { GameSettings } from './game-settings.model';
import type { SessionBundle, SavedGameSummary } from './session-save.model';

export type ActionType = 'observe' | 'speak' | 'attack' | 'sneak' | 'use_item' | 'interact' | 'flee' | 'free';
export type ActionIntent = 'curious' | 'aggressive' | 'cautious' | 'friendly' | 'intimidating' | 'desperate' | 'neutral';

export interface PlayerActionPayload {
  actionType?: ActionType;
  actionIntent?: ActionIntent;
  playerText: string;
  characterName?: string;
  settings?: Partial<GameSettings>;
}

export interface CreateGameTemplatePayload {
  mode: 'template';
  templateName: string;
  settings?: Partial<GameSettings>;
}

export interface CreateGameCustomPayload {
  mode: 'custom';
  customPrompt: string;
  settings?: Partial<GameSettings>;
}

export type CreateGamePayload = CreateGameTemplatePayload | CreateGameCustomPayload;

export interface CreateGameResponse {
  sessionId: string;
  state: GameState;
}

export interface ObserveResponse {
  sessionId: string;
  observation: string;
  updatedState: GameState;
}

export interface NarrateResponse {
  sessionId: string;
  narration: string;
  updatedState: GameState;
}

export interface TurnResponse {
  sessionId: string;
  narrative: string;
  logicalResolution: string;
  updatedState: GameState;
  npcDecisions?: NpcDecision[];
  diceRolls?: DiceRoll[];
}

export interface GameStateResponse {
  sessionId: string;
  state: GameState;
}

export type ListSavesResponse = SavedGameSummary[];

export type LoadSaveResponse = SessionBundle;
