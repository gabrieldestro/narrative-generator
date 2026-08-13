import { describe, it, expect, vi } from 'vitest';
import { LlmService } from '../LlmService.js';
import type { GameState } from '../../domain/types.js';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Uma taverna escura ao fim da estrada.',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    turnNumber: 4,
    history: ['Turno 3: O grupo se aproximou do balcão de madeira.'],
    characters: [
      { id: '1', name: 'Elias', description: 'Jornalista', personality: 'Curioso', isPlayer: true, currentLocation: 'Taverna do Corvo' },
    ],
    ...overrides,
  };
}

describe('LlmService.generatePlayerNarration', () => {
  it('deve invocar o LLM com os prompts de narração e retornar o conteúdo', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'Elias chuta o banco de madeira, que range e desaba no chão. A poeira dança na luz da lareira.' }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.generatePlayerNarration(makeState(), 'Elias chuta o banco de madeira e ele desaba.', 'Elias');

    expect(result).toContain('desaba');
    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);

    const messages = mockLlm.invoke.mock.calls[0]![0] as { content: string }[];
    const systemContent = messages[0]!.content;
    const humanContent = messages[1]!.content;
    expect(systemContent).toContain('Fantasia Medieval');
    expect(systemContent).toContain('NARRAÇÃO DECLARADA');
    expect(systemContent).toContain('Respeite integralmente o que o jogador declarou');
    expect(humanContent).toContain('Elias');
    expect(humanContent).toContain('Elias chuta o banco de madeira e ele desaba.');
    expect(humanContent).toContain('Uma taverna escura ao fim da estrada.');
    expect(humanContent).toContain('Turno 3: O grupo se aproximou do balcão de madeira.');
  });

  it('deve funcionar sem nome de personagem', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'A lareira se apaga em silêncio.' }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.generatePlayerNarration(makeState(), 'A lareira se apaga de repente.');

    expect(result).toBe('A lareira se apaga em silêncio.');
    const messages = mockLlm.invoke.mock.calls[0]![0] as { content: string }[];
    expect(messages[1]!.content).not.toContain('Quem está narrando');
  });
});