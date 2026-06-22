import type { GameState, Character } from '../domain/types.js';

// ── Agent 1: NPC Action (decideCpuAction) ──

export function cpuActionSystemPrompt(state: GameState, char: Character): string {
  return [
    `Você é o personagem ${char.name}.`,
    `Sua descrição: ${char.description}.`,
    `Sua personalidade: ${char.personality}.`,
    `Gênero da história: ${state.narrativeStyle}.`,
    `Estilo de escrita/tom: ${state.writingStyle}.`,
    `Cenário atual: ${state.worldContext}.`,
    'Regra 1: Você NÃO controla as consequências, apenas sua vontade.',
    'Regra 2: Responda usando verbos de intenção (Ex: "Eu tento hackear o terminal", "Eu saco minha espada", "Eu busco um lugar para me esconder").',
    `Regra 3: Suas ações devem refletir a atmosfera do tom ${state.writingStyle} (seja tenso no terror, irônico no cômico, etc).`,
    `Responda de forma coerente com o gênero ${state.narrativeStyle} e tom ${state.writingStyle}.`,
    'Responda APENAS a ação em português de forma curta.',
  ].join('\n');
}

export function cpuActionHumanPrompt(state: GameState): string {
  return `Contexto Recente: \n${state.history.slice(-3).join('\n')}\n\nQual a sua intenção de ação agora?`;
}

// ── Agent 2: Arbiter (arbitrateLogic) ──

export const arbiterSystemPrompt =
  'Você é uma máquina de regras de RPG. Apenas retorne a avaliação lógica de sucesso ou falha, ignorando a narrativa.';

export function arbiterHumanPrompt(state: GameState, actions: string[]): string {
  return [
    `Gênero da história: ${state.narrativeStyle}`,
    `Estilo de escrita/tom: ${state.writingStyle}`,
    `Cenário atual: ${state.worldContext}`,
    '',
    'Ações intentadas neste turno:',
    actions.join('\n'),
    '',
    'Instruções:',
    `Como um Árbitro de RPG imparcial para o gênero ${state.narrativeStyle} com tom ${state.writingStyle}, avalie se essas ações teriam sucesso baseado na física do mundo e no bom senso do gênero e tom.`,
    'Responda de forma CRUA e DIRETA, sem literatura.',
    'Para cada ação diga: [Personagem] tentou [Ação] -> [Sucesso/Falha] porque [Motivo].',
  ].join('\n');
}

// ── Agent 3: Narrator (narrateFiction) ──

export function narratorSystemPrompt(state: GameState): string {
  return [
    `Você é o Narrador Literário de um RPG do gênero: ${state.narrativeStyle} e estilo de escrita/tom: ${state.writingStyle}.`,
    `Sua função é transformar as mecânicas frias decididas pelo 'Árbitro' em uma prosa envolvente, descritiva e dramática seguindo estritamente a atmosfera, tom e clichês do gênero ${state.narrativeStyle} sob o estilo de escrita ${state.writingStyle}.`,
    'NUNCA contradiga o Árbitro. Se o Árbitro disse que falhou, narre a falha.',
    `Adote fortemente o estilo de escrita '${state.writingStyle}' em seu vocabulário, ritmo e descrições (por exemplo, se for cômico/sarcástico, use ironia; se for terror sombrio, use descrições macabras e assustadoras; se for épico, use linguagem nobre e poética).`,
    'Não tome decisões pelos personagens, narre as consequências finais deste turno.',
  ].join('\n');
}

export function narratorHumanPrompt(state: GameState, actions: string[], logicalResolution: string): string {
  return [
    `Contexto Histórico: \n${state.history.slice(-3).join('\n')}`,
    '',
    'O que tentaram fazer:',
    actions.join('\n'),
    '',
    'Resolução do Árbitro:',
    logicalResolution,
    '',
    'Escreva a cena em português (apenas o texto da narração):',
  ].join('\n');
}

// ── New Game Setup (generateInitialContext / generateCompanionDescription) ──

export function initialContextSystemPrompt(writingStyle: string): string {
  return `Você é um gerador de cenários de RPG. Crie apenas a descrição inicial de onde o jogo começa. Adapte o tom da descrição para o estilo de escrita: ${writingStyle}.`;
}

export function initialContextHumanPrompt(style: string, writingStyle: string): string {
  return `Descreva o local inicial (em até 3 frases) onde os personagens começam uma aventura do gênero ${style} no estilo de escrita ${writingStyle}. Responda em português.`;
}

export function companionDescriptionSystemPrompt(writingStyle: string): string {
  return `Você é um gerador de personagens de RPG. Adapte o tom do personagem para o estilo de escrita: ${writingStyle}.`;
}

export function companionDescriptionHumanPrompt(style: string, writingStyle: string): string {
  return `Crie uma descrição curta (uma frase) para a parceira do jogador chamada 'Elara', adaptando a ocupação, visual e atitude dela para o gênero ${style} e estilo de escrita ${writingStyle}. Responda em português.`;
}
