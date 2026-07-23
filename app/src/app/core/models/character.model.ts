export type CharacterStatus = 'active' | 'dead' | 'lost';

export interface ScratchpadEntry {
  turn: number;
  objective: string;
  action: string;
  result: 'success' | 'failure';
  reasoning: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  isPlayer: boolean;
  longTermObjective?: string;
  currentObjective?: string;
  scratchpad?: ScratchpadEntry[];
  currentLocation?: string;
  inventory?: string[];
  status?: CharacterStatus;
}
