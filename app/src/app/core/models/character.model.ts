export type CharacterStatus = 'active' | 'dead' | 'lost';

// Doc 27, Fase 5 — vitalidade mínima narrativa (sem RPG).
export type Vitality = 'ileso' | 'ferido' | 'grave' | 'caído';

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
  vitality?: Vitality;
  conditions?: string[];
}
