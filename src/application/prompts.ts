import type { GameState } from '../domain/types.js';

// ── Agent: Arbiter (arbitrateLogic) ──

export const arbiterSystemPrompt =
  'Você é uma máquina de regras de RPG. Apenas retorne a avaliação lógica de sucesso ou falha, ignorando a narrativa.';

export function arbiterHumanPrompt(state: GameState, actions: string[], recentHistory?: string[], longTermSummary?: string): string {
  const promptParts = [
    `Cenário atual: ${state.worldContext}`,
    '',
  ];
  if (recentHistory && recentHistory.length > 0) {
    promptParts.push('Histórico recente:');
    promptParts.push(recentHistory.join('\n'));
    promptParts.push('');
  }
  if (longTermSummary) {
    promptParts.push(`Memória de longo prazo (resumo dos eventos anteriores): ${longTermSummary}`);
    promptParts.push('');
  }
  promptParts.push(
    'Ações intentadas neste turno:',
    actions.join('\n'),
    '',
    'Instruções — avalie cada ação NESTA ORDEM DE PRIORIDADE:',
    '',
    'REGRA 1 — VERIFICAÇÃO FÍSICA ABSOLUTA (prioridade máxima, ignora o dado):',
    '   Se a ação é fisicamente IMPOSSÍVEL para qualquer ser humano comum (ex: voar batendo os braços, respirar no vácuo sem equipamento), a ação SEMPRE FALHA, independentemente do resultado do dado d20.',
    '',
    'REGRA 2 — INFLUÊNCIA DO DADO d20 (aplicar somente se passou na Regra 1):',
    '   - d20 entre 1 e 5: Azar, distração ou fraqueza momentânea. A ação DEVE FALHAR de forma desajeitada (d20=1 é falha crítica dramática).',
    '   - d20 entre 15 e 20: Sorte ou esforço excepcional. A ação DEVE TER SUCESSO de forma notável (d20=20 é sucesso crítico perfeito).',
    '   - d20 entre 6 e 14: Performance física normal. Ações que qualquer pessoa comum faz com o próprio corpo (falar, rir, assobiar, caminhar, pegar objetos, abrir portas) são SUCESSO. Falha apenas se exigir habilidade especial que o personagem nitidamente não possui.',
    '',
    'NÃO use o gênero da história ou o estilo de escrita para negar ou aprovar ações.',
    'Responda de forma CRUA e DIRETA, sem literatura.',
    'Para cada ação diga: [Personagem] tentou [Ação] -> [Sucesso/Falha] porque [Motivo físico baseado na regra aplicada e no dado d20].',
  );
  return promptParts.join('\n');
}

// ── Agent 3: Narrator (narrateFiction) ──

export function narratorSystemPrompt(state: GameState, unexpectedEventTriggered?: boolean): string {
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
  if (unexpectedEventTriggered) {
    promptParts.push(
      'REGRA DE INTERVENÇÃO DO DESTINO (SAL E PIMENTA): Um acontecimento totalmente inesperado, fora do ordinário ou uma complicação surpresa DEVE acontecer nesta cena, alterando as circunstâncias de forma surpreendente (ex: a chegada repentina de outro personagem/criatura, um fator ambiental súbito, falha repentina de equipamento, um barulho assustador inexplicável, um achado surpresa, etc.). Introduza este evento de surpresa na narrativa de forma integrada e coerente com o tom.'
    );
  }
  promptParts.push(
    'Seja extremamente conciso(a). Escreva APENAS 2 a 3 frases curtas e COMPLETAS (máximo ~150 tokens). Finalize a cena com ponto final — nunca pare no meio de uma frase ou pensamento.'
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
