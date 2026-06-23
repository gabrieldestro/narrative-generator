import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as process from 'process';
import type { GameState } from '../../../domain/types.js';

export const LLM_BASE_URL = process.env.OPENAI_API_BASE || 'http://localhost:1234/v1';
export const LLM_API_KEY = process.env.OPENAI_API_KEY || 'lm-studio';

export async function invokeLlm(systemPrompt: string, humanPrompt: string): Promise<string> {
  const judge = new ChatOpenAI({
    temperature: 0,
    model: 'gemma-4b',
    apiKey: LLM_API_KEY,
    configuration: { baseURL: LLM_BASE_URL },
  });
  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(humanPrompt),
  ];
  const response = await judge.invoke(messages);
  return response.content as string;
}

export function buildState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Ano 2157. Neo-Tóquio é uma cidade de contrastes: arranha-céus corporativos refletem letreiros de neon nos bairros alagados. Chuva ácida cai 300 dias por ano.',
    narrativeStyle: 'Ação / Sci-Fi Cyberpunk',
    writingStyle: 'Cômico / Sarcástico',
    characters: [
      { id: '1', name: 'Kael', description: 'Protagonista', personality: 'Determinado', isPlayer: true },
    ],
    history: [
      'Turno 1: Você chegou ao bar iluminado por neon "O Raio Enferrujado". Ghost já estava lá, tomando uma bebida que brilha azul.',
      'Turno 2: Um grupo de agentes da Arasaka entrou no bar e começou a fazer perguntas.',
    ],
    turnNumber: 3,
    ...overrides,
  };
}

export async function saveOutput(scenario: string, phase: string, content: string) {
  const dir = path.join(process.cwd(), 'test-output');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${scenario}_${phase}.md`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), content, 'utf-8');
}

export const pularTestes = process.env.SKIP_LMSTUDIO_CHECK === '1';
export const describeIf = pularTestes ? describe.skip : describe;
