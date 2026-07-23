export type NarrationSize = 'concise' | 'balanced' | 'descriptive';

export interface NarrationSizePrompts {
  concise: string;
  balanced: string;
  descriptive: string;
}

export interface GameSettings {
  memoryWindowSize: number;
  debug: boolean;
  godMode: boolean;
  unexpectedEventChance: number;
  narrationSize: NarrationSize;

  // Conexão LLM
  apiUrl: string;
  model: string;
  apiToken: string;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  memoryWindowSize: 5,
  debug: false,
  godMode: false,
  unexpectedEventChance: 0.15,
  narrationSize: 'balanced',
  apiUrl: 'http://localhost:1234/v1',
  model: 'gemma-4b',
  apiToken: '',
};
