import { describe, it, expect, vi } from 'vitest';
import { LlmService } from '../LlmService.js';
import type { GameState } from '../../domain/types.js';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Uma floresta densa ao entardecer.',
    narrativeStyle: 'Terror de Sobrevivência',
    writingStyle: 'Terror Sombrio',
    turnNumber: 4,
    history: ['Turno 3: O grupo avançou pela trilha.'],
    characters: [
      { id: '1', name: 'Elias', description: 'Jornalista', personality: 'Curioso', isPlayer: true, currentLocation: 'Casa Abandonada' },
    ],
    ...overrides,
  };
}

describe('LlmService.generateSceneDescription', () => {
  it('deve invocar o LLM com os prompts de descrição de cenário e retornar o conteúdo', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'A casa abandonada range com o vento.' }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.generateSceneDescription(makeState(), 'Casa Abandonada');

    expect(result).toBe('A casa abandonada range com o vento.');
    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);

    const messages = mockLlm.invoke.mock.calls[0]![0] as { content: string }[];
    expect(messages[0]!.content).toContain('Terror de Sobrevivência');
    expect(messages[1]!.content).toContain('Casa Abandonada');
    expect(messages[1]!.content).toContain('Uma floresta densa ao entardecer.');
  });
});

describe('LlmService.narrateFiction', () => {
  async function* chunks() {
    yield { content: 'O grupo ' };
    yield { content: 'se move' };
    yield { content: ' com cautela.' };
  }

  it('deve concatenar a descrição do cenário ANTES da narração no retorno', async () => {
    const mockLlm = { invoke: vi.fn(), stream: vi.fn().mockImplementation(chunks) };
    const service = new LlmService(mockLlm as any);

    const state = makeState();
    const narration = await service.narrateFiction(
      state,
      ['Elias tenta: Investigar a porta (Resultado do dado d20: 15)'],
      'Elias tentou investigar -> Sucesso.',
      undefined,
      undefined,
      'Uma casa abandonada coberta de teias de aranha.',
    );

    expect(narration).toBe('Uma casa abandonada coberta de teias de aranha.\n\nO grupo se move com cautela.');
  });

  it('deve escrever a descrição do cenário no output antes dos tokens da narração', async () => {
    const mockLlm = { invoke: vi.fn(), stream: vi.fn().mockImplementation(chunks) };
    const service = new LlmService(mockLlm as any);

    const output = { write: vi.fn(), writeLine: vi.fn(), clear: vi.fn() };
    await service.narrateFiction(
      makeState(),
      ['Elias tenta: Investigar (Resultado do dado d20: 15)'],
      'Elias tentou investigar -> Sucesso.',
      output,
      undefined,
      'O porão fede a mofo e escuridão.',
    );

    expect(output.write.mock.calls[0]![0]).toBe('O porão fede a mofo e escuridão.\n\n');
    const written = output.write.mock.calls.map((c: string[]) => c[0]).join('');
    expect(written.startsWith('O porão fede a mofo e escuridão.')).toBe(true);
    expect(written).toContain('O grupo se move com cautela.');
  });

  it('deve funcionar sem descrição de cenário (comportamento original)', async () => {
    const mockLlm = { invoke: vi.fn(), stream: vi.fn().mockImplementation(chunks) };
    const service = new LlmService(mockLlm as any);

    const narration = await service.narrateFiction(
      makeState(),
      ['Elias tenta: Investigar (Resultado do dado d20: 15)'],
      'Elias tentou investigar -> Sucesso.',
    );

    expect(narration).toBe('O grupo se move com cautela.');
  });
});
