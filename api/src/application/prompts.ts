import type { GameState } from '../domain/types.js';

// ── Agent: Arbiter (arbitrateLogic) ──

export const arbiterSystemPrompt =
  'Você é uma máquina de regras de RPG. Apenas retorne a avaliação lógica de sucesso ou falha, ignorando a narrativa. Responda em linhas técnicas de avaliação, sem prosa, sem parágrafos literários, sem descrever a cena.';

export function arbiterHumanPrompt(state: GameState, actions: string[], recentHistory?: string[], longTermSummary?: string): string {
  const locations = state.characters
    .map(c => `${c.name} está em: ${c.currentLocation ?? 'local desconhecido'}`)
    .join('\n');
  const promptParts = [
    `Cenário atual: ${state.worldContext}`,
    '',
    `Locais dos personagens:\n${locations}`,
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
    '',
    'EXEMPLO DE RESPOSTA ESPERADA (siga este formato, sem parágrafos, sem descrever a cena; use os nomes e ações reais listados acima, não os nomes deste exemplo):',
    'Fulano tentou forçar a fechadura da porta -> Sucesso porque o dado d20=16 indica esforço excepcional e forçar uma fechadura simples é uma ação fisicamente possível.',
    'Sicrano tentou voar batendo os braços -> Falha porque voar batendo os braços é fisicamente impossível para um ser humano comum (Regra 1), independentemente do dado.',
    'Beltrano tentou lembrar o nome do antigo caseiro -> Sucesso porque d20=11 é performance normal e lembrar é uma ação comum.',
  );
  return promptParts.join('\n');
}

// ── Agent 3: Narrator (narrateFiction) ──

export function narratorSystemPrompt(
  state: GameState,
  narrationSizePrompt: string,
  unexpectedEventTriggered?: boolean,
): string {
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
    'Não tome decisões pelos personagens.',
    'Narre cada ação se desenrolando momento a momento: primeiro o personagem age, depois o ambiente/oponente reage, e então o resultado se revela. Use presente ou pretérito imperfeito para dar sensação de movimento.',
    'Destaque nomes de personagens, lugares e itens em negrito usando marcação markdown (**Nome**) na primeira vez que aparecerem na narração, para facilitar a leitura.',
    'NÃO descreva novamente o cenário/lugar onde a cena acontece — ele já foi estabelecido e apresentado ao leitor. Apenas continue a cena a partir de onde parou. Descreva o ambiente apenas se as ações deste turno provocarem uma mudança RELEVANTE nele, e nesse caso mencione somente o que mudou.',
  );
  if (unexpectedEventTriggered) {
    promptParts.push(
      'REGRA DE INTERVENÇÃO DO DESTINO (SAL E PIMENTA): Um acontecimento totalmente inesperado, fora do ordinário ou uma complicação surpresa DEVE acontecer nesta cena, alterando as circunstâncias de forma surpreendente (ex: a chegada repentina de outro personagem/criatura, um fator ambiental súbito, falha repentina de equipamento, um barulho assustador inexplicável, um achado surpresa, etc.). Introduza este evento de surpresa na narrativa de forma integrada e coerente com o tom.'
    );
  }
  promptParts.push(narrationSizePrompt);
  return promptParts.join('\n');
}

export function narratorHumanPrompt(state: GameState, actions: string[], logicalResolution: string): string {
  const locations = state.characters
    .map(c => `${c.name} está em: ${c.currentLocation ?? 'local desconhecido'}`)
    .join('\n');
  return [
    `Contexto Histórico: \n${state.history.join('\n\n')}`,
    '',
    'Localização atual dos personagens:',
    locations,
    '',
    'O que cada personagem está fazendo neste exato momento:',
    actions.join('\n'),
    '',
    'Guia interno da resolução (resultado já decidido — não cite literalmente, apenas cumpra o desfecho):',
    logicalResolution,
    '',
    'Escreva a cena em português descrevendo as ações conforme elas acontecem, considerando onde cada personagem está e como seus locais mudam (ou não) durante a ação (apenas o texto da narração):',
  ].join('\n');
}

