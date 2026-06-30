// src/domain/types.ts

// Representa um personagem na nossa história
export interface Character {
  id: string;
  name: string;
  description: string; // Aparência, background, raça, classe
  personality: string; // Como o LLM deve interpretar as atitudes dele
  isPlayer: boolean;   // Se true, aguarda input do console. Se false, a IA decide a ação.
}

// Template de personagem usado em arquivos de mundo e cenários customizados
export interface CharacterTemplate {
  name: string;
  description: string;
  personality: string;
  isPlayer?: boolean;  // Se omitido, assume false
}

// Configuração base do mundo — compartilhada entre template inicial e estado em jogo
export interface WorldConfig {
  narrativeStyle: string; // O gênero da história (Fantasia Medieval, Cyberpunk, etc.)
  writingStyle: string;   // O tom/estilo de escrita (Terror Sombrio, Cômico/Sarcástico, Épico, etc.)
  worldContext: string;   // A descrição do cenário/mundo atual
}

// Representa um template de mundo pré-configurado carregado da pasta /worlds/
export interface WorldTemplate extends WorldConfig {
  name: string;
  description: string;
  characters: CharacterTemplate[];
}

// Representa o Estado global do nosso jogo em um dado momento
export interface GameState extends WorldConfig {
  characters: Character[];
  history: string[];      // O histórico das últimas interações narrativas para dar contexto ao LLM
  turnNumber: number;
  longTermSummary?: string; // Memória de longo prazo sumarizada (opcional)
}
