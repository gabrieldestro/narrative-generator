// src/domain/types.ts

export interface ScratchpadEntry {
  turn: number;
  objective: string;
  action: string;
  result: 'success' | 'failure';
  reasoning: string;
}

export interface CpuAgentDecision {
  reasoning: string;
  updatedObjective: string;
  action: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  connectedTo: string[]; // IDs de outras localizações conectadas
}

export type ConceptType = 'item' | 'faction' | 'state' | 'region' | 'place' | 'custom';

export interface WorldConcept {
  id: string;
  type: ConceptType;
  name: string;
  description: string;
}

export type CharacterStatus = 'active' | 'dead' | 'lost';

// Doc 27, Fase 0 — vitalidade mínima narrativa (sem RPG). Opcional p/ compat.
export type Vitality = 'ileso' | 'ferido' | 'grave' | 'caído';

export type ActionType = 'observe' | 'speak' | 'attack' | 'sneak' | 'use_item' | 'interact' | 'flee' | 'free';

export type ActionIntent = 'curious' | 'aggressive' | 'cautious' | 'friendly' | 'intimidating' | 'desperate' | 'neutral';

export interface PlayerActionPayload {
  actionType?: ActionType;
  actionIntent?: ActionIntent;
  playerText: string;
  characterName?: string;
  settings?: Partial<GameSettings>;
}

// Representa um personagem na nossa história
export interface Character {
  id: string;
  name: string;
  description: string; // Aparência, background, raça, classe
  personality: string; // Como o LLM deve interpretar as atitudes dele
  isPlayer: boolean;   // Se true, aguarda input do console. Se false, a IA decide a ação.
  longTermObjective?: string; // Objetivo macro do personagem (vindo do template ou gerado por IA)
  currentObjective?: string;  // Objetivo de curto prazo (refinado a cada turno via reflexão do NPC)
  scratchpad?: ScratchpadEntry[]; // Diário de bordo: últimas tentativas para o NPC raciocinar
  currentLocation?: string; // Local/ambiente atual onde o personagem se encontra
  inventory?: string[]; // Itens carregados pelo personagem
  status?: CharacterStatus; // Controle de ciclo de vida
  vitality?: Vitality; // Doc 27, Fase 0 — default 'ileso', opcional p/ compat
  conditions?: string[]; // Doc 27 — condições livres visíveis (max 3), ex: ["tornozelo torcido"]
}

// Template de personagem usado em arquivos de mundo e cenários customizados
export interface CharacterTemplate {
  name: string;
  description: string;
  personality: string;
  isPlayer?: boolean;  // Se omitido, assume false
  longTermObjective?: string; // Objetivo macro vindo do template de mundo
  initialLocation?: string; // Local inicial do personagem no template de mundo
  inventory?: string[]; // Inventário inicial opcional
}

// Configuração base do mundo — compartilhada entre template inicial e estado em jogo
export interface WorldConfig {
  narrativeStyle: string; // O gênero da história (Fantasia Medieval, Cyberpunk, etc.)
  writingStyle: string;   // O tom/estilo de escrita (Terror Sombrio, Cômico/Sarcástico, Épico, etc.)
  worldContext: string;   // A descrição do cenário/mundo atual
}

// Representa um template de mundo pré-configurado carregado da pasta /worlds/
export interface WorldTemplate extends WorldConfig {
  id?: string;
  name: string;
  description: string;
  characters: CharacterTemplate[];
  locations?: Location[]; // Configuração de mapa inicial (opcional)
  concepts?: WorldConcept[]; // Conceitos abstratos iniciais (opcional)
}

// Templates de prompt para cada tamanho de narração
export interface NarrationSizePrompts {
  concise: string;
  balanced: string;
  descriptive: string;
}

export interface NpcDecision {
  characterName: string;
  action: string;
  reasoning: string;
  success: boolean;
}

export interface DiceRoll {
  characterName: string;
  roll: number;
  isGodMode?: boolean;
}

