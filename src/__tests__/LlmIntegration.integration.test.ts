import { describe, it, expect, beforeAll } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { GameState, Character } from '../domain/types.js';
import {
  cpuActionSystemPrompt,
  cpuActionHumanPrompt,
  arbiterSystemPrompt,
  arbiterHumanPrompt,
  narratorSystemPrompt,
  narratorHumanPrompt,
} from '../application/prompts.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const baseUrl = process.env.OPENAI_API_BASE || 'http://localhost:1234/v1';
const apiKey = process.env.OPENAI_API_KEY || 'lm-studio';
const modelName = process.env.MODEL_NAME || 'gemma-4b';
const outputDir = path.join(process.cwd(), 'test-output');

let llm: ChatOpenAI;
let judge: ChatOpenAI;

beforeAll(async () => {
  await fs.mkdir(outputDir, { recursive: true });

  llm = new ChatOpenAI({
    temperature: 0.7,
    modelName,
    openAIApiKey: apiKey,
    configuration: { baseURL: baseUrl },
  });
  judge = new ChatOpenAI({
    temperature: 0,
    modelName,
    openAIApiKey: apiKey,
    configuration: { baseURL: baseUrl },
  });

  const connected = await checkConnection();
  if (!connected) {
    throw new Error(
      `LM Studio não está rodando em ${baseUrl} com o modelo ${modelName}. ` +
      `Inicie o servidor e execute: npm run test:integration`
    );
  }
});

