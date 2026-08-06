import { describe, it, expect } from 'vitest';
import { arbiterSystemPrompt, arbiterHumanPrompt } from '../prompts.js';
import type { GameState } from '../../domain/types.js';

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

describe('arbiterSystemPrompt', () => {
  it('deve se posicionar como máquina de regras e exigir resposta técnica', () => {
    const prompt = arbiterSystemPrompt;
    expect(prompt.toLowerCase()).toContain('máquina de regras');
    expect(prompt.toLowerCase()).toContain('linhas técnicas');
    expect(prompt.toLowerCase()).toContain('sem prosa');
    expect(prompt.toLowerCase()).toContain('sem parágrafos literários');
  });
});

describe('arbiterHumanPrompt', () => {
  it('deve listar as ações e pedir avaliação no formato [Personagem] -> [Sucesso/Falha]', () => {
    const actions = ['Aric tenta: Forçar a fechadura (Resultado do dado d20: 16)'];
    const prompt = arbiterHumanPrompt(makeState(), actions);

    expect(prompt).toContain('Ações intentadas neste turno:');
    expect(prompt).toContain('Aric tenta: Forçar a fechadura (Resultado do dado d20: 16)');
    expect(prompt).toContain('-> [Sucesso/Falha]');
    expect(prompt.toLowerCase()).toContain('sem literatura');
  });

  it('deve incluir um exemplo de saída esperada com veredito e motivo', () => {
    const prompt = arbiterHumanPrompt(makeState(), ['Aric tenta: Olhar ao redor (Resultado do dado d20: 10)']);

    expect(prompt.toUpperCase()).toContain('EXEMPLO DE RESPOSTA ESPERADA');
    expect(prompt).toMatch(/-> Sucesso porque/);
    expect(prompt).toMatch(/-> Falha porque/);
  });

  it('deve conter as regras físicas de prioridade', () => {
    const prompt = arbiterHumanPrompt(makeState(), ['Aric tenta: Respirar no vácuo (Resultado do dado d20: 20)']);

    expect(prompt).toContain('REGRA 1');
    expect(prompt).toContain('REGRA 2');
    expect(prompt.toLowerCase()).toContain('fisicamente impossível');
  });
});