// Configurações ajustáveis e centralizadas do motor de jogo
export interface GameSettings {
  memoryWindowSize: number;
  debug: boolean;
  godMode: boolean;
  arbiterHistoryTurns: number;
  unexpectedEventChance: number;
  maxScratchpadSize: number;
  maxCpuRetries: number;
  narrationSize: 'concise' | 'balanced' | 'descriptive';
  narrationSizePrompts: NarrationSizePrompts;
  maxHealRetries: number;
  healSummaryOnOverflow: boolean;
  jsonRepairMaxInputChars: number;
  // Doc 27, Fase 0 — flags do micro-turno (default false até estabilizar).
  microTurno?: boolean;
  structuredMode?: 'prompt-json' | 'tool-call';
}

export const DEFAULT_NARRATION_SIZE_PROMPTS: NarrationSizePrompts = {
  concise: 'Seja conciso(a). Escreva APENAS 1 a 2 parágrafos curtos e COMPLETOS (máximo ~100 tokens). Finalize a cena com ponto final — nunca pare no meio de uma frase.',
  balanced: 'Escreva de forma equilibrada, com 3 a 4 parágrafos descritivos (máximo ~250 tokens). Mantenha a fluência narrativa e finalize a cena com ponto final.',
  descriptive: 'Seja detalhista e imersivo(a). Escreva 5 ou mais parágrafos ricos em detalhes sensoriais, emoções e expansão de cena (máximo ~500 tokens). Finalize a cena com ponto final.',
};

export const DEFAULT_SETTINGS: GameSettings = {
  memoryWindowSize: 5,
  debug: true,
  godMode: false,
  arbiterHistoryTurns: 3,
  unexpectedEventChance: 0.15,
  maxScratchpadSize: 5,
  maxCpuRetries: 3,
  narrationSize: 'balanced',
  narrationSizePrompts: DEFAULT_NARRATION_SIZE_PROMPTS,
  maxHealRetries: 2,
  healSummaryOnOverflow: true,
  jsonRepairMaxInputChars: 4000,
};

// Doc 27, Fase 1 — micro-turno por ação (sem RPG).
export interface MicroAction {
  actor: string; // nome exato
  text: string; // ação normalizada (ActionBuilder p/ player, CpuDecision p/ NPC)
  target?: string | undefined;
  roll?: number | undefined; // d20 preservado (godMode=20 p/ player); árbitro pondera, não decide sozinho
}

export type MicroOutcome = 'success' | 'partial' | 'failure';

export interface MicroResolution {
  outcome: MicroOutcome;
  violent: boolean; // houve confronto físico?
  reason: string; // 1 frase física, sem literatura
  hit: string[]; // quem sofreu consequência física (nomes válidos)
}

// Doc 27, Fase 0 — ledger factual (engine escreve, sem LLM).
export interface ActionEvent {
  seq: number; // monotônico global (state.nextSeq++ por micro-commit)
  turn: number; // turno do POST (turnNumber++ 1x por turno, não por micro)
  who: string;
  did: string; // verbo curto
  outcome: 'success' | 'partial' | 'failure';
  where: string;
}

// Doc 27, Fase 2 — micro-extratores por categoria (§6.2). Formatos pequenos,
// 1 por categoria; `{}` = "nada mudou". Chaves EN, valores PT.
export interface InventoryDelta {
  grab?: { who: string; item: string }[];
  drop?: { who: string; item: string }[];
}

export interface MovementDelta {
  move?: { who: string; to: string }[];
}

export interface ConditionsDelta {
  conditions?: { who: string; add: string }[];
}

/** Deltas de 1 micro-narração (categorias independentes — merge em paralelo). */
export interface MicroDeltas {
  inventory?: InventoryDelta;
  movement?: MovementDelta;
  conditions?: ConditionsDelta;
}

