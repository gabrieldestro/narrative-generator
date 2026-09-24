import type { GameState } from './game-state.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';
import type { TurnStep } from './turn-step.model';
import type { GameSettings } from './game-settings.model';
import type { SessionBundle, SavedGameSummary } from './session-save.model';
import type { WorldTemplate } from './world-template.model';

export type ActionType = 'observe' | 'speak' | 'attack' | 'sneak' | 'use_item' | 'interact' | 'flee' | 'free';
export type ActionIntent = 'curious' | 'aggressive' | 'cautious' | 'friendly' | 'intimidating' | 'desperate' | 'neutral';

export interface PlayerActionPayload {
  actionType?: ActionType;
  actionIntent?: ActionIntent;
  /** Ausente ⇒ avanço de NPC pela rotação (jogador na vez ⇒ 409). */
  playerText?: string;
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
  action?: 'enrich' | 'summarize';
}

export interface EnrichResponse {
  enriched: string;
}

export interface SaveWorldResponse {
  id: string;
  template: WorldTemplate;
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
  // Trace do turno (1 ação + reações).
  stepTrace?: TurnStep[];
  /** Próximo ator pela rotação; `awaitingPlayer` ⇒ front aguarda input. */
  nextActor: string | null;
  awaitingPlayer: boolean;
}

export type TurnPhase = 'awaiting_reactions' | 'awaiting_arbiter' | 'awaiting_narrate' | 'awaiting_finish';

// Turno = 1 ação + reações, em fases sequenciais com visual progressivo:
// `start` (ação+dado+gate) → N× `react` (1 reator) → `arbiter` → `narrate` → `finish`.
export interface StartTurnResponse {
  sessionId: string;
  turnId: string;
  turnNumber: number;
  actor: string;
  actionText: string;
  diceRoll: DiceRoll;
  allowed: { who: string; channel: string }[];
  denied: { who: string; why: string }[];
  reactionsPending: number;
  sceneDescription?: string;
}

export interface ReactTurnResponse {
  sessionId: string;
  turnId: string;
  who: string;
  action?: string;
  ignored: boolean;
  channel: string;
  reactionsPending: number;
  reactionsDone: boolean;
}

export interface ArbiterTurnResponse {
  sessionId: string;
  turnId: string;
  outcome: 'success' | 'partial' | 'failure';
  reason: string;
  violent: boolean;
  resolutionLine: string;
}

export interface TurnNarrateResponse {
  sessionId: string;
  turnId: string;
  narration: string;
}

export interface TurnStatusResponse {
  sessionId: string;
  turnId: string;
  status: string;
  phase: TurnPhase;
  actor: string;
  actionText: string;
  diceRoll: DiceRoll;
  reactionsPending: number;
  reacted: { who: string; action: string }[];
  ignored: string[];
  resolutionLine?: string;
  narration?: string;
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
