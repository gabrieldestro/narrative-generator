import type { GameState } from './game-state.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';
import type { GameSettings } from './game-settings.model';
import type { SessionBundle, SavedGameSummary } from './session-save.model';
import type { WorldTemplate } from './world-template.model';

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
  customPrompt?: string;        // mantido p/ compatibilidade (prompt legado)
  world?: WorldTemplate;        // novo: cenário estruturado
  settings?: Partial<GameSettings>;
}

export interface EnrichPayload {
  field: string;
  value: string;
  context?: WorldTemplate;
}

export interface EnrichResponse {
  enriched: string;
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

export interface ExtractedCharacterSheet {
  name: string;
  description: string;
  personality: string;
  currentLocation: string;
}

export interface AdminCommandPayload {
  command: string;
  args?: string[];
  fields?: Record<string, unknown>;
  settings?: Partial<GameSettings>;
}

export interface AdminCommandResponse {
  sessionId: string;
  message: string;
  updatedState: GameState;
  payload?: { sheet?: ExtractedCharacterSheet } | any;
}
