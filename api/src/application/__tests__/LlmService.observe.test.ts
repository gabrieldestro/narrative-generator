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

describe('LlmService.generateObservation', () => {
  it('deve invocar o LLM com os prompts de observação e retornar o conteúdo', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'O balcão guarda marcas de décadas de uso.' }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.generateObservation(makeState(), 'O que percebo no balcão?', 'Elias');

    expect(result).toBe('O balcão guarda marcas de décadas de uso.');
    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);

    const messages = mockLlm.invoke.mock.calls[0]![0] as { content: string }[];
    const systemContent = messages[0]!.content;
    const humanContent = messages[1]!.content;
    expect(systemContent).toContain('Fantasia Medieval');
    expect(systemContent).toContain('OBSERVAÇÃO');
    expect(systemContent).toContain('NÃO avance a história');
    expect(humanContent).toContain('Elias');
    expect(humanContent).toContain('O que percebo no balcão?');
    expect(humanContent).toContain('Uma taverna escura ao fim da estrada.');
    expect(humanContent).toContain('Turno 3: O grupo se aproximou do balcão de madeira.');
  });

  it('deve funcionar sem nome de personagem', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'Um cheiro de mofo impregna o ar.' }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.generateObservation(makeState(), 'Que cheiro há aqui?');

    expect(result).toBe('Um cheiro de mofo impregna o ar.');
    const messages = mockLlm.invoke.mock.calls[0]![0] as { content: string }[];
    expect(messages[1]!.content).not.toContain('Quem está observando');
  });
});
