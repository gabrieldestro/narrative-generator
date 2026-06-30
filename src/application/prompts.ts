import type { GameState, Character } from '../domain/types.js';

// ── Agent 1: NPC Action (decideCpuAction) ──

export function cpuActionSystemPrompt(state: GameState, char: Character): string {
  const promptParts = [
    `Você é o personagem ${char.name}.`,
    `Sua descrição: ${char.description}.`,
    `Sua personalidade: ${char.personality}.`,
    `Gênero da história: ${state.narrativeStyle}.`,
    `Estilo de escrita/tom: ${state.writingStyle}.`,
    `Cenário atual: ${state.worldContext}.`,
  ];
  if (state.longTermSummary) {
    promptParts.push(`Memória de Longo Prazo (Resumo dos eventos anteriores): ${state.longTermSummary}`);
  }
  promptParts.push(
    'Regra 1: Você NÃO controla as consequências, apenas sua vontade.',
    'Regra 2: Responda usando verbos de intenção (Ex: "Eu tento hackear o terminal", "Eu saco minha espada", "Eu busco um lugar para me esconder").',
    `Regra 3: Suas ações devem refletir a atmosfera do tom ${state.writingStyle} (seja tenso no terror, irônico no cômico, etc).`,
    `Responda de forma coerente com o gênero ${state.narrativeStyle} e tom ${state.writingStyle}.`,
    'Responda APENAS a ação em português de forma curta.'
  );
  return promptParts.join('\n');
}

export function cpuActionHumanPrompt(state: GameState): string {
  return `Contexto Recente: \n${state.history.join('\n\n')}\n\nQual a sua intenção de ação agora?`;
}

// ── Agent 2: Arbiter (arbitrateLogic) ──

export const arbiterSystemPrompt =
  'Você é uma máquina de regras de RPG. Apenas retorne a avaliação lógica de sucesso ou falha, ignorando a narrativa.';

export function arbiterHumanPrompt(state: GameState, actions: string[]): string {
  return [
    `Cenário atual: ${state.worldContext}`,
    '',
    'Ações intentadas neste turno:',
    actions.join('\n'),
    '',
    'Instruções:',
    'Avalie APENAS se o CORPO do personagem é capaz de executar fisicamente a ação.',
    'NÃO avalie contexto, adequação, bom senso, consequências sociais, lógica do mundo, anacronismo, ou adequação ao cenário.',
    'NÃO use o gênero da história, o estilo de escrita ou o tom para negar ou aprovar ações.',
    'O tema, o estilo e a adequação ao cenário NÃO importam — apenas a capacidade física importa.',
    'Exemplo: "Personagem tenta: Contar uma piada." -> O corpo do personagem é capaz de falar? Sim -> Sucesso.',
    'Exemplo: "Personagem tenta: Voar batendo os braços." -> O corpo do personagem é capaz de voar? Não -> Falha.',
    'Se uma pessoa comum poderia fazer aquela ação com o próprio corpo, é Sucesso.',
    'Responda de forma CRUA e DIRETA, sem literatura.',
    'Para cada ação diga: [Personagem] tentou [Ação] -> [Sucesso/Falha] porque [Motivo].',
  ].join('\n');
}

// ── Agent 3: Narrator (narrateFiction) ──

export function narratorSystemPrompt(state: GameState): string {
  const promptParts = [
    `Você é o Narrador Literário de um RPG do gênero: ${state.narrativeStyle} e estilo de escrita/tom: ${state.writingStyle}.`,
    `Sua função é transformar as mecânicas frias decididas pelo 'Árbitro' em uma prosa envolvente, descritiva e dramática seguindo estritamente a atmosfera, tom e clichês do gênero ${state.narrativeStyle} sob o estilo de escrita ${state.writingStyle}.`,
  ];
  if (state.longTermSummary) {
    promptParts.push(`Memória de Longo Prazo (Resumo dos eventos anteriores): ${state.longTermSummary}`);
  }
  promptParts.push(
    'NUNCA contradiga o Árbitro. Se o Árbitro disse que falhou, narre a falha.',
    `Adote fortemente o estilo de escrita '${state.writingStyle}' em seu vocabulário, ritmo e descrições (por exemplo, se for cômico/sarcástico, use ironia; se for terror sombrio, use descrições macabras e assustadoras; se for épico, use linguagem nobre e poética).`,
    'Não tome decisões pelos personagens, narre as consequências finais deste turno.'
  );
  return promptParts.join('\n');
}

