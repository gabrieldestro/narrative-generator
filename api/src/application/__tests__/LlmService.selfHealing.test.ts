import { describe, it, expect, vi } from 'vitest';
import { LlmService } from '../LlmService.js';
import type { GameState } from '../../domain/types.js';

const contextOverflowError = new Error(
  "This model's maximum context length is 2048 tokens. However, you requested 3000 tokens (context length exceeded).",
);

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Uma taverna escura na encruzilhada dos reinos.',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    turnNumber: 3,
    history: [
      'Turno 1: Kael chegou à taverna e encontrou Elara.',
      'Turno 2: Um mensageiro trouxe um pergaminho selado.',
    ],
    characters: [
      { id: '1', name: 'Kael', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Taverna' },
    ],
    ...overrides,
  };
}

describe('LlmService.arbitrateLogic (self-healing de contexto)', () => {
  it('deve reduzir o histórico em retry e não mutar o state', async () => {
    const mockLlm = {
      invoke: vi.fn()
        .mockRejectedValueOnce(contextOverflowError)
        .mockResolvedValueOnce({ content: 'Kael tentou abrir a porta -> Sucesso.' }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);
    const state = makeState();
    const recentHistory = state.history.slice(-2);
    const originalHistory = [...state.history];

    const result = await service.arbitrateLogic(state, ['Kael abre a porta'], recentHistory);

    expect(result).toBe('Kael tentou abrir a porta -> Sucesso.');
    expect(mockLlm.invoke).toHaveBeenCalledTimes(2);

    const firstHuman = mockLlm.invoke.mock.calls[0]![0][1].content as string;
    const secondHuman = mockLlm.invoke.mock.calls[1]![0][1].content as string;

    expect(firstHuman).toContain('Turno 1: Kael chegou à taverna');
    expect(secondHuman).not.toContain('Turno 1: Kael chegou à taverna');
    expect(secondHuman).toContain('Turno 2: Um mensageiro');

    expect(state.history).toEqual(originalHistory);
  });
});

describe('LlmService.extractStateChanges (reparo de JSON)', () => {
  it('deve reparar JSON inválido na segunda chamada', async () => {
    const validChanges = JSON.stringify({
      inventoryChanges: [{ characterName: 'Kael', action: 'add', item: 'Lanterna' }],
      locationChanges: { discovered: [], newConnections: [] },
      characterLifecycle: [],
    });
    const mockLlm = {
      invoke: vi.fn()
        .mockResolvedValueOnce({ content: 'isso não é um JSON' })
        .mockResolvedValueOnce({ content: validChanges }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.extractStateChanges(makeState(), 'Kael pega a lanterna.');

    expect(result.inventoryChanges).toEqual([{ characterName: 'Kael', action: 'add', item: 'Lanterna' }]);
    expect(mockLlm.invoke).toHaveBeenCalledTimes(2);
  });

  it('deve retornar defaults se o reparo falhar', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'ainda inválido' }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any, { maxHealRetries: 1 });

    const result = await service.extractStateChanges(makeState(), 'Narração qualquer.');

    expect(result).toEqual({
      inventoryChanges: [],
      locationChanges: { discovered: [], newConnections: [] },
      characterLifecycle: [],
    });
  });
});

describe('LlmService.extractCharacterLocations (reparo de JSON)', () => {
  it('deve reparar mapa de localizações inválido', async () => {
    const mockLlm = {
      invoke: vi.fn()
        .mockResolvedValueOnce({ content: 'nenhum json aqui' })
        .mockResolvedValueOnce({ content: JSON.stringify({ Kael: 'Masmorra' }) }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.extractCharacterLocations(makeState(), 'Kael desce para a masmorra.');

    expect(result['Kael']).toBe('Masmorra');
    expect(mockLlm.invoke).toHaveBeenCalledTimes(2);
  });

  it('mantém local anterior quando o reparo não cobre o personagem', async () => {
    const mockLlm = {
      invoke: vi.fn()
        .mockResolvedValueOnce({ content: 'inválido' })
        .mockResolvedValueOnce({ content: JSON.stringify({ Outro: 'Fora' }) }),
      stream: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    const result = await service.extractCharacterLocations(makeState(), 'Narração.');

    expect(result['Kael']).toBe('Taverna');
  });
});

describe('LlmService.narrateFiction (retry pré-stream)', () => {
  it('deve reenviar por invoke completo com contexto reduzido quando o stream estourar o contexto', async () => {
    const mockLlm = {
      stream: vi.fn().mockRejectedValue(contextOverflowError),
      invoke: vi.fn().mockResolvedValue({ content: 'Narração completa após redução.' }),
    };
    const service = new LlmService(mockLlm as any);
    const state = makeState();

    const result = await service.narrateFiction(state, ['Kael tenta: Abrir a porta'], 'Kael tentou abrir -> Sucesso.');

    expect(result).toBe('Narração completa após redução.');
    expect(mockLlm.invoke).toHaveBeenCalled();
    expect(state.history).toHaveLength(2);
  });

  it('propaga erro que não é de contexto', async () => {
    const mockLlm = {
      stream: vi.fn().mockRejectedValue(new Error('connection reset')),
      invoke: vi.fn(),
    };
    const service = new LlmService(mockLlm as any);

    await expect(
      service.narrateFiction(makeState(), ['Ação'], 'Resolução.'),
    ).rejects.toThrow('connection reset');
    expect(mockLlm.invoke).not.toHaveBeenCalled();
  });
});