// ── Observation (generateObservation) ──

export function observeSystemPrompt(state: GameState, narrationSizePrompt: string): string {
  return [
    `Você é o Narrador Literário de um RPG do gênero: ${state.narrativeStyle} e estilo de escrita/tom: ${state.writingStyle}.`,
    'Sua função é atender a um pedido de OBSERVAÇÃO do jogador: detalhar, expandir ou descrever com profundidade um aspecto específico da cena atual.',
    'REGRAS DA OBSERVAÇÃO (IMPORTANTE):',
    '  1. NÃO avance a história: nada de novos eventos, chegadas, reviravoltas ou descobertas mecânicas.',
    '  2. NÃO faça os personagens agirem, falarem ou se moverem — descreva apenas o que os sentidos percebem no instante presente.',
    '  3. Seja fiel ao que já foi estabelecido na cena; você pode enriquecer detalhes sensoriais e atmosféricos, mas não invente fatos novos que contradigam a cena.',
    `Adote fortemente o estilo de escrita '${state.writingStyle}' em seu vocabulário, ritmo e descrições.`,
    'Destaque nomes de personagens, lugares e itens em negrito usando marcação markdown (**Nome**) na primeira vez que aparecerem.',
    narrationSizePrompt,
  ].join('\n');
}

export function observeHumanPrompt(state: GameState, request: string, characterName?: string): string {
  const locations = state.characters
    .map(c => `${c.name} está em: ${c.currentLocation ?? 'local desconhecido'}`)
    .join('\n');
  return [
    characterName ? `Quem está observando: ${characterName}` : undefined,
    `Contexto do mundo (cenário atual): ${state.worldContext}`,
    '',
    'Localização atual dos personagens:',
    locations,
    '',
    'Histórico recente da cena (onde a narrativa parou):',
    state.history.join('\n\n'),
    '',
    `Pedido de observação do jogador: "${request}"`,
    '',
    'Escreva apenas o texto da observação em português, no estilo do gênero e tom da história, sem citar o pedido nem usar aspas:',
  ].filter((part): part is string => typeof part === 'string').join('\n');
}

// ── Scene Description (generateSceneDescription) ──

export function describeSceneSystemPrompt(state: GameState): string {
  return [
    `Você é o Narrador Literário de um RPG do gênero: ${state.narrativeStyle} e estilo de escrita/tom: ${state.writingStyle}.`,
    'Sua função é escrever APENAS a descrição do local/cenário onde os personagens estão, SEM narrar ações nem falas.',
    `Adote fortemente o estilo de escrita '${state.writingStyle}' em seu vocabulário, ritmo e descrições.`,
    'Crie uma descrição imersiva e sensorial do lugar, como a abertura de uma cena, apresentando o ambiente em que a ação vai acontecer.',
    'Não descreva personagens nem o que eles estão fazendo.',
    'Escreva em português, em até 3 frases.',
  ].join('\n');
}

