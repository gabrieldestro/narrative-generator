import type { Character } from './character.model';
import type { Location } from './location.model';
import type { WorldConcept } from './world-concept.model';
import type { ActionEvent } from './micro-turn.model';

export interface GameState {
  narrativeStyle: string;
  writingStyle: string;
  worldContext: string;
  characters: Character[];
  history: string[];
  turnNumber: number;
  longTermSummary?: string;
  locations?: Location[];
  lastSceneLocation?: string;
  concepts?: WorldConcept[];
  events?: ActionEvent[];
}
