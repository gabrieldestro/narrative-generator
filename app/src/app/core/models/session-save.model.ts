import type { GameState } from './game-state.model';

// Metadados exibidos na tela "Continuar Aventuras" e no Histórico de Checkpoints (projeção do SessionBundle).
// Settings NÃO entram aqui — permanecem globais no localStorage.
export interface SavedGameSummary {
  id: string;              // checkpointId (UUID)
  rootId: string;          // id da campanha raiz
  parentId: string | null; // id do checkpoint pai (null se raiz)
  branchId: number;        // número da ramificação (0 = tronco principal)
  branchLabel?: string;    // label amigável opcional
  depth: number;           // distância da raiz
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

export interface PruneResponse {
  deleted: number;
  kept: string | null;
}