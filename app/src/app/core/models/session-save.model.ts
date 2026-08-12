import type { GameState } from './game-state.model';

// Metadados exibidos na tela "Continuar Aventuras" (projeção do SessionBundle).
// Settings NÃO entram aqui — permanecem globais no localStorage.
export interface SavedGameSummary {
  id: string;
  mode: 'template' | 'custom';
  title: string;
  createdAt: string;
  updatedAt: string;
  narrativeStyle: string;
  writingStyle: string;
  turnNumber: number;
  playerCharacterName: string;
  lastNarrative: string;
}

// Espelha o `SessionBundle` do backend: estado completo + metadados.
export interface SessionBundle extends SavedGameSummary {
  schemaVersion: number;
  state: GameState;
}