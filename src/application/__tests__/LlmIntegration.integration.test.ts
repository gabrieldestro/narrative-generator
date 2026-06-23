import { describe, it, expect } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
import {
  cpuActionSystemPrompt,
  cpuActionHumanPrompt,
  arbiterSystemPrompt,
  arbiterHumanPrompt,
  narratorSystemPrompt,
  narratorHumanPrompt,
} from '../prompts.js';
import type { GameState, Character } from '../../domain/types.js';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as process from 'process';

const LLM_BASE_URL = process.env.OPENAI_API_BASE || 'http://localhost:1234/v1';
const LLM_API_KEY = process.env.OPENAI_API_KEY || 'lm-studio';

async function invokeLlm(judgeSystemPrompt: string, judgeHumanPrompt: string): Promise<string> {
  const judge = new ChatOpenAI({
    temperature: 0,
    model: 'gemma-4b',
    apiKey: LLM_API_KEY,
    configuration: { baseURL: LLM_BASE_URL },
  });
  const messages = [
    new SystemMessage(judgeSystemPrompt),
    new HumanMessage(judgeHumanPrompt),
  ];
  const response = await judge.invoke(messages);
  return response.content as string;
}

function buildState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Ano 2157. Neo-Tóquio é uma cidade de contrastes: arranha-céus corporativos refletem letreiros de neon nos bairros alagados. Chuva ácida cai 300 dias por ano.',
    narrativeStyle: 'Ação / Sci-Fi Cyberpunk',
    writingStyle: 'Cômico / Sarcástico',
    characters: [
      { id: '1', name: 'Jogador', description: 'Protagonista', personality: 'Determinado', isPlayer: true },
    ],
    history: [
      'Turno 1: Você chegou ao bar iluminado por neon "O Raio Enferrujado". Ghost já estava lá, tomando uma bebida que brilha azul.',
      'Turno 2: Um grupo de agentes da Arasaka entrou no bar e começou a fazer perguntas.',
    ],
    turnNumber: 3,
    ...overrides,
  };
}

function saveOutput(scenario: string, phase: string, content: string) {
  const dir = path.join(process.cwd(), 'test-output');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${scenario}_${phase}.md`;
  return fs.mkdir(dir, { recursive: true }).then(() =>
    fs.writeFile(path.join(dir, filename), content, 'utf-8')
  );
}

const pularTestes = process.env.SKIP_LMSTUDIO_CHECK === '1';
const describeIf = pularTestes ? describe.skip : describe;

describeIf('Pipeline Multi-Agente com LLM real (LM Studio)', () => {

  it('deve executar o pipeline NPC → Árbitro → Narrador para Cyberpunk', async () => {
    const state = buildState();
    const npc: Character = {
      id: '2',
      name: 'Ghost',
      description: 'Uma netrunner com cabelo roxo neon, implantes neurais obsoletos e um senso de humor ácido.',
      personality: 'Furtiva, desconfiada, sarcástica.',
      isPlayer: false,
    };

    const npxResponse = await invokeLlm(
      cpuActionSystemPrompt(state, npc),
      cpuActionHumanPrompt(state)
    );
    await saveOutput('cyberpunk', '1-npc', npxResponse);
    expect(npxResponse.length).toBeGreaterThan(10);
    const actions = [`Jogador tenta: Investigar a mesa ao lado.`, `Ghost tenta: ${npxResponse}`];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('cyberpunk', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const narratorResponse = await invokeLlm(
      narratorSystemPrompt(state),
      narratorHumanPrompt(state, actions, arbiterResponse)
    );
    await saveOutput('cyberpunk', '3-narrator', narratorResponse);
    expect(narratorResponse.length).toBeGreaterThan(50);
  }, 60000);

  it('deve executar o pipeline NPC → Árbitro → Narrador para Fantasia Medieval', async () => {
    const state = buildState({
      worldContext: 'O reino de Aetheria está de luto. O rei Aldric jaz morto, envenenado em seu próprio banquete. Você e Elara são os únicos que suspeitam do vizir.',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
    });
    const npc: Character = {
      id: '2',
      name: 'Elara',
      description: 'Uma elfa da floresta com uma capa de couro desgastada e um arco longo esculpido em madeira prateada.',
      personality: 'Furtiva, sábia, leal.',
      isPlayer: false,
    };

    const npxResponse = await invokeLlm(
      cpuActionSystemPrompt(state, npc),
      cpuActionHumanPrompt(state)
    );
    await saveOutput('fantasia', '1-npc', npxResponse);
    expect(npxResponse.length).toBeGreaterThan(10);
    const actions = [`Jogador tenta: Examinar a taça de vinho do rei.`, `Elara tenta: ${npxResponse}`];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('fantasia', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const narratorResponse = await invokeLlm(
      narratorSystemPrompt(state),
      narratorHumanPrompt(state, actions, arbiterResponse)
    );
    await saveOutput('fantasia', '3-narrator', narratorResponse);
    expect(narratorResponse.length).toBeGreaterThan(50);
  }, 60000);

  it('deve executar o pipeline NPC → Árbitro → Narrador para Terror', async () => {
    const state = buildState({
      worldContext: 'O Asilo Blackwood está abandonado há 40 anos. Os locais dizem que os pacientes nunca foram embora. Sua lanterna pisca no corredor úmido.',
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
    });
    const npc: Character = {
      id: '2',
      name: 'Marcus',
      description: 'Um ex-detetive policial com a mão trêmula e uma garrafa de uísque no bolso do casaco. Ele sabe algo que não está contando.',
      personality: 'Cínico, traumatizado, relutante.',
      isPlayer: false,
    };

    const npxResponse = await invokeLlm(
      cpuActionSystemPrompt(state, npc),
      cpuActionHumanPrompt(state)
    );
    await saveOutput('terror', '1-npc', npxResponse);
    expect(npxResponse.length).toBeGreaterThan(10);
    const actions = [`Jogador tenta: Apontar a lanterna para o corredor escuro.`, `Marcus tenta: ${npxResponse}`];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('terror', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const narratorResponse = await invokeLlm(
      narratorSystemPrompt(state),
      narratorHumanPrompt(state, actions, arbiterResponse)
    );
    await saveOutput('terror', '3-narrator', narratorResponse);
    expect(narratorResponse.length).toBeGreaterThan(50);
  }, 60000);
});
