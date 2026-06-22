// src/domain/types.ts

// Representa um personagem na nossa história
export interface Character {
  id: string;
  name: string;
  description: string; // Aparência, background, raça, classe
  personality: string; // Como o LLM deve interpretar as atitudes dele
  isPlayer: boolean;   // Se true, aguarda input do console. Se false, a IA decide a ação.
}

// Representa o Estado global do nosso jogo em um dado momento
export interface GameState {
  worldContext: string;
  narrativeStyle: string; // O gênero da história (Fantasia Medieval, Cyberpunk, etc.)
  writingStyle: string;   // O tom/estilo de escrita (Terror Sombrio, Cômico/Sarcástico, Épico, etc.)
  characters: Character[];
  history: string[];      // O histórico das últimas interações narrativas para dar contexto ao LLM
  turnNumber: number;
}