export function narratorHumanPrompt(state: GameState, actions: string[], logicalResolution: string): string {
  return [
    `Contexto Histórico: \n${state.history.join('\n\n')}`,
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

// ── Agent 4: Initial Narrative (generateInitialNarrative) ──

export function initialNarrativeSystemPrompt(state: GameState): string {
  return [
    `Você é o Narrador Literário de abertura de um RPG do gênero: ${state.narrativeStyle} e estilo de escrita/tom: ${state.writingStyle}.`,
    `Sua função é escrever a cena de abertura — envolvente, descritiva e dramática — seguindo estritamente a atmosfera, tom e clichês do gênero ${state.narrativeStyle} sob o estilo de escrita ${state.writingStyle}.`,
    `Adote fortemente o estilo de escrita '${state.writingStyle}' em seu vocabulário, ritmo e descrições.`,
    `Apresente o cenário e os personagens, mas não tome decisões por eles.`,
    'Não use mais que 500 tokens.',
  ].join('\n');
}

export function initialNarrativeHumanPrompt(state: GameState): string {
  return [
    `Cenário: ${state.worldContext}`,
    '',
    'Personagens:',
    ...state.characters.map(c => `${c.name} — ${c.description}. Personalidade: ${c.personality}`),
    '',
    'Escreva a cena de abertura em português, apresentando o local e os personagens, preparando o palco para as primeiras ações dos heróis:',
  ].join('\n');
}

// ── New Game Setup (generateInitialContext / generateCompanionDescription) ──

export function initialContextSystemPrompt(writingStyle: string): string {
  return `Você é um gerador de cenários de RPG. Crie apenas a descrição inicial de onde o jogo começa. Adapte o tom da descrição para o estilo de escrita: ${writingStyle}.`;
}

export function initialContextHumanPrompt(style: string, writingStyle: string): string {
  return `Descreva o local inicial (em até 3 frases) onde os personagens começam uma aventura do gênero ${style} no estilo de escrita ${writingStyle}. Responda em português.`;
}

export function playerCharacterSystemPrompt(writingStyle: string): string {
  return `Você é um gerador de personagens de RPG. Adapte o tom do personagem para o estilo de escrita: ${writingStyle}.`;
}

export function playerCharacterHumanPrompt(style: string, writingStyle: string, playerName: string): string {
  return [
    `Crie o protagonista '${playerName}' para uma história de ${style} no estilo de escrita ${writingStyle}.`,
    'Responda APENAS no formato abaixo (sem texto extra):',
    'Descrição: <aparência, visual e ocupação do protagonista, uma ou duas frases>',
    'Personalidade: <traços de personalidade, poucas palavras>',
  ].join('\n');
}

export function companionDescriptionSystemPrompt(writingStyle: string): string {
  return `Você é um gerador de personagens de RPG. Adapte o tom do personagem para o estilo de escrita: ${writingStyle}.`;
}

export function companionDescriptionHumanPrompt(style: string, writingStyle: string, npcName: string): string {
  return [
    `Crie um NPC companheiro chamado '${npcName}' para uma história de ${style} no estilo de escrita ${writingStyle}.`,
    'Responda APENAS no formato abaixo (sem texto extra):',
    `Descrição: <ocupação, visual e atitude do(a) ${npcName}, uma ou duas frases>`,
    'Personalidade: <traços de personalidade, poucas palavras>',
  ].join('\n');
}

// ── Memory Summarization & World Context Update ──

export function summarizeSystemPrompt(): string {
  return [
    'Você é um assistente de RPG encarregado de condensar a história de uma campanha.',
    'Sua tarefa é resumir o histórico de eventos anteriores em um parágrafo compacto, mantendo fatos importantes, personagens envolvidos e descobertas.',
    'Responda em português de forma direta, sem introduções ou saudações.'
  ].join('\n');
}

export function summarizeHumanPrompt(oldSummary: string | undefined, oldestTurns: string[]): string {
  const parts = [];
  if (oldSummary) {
    parts.push(`Resumo anterior das memórias de longo prazo:\n${oldSummary}\n`);
  }
  parts.push(`Novos eventos a serem incorporados e sumarizados:\n${oldestTurns.join('\n\n')}`);
  parts.push('\nPor favor, consolide as informações acima em um único parágrafo compacto que resuma toda a história até aqui.');
  return parts.join('\n');
}

export function updateWorldContextSystemPrompt(): string {
  return [
    'Você é um assistente de RPG encarregado de extrair o estado atual do ambiente e local dos personagens.',
    'Com base no contexto do cenário atual e nos novos acontecimentos, gere uma descrição concisa do novo local e estado do ambiente (onde os personagens estão, o que mudou visivelmente no espaço ao redor deles).',
    'Escreva em português, de forma direta e concisa (máximo 3 frases).'
  ].join('\n');
}

export function updateWorldContextHumanPrompt(currentContext: string, lastNarration: string): string {
  return [
    `Contexto do Cenário Atual:\n${currentContext}`,
    '',
    `Últimos Acontecimentos (Narração):\n${lastNarration}`,
    '',
    'Gere a descrição concisa do local/estado atual atualizado:'
  ].join('\n');
}
