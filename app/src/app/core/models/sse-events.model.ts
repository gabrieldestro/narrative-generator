import type { NpcDecision, DiceRoll } from './turn-result.model';

export interface SseStartEvent {
  message: string;
}

export interface SseNpcDecisionsEvent {
  data: NpcDecision[];
}

export interface SseDiceRollsEvent {
  data: DiceRoll[];
}

export interface SseArbiterEvent {
  resolution: string;
}

export interface SseUnexpectedEvent {
  triggered: boolean;
  description?: string;
}

export interface SseTokenEvent {
  token: string;
}

export interface SseDoneEvent {
  sessionId: string;
  narrative: string;
  logicalResolution: string;
  updatedState: import('./game-state.model').GameState;
}