// Doc 27, Fase 4 — cena + memória factual (§6.3/§8.1).
export interface SceneDelta {
  new_locations?: { name: string; desc: string }[];
  new_npcs?: { name: string; desc: string; where: string }[];
  dead?: string[];
  lost?: string[];
  /** Cura narrativa explícita: 1 nível de vitalidade para trás + remove a
   * condição citada em `what` (se houver). Decisão armadilha (a). */
  healed?: { who: string; what?: string }[];
}

// Doc 27, Fase 4 — memória factual de tamanho fixo (§8.1). Substituída a
// cada cena, nunca acumulada.
export interface FactThread {
  id: string;
  text: string;
  status: 'open' | 'closed';
}

export interface FactSheet {
  facts: string[];
  threads: FactThread[];
}

// Doc 27, Fase 3 — gate de percepção + trace (§4.3/§6.5/§7.3).
export interface GateCandidate {
  name: string;
  where: string;
  isTarget: boolean;
  ownsItem: boolean;
}

export type GateChannel = 'saw' | 'heard' | 'stake' | 'none';

export interface GateRuling {
  who: string;
  allow: boolean;
  channel: GateChannel;
  why: string;
}

export interface MicroQueueEntry {
  who: string;
  where: string;
  status: 'done' | 'ignored' | 'denied';
}

/** Bloco de trace por micro (transitório — vai na resposta, NÃO persiste no save). */
export interface MicroBlock {
  micro: number;
  actor: string;
  actorWhere: string;
  queue: MicroQueueEntry[]; // [0] = actor (foco); resto = candidatos em ordem de stake
  spotlight: string; // = actor (vira evento próprio no SSE futuro)
  gate: {
    allowed: { who: string; channel: Exclude<GateChannel, 'none'> }[];
    denied: { who: string; why: string }[];
  };
}

// Representa o Estado global do nosso jogo em um dado momento
export interface GameState extends WorldConfig {
  characters: Character[];
  history: string[];      // O histórico das últimas interações narrativas para dar contexto ao LLM
  turnNumber: number;
  longTermSummary?: string; // Memória de longo prazo sumarizada (opcional)
  locations?: Location[]; // Lista de localizações do mundo atual
  lastSceneLocation?: string; // Local em que a descrição de cenário foi apresentada pela última vez
  concepts?: WorldConcept[]; // Lista de conceitos abstratos do mundo atual
  events?: ActionEvent[]; // Doc 27 — ledger factual, append-only em disco
  nextSeq?: number; // Doc 27 — próximo seq monotônico dos events
  factSheet?: FactSheet; // Doc 27, Fase 4 — memória factual (§8.1), replace por cena
}

// Versão do schema de save. Incremente quando `GameState` ou a estrutura do save mudar de forma incompatível
// e adicione um passo de migração em `FileSaveStore.migrate`.
export const SAVE_SCHEMA_VERSION = 5 as const;

// Metadados de um checkpoint de save (sem o estado completo).
export interface SavedGameSummary {
  id: string;              // checkpointId (UUID) — imutável
  rootId: string;          // id da campanha raiz (primeiro checkpoint da árvore)
  parentId: string | null; // de qual checkpoint este foi gerado; null = raiz
  branchId: number;        // 0 = tronco principal; incrementa a cada fork
  branchLabel?: string;    // opcional: "Linha 1", "Linha 2 (fork de T3)"
  depth: number;           // distância da raiz (ou turnNumber no momento)
  mode: 'template' | 'custom';
  title: string;           // nome legível (nome do mundo ou estilo narrativo)
  createdAt: string;       // ISO
  updatedAt: string;       // ISO de gravação
  narrativeStyle: string;
  writingStyle: string;
  turnNumber: number;
  playerCharacterName: string;
  lastNarrative: string;   // preview (última prosa de history)
}

// Pacote de save: agrupa estado + metadados necessários para reconstruir/restaurar um jogo.
// Settings são GLOBAIS (localStorage) e NÃO entram aqui.
export interface SessionBundle extends SavedGameSummary {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  state: GameState; // estado completo do jogo
}