async function checkConnection(): Promise<boolean> {
  try {
    const response = await llm.invoke([new HumanMessage('Responda apenas: OK')], {
      timeout: 10000,
    });
    return (response.content as string).includes('OK');
  } catch {
    return false;
  }
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

async function saveTestOutput(scenario: Scenario, output: {
  npcSystemPrompt: string;
  npcAction: string;
  arbiterSystemPrompt: string;
  arbiterPrompt: string;
  arbiterResult: string;
  narratorSystemMsg: string;
  narratorHumanMsg: string;
  narration: string;
  judgeSystemMsg: string;
  judgeVerdict: string;
  passed: boolean;
}) {
  const timestamp = formatTimestamp();
  const filename = `${timestamp}_${slugify(scenario.name)}.md`;
  const filepath = path.join(outputDir, filename);

  const content = [
    `# ${scenario.name}`,
    ``,
    `**Data:** ${new Date().toLocaleString('pt-BR')}`,
    `**Modelo:** ${modelName}`,
    `**Resultado:** ${output.passed ? '✅ VALIDO' : '❌ INVALIDO'}`,
    ``,
    `---`,
    ``,
    `## Cenário`,
    ``,
    `**Gênero:** ${scenario.state.narrativeStyle}`,
    `**Estilo de Escrita:** ${scenario.state.writingStyle}`,
    `**Contexto:** ${scenario.state.worldContext}`,
    `**Turno:** ${scenario.state.turnNumber}`,
    `**Histórico:**`,
    ...scenario.state.history.map(h => `- ${h}`),
    ``,
    `---`,
    ``,
    `## 1. NPC — Decisão da Ação`,
    ``,
    `### SystemMessage`,
    `\`\`\``,
    output.npcSystemPrompt,
    `\`\`\``,
    ``,
    `### Resposta (Ação do NPC)`,
    `> ${output.npcAction}`,
    ``,
    `---`,
    ``,
    `## 2. Árbitro — Avaliação Lógica`,
    ``,
    `### SystemMessage`,
    `\`\`\``,
    output.arbiterSystemPrompt,
    `\`\`\``,
    ``,
    `### Prompt (HumanMessage)`,
    `\`\`\``,
    output.arbiterPrompt,
    `\`\`\``,
    ``,
    `### Resposta`,
    `\`\`\``,
    output.arbiterResult,
    `\`\`\``,
    ``,
    `---`,
    ``,
    `## 3. Narrador — Prosa`,
    ``,
    `### SystemMessage`,
    `\`\`\``,
    output.narratorSystemMsg,
    `\`\`\``,
    ``,
    `### HumanMessage`,
    `\`\`\``,
    output.narratorHumanMsg,
    `\`\`\``,
    ``,
    `### Narração (Streaming)`,
    `\`\`\``,
    output.narration,
    `\`\`\``,
    ``,
    `---`,
    ``,
    `## 4. Juiz — Verdicto Final`,
    ``,
    `### SystemMessage`,
    `\`\`\``,
    output.judgeSystemMsg,
    `\`\`\``,
    ``,
    `### Resposta`,
    `> ${output.judgeVerdict}`,
    ``,
  ].join('\n');

  await fs.writeFile(filepath, content, 'utf-8');
  console.log(`  Output salvo: ${filepath}`);
}

interface Scenario {
  name: string;
  state: GameState;
  npc: Character;
  playerAction: string;
}

const scenarios: Scenario[] = [
  {
    name: 'Cyberpunk + Cômico/Sarcástico: Full pipeline',
    state: {
      worldContext: 'Numa rua molhada de neon no setor 7 de Neo-Tóquio. Letreiros piscam em japonês e coreano. O cheiro de óleo queimado e comida de rua se mistura no ar úmido.',
      narrativeStyle: 'Ação / Sci-Fi Cyberpunk',
      writingStyle: 'Cômico / Sarcástico',
      turnNumber: 3,
      history: [
        'Turno 1: Jogador e Elara chegam ao setor 7 procurando um contato chamado "Rato".',
        'Turno 2: Eles encontram um terminal público que precisa ser hackeado para obter a localização do Rato.',
        'Elara tenta: Examinar o terminal em busca de vulnerabilidades.',
        'Resultado Mecânico: Elara examinou o terminal -> Sucesso porque encontra uma porta USB exposta.',
      ],
      characters: [],
    },
    npc: {
      id: '2',
      name: 'Elara',
      description: 'Uma hacker de rua com implantes neurais de terceira geração, jaqueta de couro gasta e piercings faciais. Conhecida nos fóruns do submundo como "Ghost".',
      personality: 'Furtiva, desconfiada, sarcástica e altamente habilidosa com tecnologia. Tem um senso de humor ácido.',
      isPlayer: false,
    },
    playerAction: 'Eu pergunto para Elara se ela consegue invadir o terminal.',
  },
  {
    name: 'Fantasia Medieval + Épico/Poético: Full pipeline',
    state: {
      worldContext: 'O Grande Salão do Trono do Reino de Avalon. Colunas de mármore branco se erguem até o teto abobadado, onde tochas mágicas ardem com chamas azuis. Ao fundo, o Rei Aldric senta-se no Trono de Cristal.',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
      turnNumber: 5,
      history: [
        'Turno 4: O conselho real informa que um artefato antigo foi roubado das Catacumbas Sagradas.',
        'Jogador tenta: Oferecer-se voluntário para recuperar o artefato.',
        'Resultado Mecânico: Jogador ofereceu-se -> Sucesso porque o rei aceita o juramento do herói.',
      ],
      characters: [],
    },
    npc: {
      id: '2',
      name: 'Elara',
      description: 'Uma elfa das florestas prateadas de Syl\'Valen, arqueira lendária e portadora do Arco Lunal. Seus olhos brilham com a luz das estrelas e sua presença impõe respeito.',
      personality: 'Sábia, centenária e profundamente conectada com a natureza. Fala de forma poética e raramente se apressa.',
      isPlayer: false,
    },
    playerAction: 'Eu me ajoelho diante do rei e aceito a missão.',
  },
  {
    name: 'Terror Sobrevivência + Terror Sombrio: Full pipeline',
    state: {
      worldContext: 'Mansão Blackwood, 3 da manhã. A tempestade uiva lá fora. O corredor do segundo andar range sob os pés, papéis de parede descascados revelam manchas escuras nas paredes. O ar cheira a mofo e algo metálico.',
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
      turnNumber: 7,
      history: [
        'Turno 5: Jogador e Elara encontram um diário que descreve rituais antigos no porão.',
        'Turno 6: Eles ouvem passos vindos do andar de cima, apesar de estarem sozinhos na mansão.',
        'Jogador tenta: Subir as escadas para investigar o barulho com a lanterna ligada.',
        'Resultado Mecânico: Jogador subiu as escadas -> Sucesso porque encontra uma porta entreaberta no final do corredor.',
      ],
      characters: [],
    },
    npc: {
      id: '2',
      name: 'Elara',
      description: 'Uma investigadora paranormal com cicatrizes no rosto de um encontro anterior com o sobrenatural. Olheiras profundas, roupas surradas e uma expressão permanentemente tensa.',
      personality: 'Traumatizada, paranoica e extremamente cautelosa. Fala em sussurros e está sempre olhando por cima do ombro. Desconfia de tudo.',
      isPlayer: false,
    },
    playerAction: 'Eu aponto a lanterna para a porta entreaberta e vou empurrando devagar.',
  },
];

async function runMultiAgentPipeline(scenario: Scenario): Promise<{
  npcSystemPrompt: string;
  npcAction: string;
  arbiterSystemPrompt: string;
  arbiterPrompt: string;
  arbiterResult: string;
  narratorSystemMsg: string;
  narratorHumanMsg: string;
  narration: string;
  judgeSystemMsg: string;
  judgeVerdict: string;
  passed: boolean;
}> {
  const { state, npc, playerAction } = scenario;

  // Step 1 — NPC decide ação (prompts compartilhados de prompts.ts)
  const npcSystemPrompt = cpuActionSystemPrompt(state, npc);
  const npcHumanPrompt = cpuActionHumanPrompt(state);

  const cpuMessages = [
    new SystemMessage(npcSystemPrompt),
    new HumanMessage(npcHumanPrompt),
  ];

  const cpuResponse = await llm.invoke(cpuMessages);
  const npcAction = (cpuResponse.content as string).trim();

  // Step 2 — Árbitro avalia (prompts compartilhados de prompts.ts)
  const actions = [
    `Jogador tenta: ${playerAction}`,
    `${npc.name} tenta: ${npcAction}`,
  ];

  const arbiterPrompt = arbiterHumanPrompt(state, actions);

  const arbiterMessages = [
    new SystemMessage(arbiterSystemPrompt),
    new HumanMessage(arbiterPrompt),
  ];

  const arbiterResponse = await llm.invoke(arbiterMessages);
  const arbiterResult = (arbiterResponse.content as string).trim();

  // Step 3 — Narrador escreve com streaming (prompts compartilhados de prompts.ts)
  const narratorSystemMsg = narratorSystemPrompt(state);
  const narratorHumanMsg = narratorHumanPrompt(state, actions, arbiterResult);

  const narratorMessages = [
    new SystemMessage(narratorSystemMsg),
    new HumanMessage(narratorHumanMsg),
  ];

  const stream = await llm.stream(narratorMessages);
  let narration = '';
  for await (const chunk of stream) {
    const text = chunk.content as string;
    narration += text;
  }

  // Step 4 — Juiz avalia
  const judgeSystemMsg =
    `Você é um avaliador de qualidade de RPG. Analise o texto de narração abaixo e as informações fornecidas.\n\n` +
    `Gênero: ${state.narrativeStyle}\n` +
    `Estilo de escrita: ${state.writingStyle}\n` +
    `Resolução do Árbitro: ${arbiterResult}\n\n` +
    `Avalie se a narração:\n` +
    `1. Respeita o gênero '${state.narrativeStyle}' no vocabulário e atmosfera\n` +
    `2. Respeita o estilo de escrita '${state.writingStyle}' (tom, vocabulário, ritmo)\n` +
    `3. É coerente com a resolução do Árbitro (não contradiz Sucesso/Falha)\n` +
    `4. Incorpora as ações de ambos os personagens na cena\n\n` +
    `Responda estritamente no formato: VALIDO: <explicação> ou INVALIDO: <explicação dos problemas>.`;

  const judgeResponse = await judge.invoke([
    new SystemMessage(judgeSystemMsg),
    new HumanMessage(`Texto da narração:\n\n${narration}`),
  ]);

  const judgeVerdict = (judgeResponse.content as string).trim();

  return {
    npcSystemPrompt,
    npcAction,
    arbiterSystemPrompt,
    arbiterPrompt,
    arbiterResult,
    narratorSystemMsg,
    narratorHumanMsg,
    narration,
    judgeSystemMsg,
    judgeVerdict,
    passed: judgeVerdict.toUpperCase().includes('VALIDO'),
  };
}

describe('Pipeline Multi-Agente com LLM real', () => {
  scenarios.forEach((scenario) => {
    it(scenario.name, async () => {
      const output = await runMultiAgentPipeline(scenario);

      // Salva output completo em arquivo
      await saveTestOutput(scenario, output);

      // Validações estruturais
      expect(output.npcAction.length).toBeGreaterThan(10);
      expect(output.arbiterResult.length).toBeGreaterThan(20);
      expect(output.narration.length).toBeGreaterThan(100);

      // O Árbitro deve mencionar explicitamente Sucesso ou Falha para cada ação
      const actionLines = output.arbiterResult.split('\n').filter(l => l.includes('tentou'));
      expect(actionLines.length).toBe(2);

      // LLM-as-a-Judge: o pipeline completo deve ser válido
      expect(output.judgeVerdict.toUpperCase()).toContain('VALIDO');
      expect(output.judgeVerdict.toUpperCase()).not.toContain('INVALIDO');
    });
  });
});
