import { describe, it, expect } from 'vitest';
import {
  describeSceneSystemPrompt,
  describeSceneHumanPrompt,
  narratorSystemPrompt,
  narratorHumanPrompt,
} from '../prompts.js';
import { DEFAULT_SETTINGS, DEFAULT_NARRATION_SIZE_PROMPTS } from '../../domain/types.js';
import type { GameState } from '../../domain/types.js';

const NARRATION_SIZE_PROMPT = DEFAULT_NARRATION_SIZE_PROMPTS[DEFAULT_SETTINGS.narrationSize];

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Uma taverna sombria na encruzilhada dos reinos.',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    turnNumber: 3,
    history: ['Turno 1: Você chegou à taverna.'],
    characters: [
      { id: '1', name: 'Aric', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Taverna' },
    ],
    ...overrides,
  };
}

describe('describeSceneSystemPrompt', () => {
  it('deve conter o gênero e o estilo de escrita', () => {
    const prompt = describeSceneSystemPrompt(makeState());
    expect(prompt).toContain('Fantasia Medieval');
    expect(prompt).toContain('Épico / Poético');
  });

  it('deve instruir a descrever apenas o local, sem ações nem personagens', () => {
    const prompt = describeSceneSystemPrompt(makeState());
    expect(prompt.toLowerCase()).toContain('apenas a descrição do local');
    expect(prompt.toLowerCase()).toContain('sem narrar ações nem falas');
    expect(prompt.toLowerCase()).toContain('não descreva personagens');
  });

  it('deve limitar a resposta a poucas frases em português', () => {
    const prompt = describeSceneSystemPrompt(makeState());
    expect(prompt).toContain('até 3 frases');
    expect(prompt.toLowerCase()).toContain('em português');
  });
});

describe('describeSceneHumanPrompt', () => {
  it('deve incluir o local atual e o contexto do mundo', () => {
    const prompt = describeSceneHumanPrompt(makeState(), 'Caverna Sombria');
    expect(prompt).toContain('Caverna Sombria');
    expect(prompt).toContain('Uma taverna sombria na encruzilhada dos reinos.');
  });
});

describe('narratorSystemPrompt', () => {
  it('deve instruir o narrador a NÃO redescrever o cenário', () => {
    const prompt = narratorSystemPrompt(makeState(), NARRATION_SIZE_PROMPT);
    expect(prompt.toUpperCase()).toContain('NÃO DESCREVA NOVAMENTE O CENÁRIO');
    expect(prompt).toContain('já foi estabelecido');
    expect(prompt).toContain('mudança RELEVANTE');
  });

  it('deve manter a instrução de narrar ações se desenrolando', () => {
    const prompt = narratorSystemPrompt(makeState(), NARRATION_SIZE_PROMPT);
    expect(prompt).toContain('Narre cada ação se desenrolando momento a momento');
  });
});

describe('narratorHumanPrompt', () => {
  it('deve continuar recebendo histórico, locais e ações para a narração', () => {
    const actions = ['Aric tenta: Examinar a porta (Resultado do dado d20: 15)'];
    const resolution = 'Aric tentou examinar -> Sucesso.';
    const prompt = narratorHumanPrompt(makeState(), actions, resolution);

    expect(prompt).toContain('Turno 1: Você chegou à taverna.');
    expect(prompt).toContain('Aric está em: Taverna');
    expect(prompt).toContain('O que cada personagem está fazendo neste exato momento:');
    expect(prompt).toContain('Aric tenta: Examinar a porta (Resultado do dado d20: 15)');
    expect(prompt).toContain('Guia interno da resolução');
    expect(prompt).toContain('Aric tentou examinar -> Sucesso.');
  });
});
