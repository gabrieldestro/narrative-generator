import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from '../GameEngine.js';
import { LlmService } from '../LlmService.js';
import { CpuReflectionService } from '../npcAgent/CpuReflectionService.js';
import type { GameState } from '../../domain/types.js';
import type { IUserInput, IOutputWriter } from '../../domain/ports.js';
import type { IStateRepository } from '../../infrastructure/JsonStateRepository.js';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Uma vila sombria no pé da montanha.',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    turnNumber: 2,
    history: ['Turno 1: Você chegou à vila.'],
    characters: [
      { id: '1', name: 'Aric', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Taverna' },
    ],
    ...overrides,
  };
}

function buildEngine() {
  const mockInput: IUserInput = { question: vi.fn().mockResolvedValue(''), close: vi.fn() };
  const mockOutput: IOutputWriter = { write: vi.fn(), writeLine: vi.fn(), clear: vi.fn() };
  const mockRepo: IStateRepository = { load: vi.fn(), save: vi.fn() };

  const mockLlm = {
    invoke: vi.fn().mockResolvedValue({ content: 'mock' }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { content: ' narração mockada.' };
    }),
  };
  const llmService = new LlmService(mockLlm as any);

  vi.spyOn(llmService, 'updateWorldContext').mockResolvedValue('Contexto atualizado.');

  const runTurn = vi.fn(async (_state: GameState, _actions: Map<string, string>, opts?: { sceneDescription?: string }) => ({
    narrative: opts?.sceneDescription ? `${opts.sceneDescription}\n\nnarração mockada.` : 'narração mockada.',
    logicalResolution: 'Resolução lógica.',
    npcDecisions: [],
    diceRolls: [],
    npcOrder: ['Aric'],
    microTrace: [],
    pendingMoves: [],
  }));
  const microOrchestrator = { runTurn, updateSettings: vi.fn() };

  const mockCpuReflection = {
    reflectAndAct: vi.fn(),
    recordArbiterResult: vi.fn(),
  } as unknown as CpuReflectionService;

  const engine = new GameEngine(
    mockInput,
    mockOutput,
    mockRepo,
    llmService,
    mockCpuReflection,
    undefined,
    { arbiterHistoryTurns: 0, memoryWindowSize: 10 },
    undefined,
    undefined,
    undefined,
    microOrchestrator as any,
  );

  return { engine, llmService, mockLlm, mockOutput, runTurn };
}

describe('GameEngine — descrição de cenário por mudança de local', () => {
  it('deve gerar descrição de cenário quando o jogador está num local diferente do último descrito', async () => {
    const state = makeState({ lastSceneLocation: 'Vila' }); // jogador agora em 'Taverna'
    const { engine, llmService, runTurn } = buildEngine();

    const genSceneSpy = vi.spyOn(llmService, 'generateSceneDescription').mockResolvedValue('A taverna cheira a alecrim e fumaça.');

    const result = await engine.processTurn(state, new Map([['Aric', 'Investigar o bar']]));

    expect(genSceneSpy).toHaveBeenCalledTimes(1);
    expect(genSceneSpy).toHaveBeenCalledWith(state, 'Taverna');
    // A descrição é repassada ao orquestrador (prefixo do 1º micro).
    expect(runTurn).toHaveBeenCalledOnce();
    expect(runTurn.mock.calls[0]![2]?.sceneDescription).toBe('A taverna cheira a alecrim e fumaça.');
    expect(result.narrative).toBe('A taverna cheira a alecrim e fumaça.\n\nnarração mockada.');
    expect(state.lastSceneLocation).toBe('Taverna');
  });

  it('NÃO deve gerar descrição de cenário quando o jogador continua no mesmo local', async () => {
    const state = makeState({ lastSceneLocation: 'Taverna' });
    const { engine, llmService, runTurn } = buildEngine();

    const genSceneSpy = vi.spyOn(llmService, 'generateSceneDescription');

    const result = await engine.processTurn(state, new Map([['Aric', 'Pedir uma bebida']]));

    expect(genSceneSpy).not.toHaveBeenCalled();
    expect(runTurn.mock.calls[0]![2]?.sceneDescription).toBeUndefined();
    expect(result.narrative).toBe('narração mockada.');
    expect(state.lastSceneLocation).toBe('Taverna');
  });

  it('deve manter lastSceneLocation inalterado quando o jogador não tem local definido', async () => {
    const state = makeState({ lastSceneLocation: 'Vila' });
    delete state.characters[0]!.currentLocation;
    const { engine, llmService, runTurn } = buildEngine();

    const genSceneSpy = vi.spyOn(llmService, 'generateSceneDescription');

    await engine.processTurn(state, new Map([['Aric', 'Observar o ambiente']]));

    expect(genSceneSpy).not.toHaveBeenCalled();
    expect(runTurn.mock.calls[0]![2]?.sceneDescription).toBeUndefined();
    expect(state.lastSceneLocation).toBe('Vila');
  });
});