export function describeSceneHumanPrompt(state: GameState, location: string): string {
  return [
    `Local atual: ${location}`,
    `Contexto do mundo: ${state.worldContext}`,
    '',
    'Escreva a descrição deste local (apenas o texto da descrição):',
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
  const chars = state.characters.map(c => {
    let line = `${c.name} — ${c.description}. Personalidade: ${c.personality}`;
    if (c.currentLocation) line += `. Local inicial: ${c.currentLocation}`;
    return line;
  }).join('\n');
  return [
    `Cenário: ${state.worldContext}`,
    '',
    'Personagens:',
    chars,
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

// ── Location Extraction ──

export function extractLocationSystemPrompt(): string {
  return 'Você é um assistente de RPG que extrai a localização atual dos personagens com base na narração.';
}

export const LOCATION_MAP_FORMAT_SPEC = `{
  "Nome do Personagem 1": "Nome do local",
  "Nome do Personagem 2": "Nome do local"
}`;

export function extractLocationHumanPrompt(characters: { id: string; name: string; currentLocation: string | undefined }[], narration: string): string {
  const chars = characters.map(c => `- ${c.name} (local atual: ${c.currentLocation ?? 'desconhecido'})`).join('\n');
  return [
    'Com base na narração abaixo, determine o local/ambiente onde cada personagem terminou este turno.',
    'Se um personagem não mudou de local, mantenha o local anterior.',
    'Se houver dúvida, mantenha o local anterior do personagem.',
    'Retorne APENAS um JSON válido com o nome de cada personagem como chave e o local como valor.',
    '',
    'Formato esperado:',
    LOCATION_MAP_FORMAT_SPEC,
    '',
    'Personagens:',
    chars,
    '',
    'Narração:',
    narration,
    '',
    'JSON:',
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

// ── World State Incremental Extractor (LlmStateExtractor) ──

export function extractStateChangesSystemPrompt(): string {
  return [
    'Você é um parser analítico de RPG especializado em extrair mutações estruturais de estado a partir de narrativas textuais literárias.',
    'Sua resposta deve ser estritamente um objeto JSON válido, sem texto explicativo antes ou depois, sem blocos markdown extras se possível, ou encapsulado em ```json ```.',
    'Siga atentamente as seguintes regras para identificar alterações:',
    '',
    '1. ALTERAÇÃO DE INVENTÁRIO (inventoryChanges):',
    '   - Detecte se algum personagem obteve/pegou (action: "add") ou descartou/perdeu/usou até acabar (action: "remove") itens tangíveis.',
    '   - Exemplo: "Elias pega a chave" -> add "Chave de Bronze" (ou similar); "Morgana joga fora sua lanterna quebrada" -> remove "Lanterna Quebrada".',
    '',
    '2. DESCOBERTA DE LOCAIS (locationChanges):',
    '   - Se a narrativa revelar explicitamente uma nova área física conectada (ex: uma porta secreta se abre para o "Porão", ou eles descem para o "Túnel Sombrio"), adicione essa área em "discovered" com um id descritivo (camelCase), o nome legível, descrição concisa e conectividade inicial.',
    '   - Adicione também conexões bidirecionais se apropriado em "newConnections" (ex: de local_atual para novo_local).',
    '',
    '3. CICLO DE VIDA DE PERSONAGENS (characterLifecycle):',
    '   - Morte ou Desaparecimento: Se um personagem ativo morreu, foi pulverizado, desintegrou-se ou sumiu/perdeu-se na neblina sem rumo, defina seu status como "dead" ou "lost".',
    '   - Novo Personagem: Se um novo NPC apareceu ativamente e interagiu ou foi introduzido em detalhes, defina seu status como "discovered" e preencha descrição, personalidade e a localização inicial dele.',
    '',
    'Qualquer campo não modificado não deve constar na resposta JSON. Mantenha os arrays vazios se não houver modificações correspondentes.'
  ].join('\n');
}

export const STATE_CHANGES_FORMAT_SPEC = `{
  "inventoryChanges": [
    { "characterName": "Nome", "action": "add" | "remove", "item": "Nome do Item" }
  ],
  "locationChanges": {
    "discovered": [
      { "id": "id_unico", "name": "Nome", "description": "Breve descrição", "connectedTo": ["ids_vizinhos"] }
    ],
    "newConnections": [
      { "from": "id_origem", "to": "id_destino" }
    ]
  },
  "characterLifecycle": [
    { "characterName": "Nome", "status": "dead" | "lost" | "active" | "discovered", "description": "Se discovered", "personality": "Se discovered", "location": "ID do local se discovered" }
  ]
}`;

export function extractStateChangesHumanPrompt(state: GameState, lastNarration: string): string {
  const charsInfo = state.characters
    .map(c => `- ${c.name} (Status: ${c.status || 'active'}, Local: ${c.currentLocation ?? 'Ponto de Partida'}, Inventário: [${c.inventory ? c.inventory.join(', ') : ''}])`)
    .join('\n');
  const locationsInfo = (state.locations || [])
    .map(l => `- ID: ${l.id} ("${l.name}", Conecta com: [${l.connectedTo ? l.connectedTo.join(', ') : ''}])`)
    .join('\n');

  return [
    '### ESTADO ATUAL DO JOGO:',
    'Personagens:',
    charsInfo,
    '',
    'Mapa de Localizações Conhecidas:',
    locationsInfo,
    '',
    '### ÚLTIMA NARRATIVA LITERÁRIA DO TURNO:',
    lastNarration,
    '',
    '### INSTRUÇÕES:',
    'Gere o JSON com as alterações incrementais do estado do jogo com base APENAS na Última Narrativa Literária acima.',
    'Formato esperado:',
    STATE_CHANGES_FORMAT_SPEC,
    '',
    'JSON:'
  ].join('\n');
}

// ── Character Sheet Extraction from History ──

export function extractCharacterFromHistorySystemPrompt(): string {
  return [
    'Você é um parser de RPG especializado em criar fichas de personagens a partir de textos narrativos.',
    'Sua tarefa é analisar um trecho de história e extrair dados estruturados de um personagem específico mencionado nela.',
    'Responda APENAS com um JSON válido, sem texto antes ou depois.',
  ].join('\n');
}

export const CHARACTER_SHEET_FORMAT_SPEC = `{
  "name": "Nome exato do personagem",
  "description": "Aparência, ocupação e background (1-2 frases)",
  "personality": "Traços de personalidade observados no texto (poucas palavras)",
  "currentLocation": "Último local onde o personagem foi visto no texto"
}`;

export function extractCharacterFromHistoryHumanPrompt(
  characterName: string,
  historyExcerpt: string,
  narrativeStyle: string,
): string {
  return [
    `Analise o texto abaixo e extraia os dados do personagem chamado "${characterName}".`,
    `A história é do gênero: ${narrativeStyle}.`,
    '',
    '### TRECHO DO HISTÓRICO:',
    historyExcerpt,
    '',
    '### INSTRUÇÕES:',
    `Com base APENAS no texto acima, gere a ficha do personagem "${characterName}".`,
    'Se algum campo não puder ser inferido do texto, invente algo coerente com o gênero da história.',
    '',
    'Responda APENAS com o JSON no formato:',
    CHARACTER_SHEET_FORMAT_SPEC,
    '',
    'JSON:',
  ].join('\n');
}

// ── JSON Repair (Self-Healing) ──

export const jsonRepairSystemPrompt = [
  'Você é um assistente especializado em corrigir respostas de IA que deveriam ser JSON estruturado.',
  'Sua resposta deve conter APENAS o JSON corrigido, sem markdown, sem texto antes ou depois.',
  'Mantenha o formato exato especificado. Se a resposta anterior estava cortada/longa demais, reduza o número de itens e retorne apenas o essencial (arrays podem ficar vazios).',
].join('\n');

export function jsonRepairHumanPrompt(invalidJson: string, schemaSpec: string, compact = false): string {
  return [
    'Sua resposta anterior não era um JSON válido para o formato pedido.',
    'Abaixo está a resposta inválida retornada:',
    '--- INÍCIO DA RESPOSTA INVÁLIDA ---',
    invalidJson,
    '--- FIM DA RESPOSTA INVÁLIDA ---',
    '',
    'Corrija-a e retorne APENAS o JSON válido, no formato exato especificado abaixo:',
    '',
    schemaSpec,
    '',
    ...(compact ? ['Se a resposta estiver muito longa e tiver sido cortada, reduza o número de itens e retorne apenas o essencial. Arrays podem ficar vazios.', ''] : []),
    'JSON:',
  ].join('\n');
}

export function contextReductionNote(level: number): string {
  return `Atenção: parte do histórico foi condensada para caber no contexto (nível de redução ${level}). Continue coerente com o resumo e com as ações deste turno.`;
}
