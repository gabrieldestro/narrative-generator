import type { Location } from './location.model';
import type { WorldConcept } from './world-concept.model';

export interface WorldConfig {
  narrativeStyle: string;
  writingStyle: string;
  worldContext: string;
}

export interface CharacterTemplate {
  name: string;
  description: string;
  personality: string;
  isPlayer?: boolean;
  longTermObjective?: string;
  initialLocation?: string;
  inventory?: string[];
}

export interface WorldTemplate extends WorldConfig {
  id?: string;
  name: string;
  description: string;
  characters: CharacterTemplate[];
  locations?: Location[];
  concepts?: WorldConcept[];
}
