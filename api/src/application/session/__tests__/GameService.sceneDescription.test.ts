import { describe, it, expect, vi } from 'vitest';
import { GameService } from '../GameService.js';
import { LlmService } from '../../shared/LlmService.js';
import { CharacterService } from '../../characters/CharacterService.js';
import type { GameState } from '../../../domain/types.js';
import type { IUserInput, IOutputWriter } from '../../../domain/ports.js';
import type { IStateRepository } from '../../../infrastructure/persistence/JsonStateRepository.js';

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

  const startAction = vi.fn(async (_state: GameState, actor: { name: string }, actions: Map<string, string>) => {
    const text = actions.get(actor.name) ?? `${actor.name} age.`;
    return {
      actor,
      actorWhere: 'Taverna',
      text,
      reasoning: '',
      roll: 11,
      diceRoll: { characterName: actor.name, roll: 11, isGodMode: false },
      action: { actor: actor.name, text, roll: 11 },
      allowed: [],
      denied: [],
      ordered: [],
    };
  });
  const orchestrator = {
    activeRoster: vi.fn((state: GameState) =>
      state.characters.filter((c) => !c.status || c.status === 'active')),
    spotlightOrder: vi.fn((roster: GameState['characters']) => roster),
    startAction,
    resolveReaction: vi.fn(),
    arbitrateAction: vi.fn(async () => ({ outcome: 'success', violent: false, reason: 'ok', hit: [] })),
    narrateAction: vi.fn(async () => 'narração mockada.'),
    renderResolutionLine: vi.fn(() => 'x'),
    commitTurn: vi.fn(async () => ({
      pendingMoves: [],
      resolutionLine: 'x',
      trace: { step: 1, actor: 'Aric', actorWhere: 'Taverna', queue: [], spotlight: 'Aric', gate: { allowed: [], denied: [] } },
    })),
    updateSettings: vi.fn(),
  };

  const mockCpuReflection = {
    reflectAndAct: vi.fn(),
    recordArbiterResult: vi.fn(),
  } as unknown as CharacterService;

  const engine = new GameService(
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
    orchestrator as any,
  );

  return { engine, llmService, mockLlm, mockOutput, startAction, orchestrator };
}

/** Roda o turno do jogador pelas fases até o commit. */
async function runPlayerTurn(engine: GameService, sessionId: string, state: GameState, text: string) {
  const started = await engine.beginTurn(sessionId, state, { charName: 'Aric', text });
  let pending = started.reactionsPending;
  while (pending > 0) {
    const r = await engine.reactNext(started.turnId, sessionId);
    pending = r.reactionsPending;
  }
  await engine.arbitrateTurn(started.turnId, sessionId);
  await engine.narrateTurn(started.turnId, sessionId);
  return engine.finishTurn(started.turnId, sessionId);
}

describe('GameService — descrição de cenário por mudança de local', () => {
  it('deve gerar descrição de cenário quando o ator está num local diferente do último descrito', async () => {
    const state = makeState({ lastSceneLocation: 'Vila' }); // Aric agora em 'Taverna'
    const { engine, llmService } = buildEngine();

    const genSceneSpy = vi.spyOn(llmService, 'generateSceneDescription').mockResolvedValue('A taverna cheira a alecrim e fumaça.');

    const started = await engine.beginTurn('s-1', state, { charName: 'Aric', text: 'Investigar o bar' });

    expect(genSceneSpy).toHaveBeenCalledTimes(1);
    expect(genSceneSpy.mock.calls[0]![1]).toBe('Taverna');
    expect(started.sceneDescription).toBe('A taverna cheira a alecrim e fumaça.');

    const finished = await runPlayerTurnContinued(engine, 's-1', started.turnId);
    expect(finished.narrative).toBe('A taverna cheira a alecrim e fumaça.\n\nnarração mockada.');
    expect(finished.state.lastSceneLocation).toBe('Taverna');
  });

  it('NÃO deve gerar descrição de cenário quando o ator continua no mesmo local', async () => {
    const state = makeState({ lastSceneLocation: 'Taverna' });
    const { engine, llmService } = buildEngine();

    const genSceneSpy = vi.spyOn(llmService, 'generateSceneDescription');

    const result = await runPlayerTurn(engine, 's-2', state, 'Pedir uma bebida');

    expect(genSceneSpy).not.toHaveBeenCalled();
    expect(result.narrative).toBe('narração mockada.');
    expect(result.state.lastSceneLocation).toBe('Taverna');
  });

  it('deve manter lastSceneLocation inalterado quando o ator não tem local definido', async () => {
    const state = makeState({ lastSceneLocation: 'Vila' });
    delete state.characters[0]!.currentLocation;
    const { engine, llmService } = buildEngine();

    const genSceneSpy = vi.spyOn(llmService, 'generateSceneDescription');

    const result = await runPlayerTurn(engine, 's-3', state, 'Observar o ambiente');

    expect(genSceneSpy).not.toHaveBeenCalled();
    expect(result.state.lastSceneLocation).toBe('Vila');
  });
});

/** Continua um turno já iniciado (útil quando o `start` foi assertado à parte). */
async function runPlayerTurnContinued(engine: GameService, sessionId: string, turnId: string) {
  const status = engine.getTurnStatus(turnId, sessionId);
  let pending = status.reactionsPending;
  while (pending > 0) {
    const r = await engine.reactNext(turnId, sessionId);
    pending = r.reactionsPending;
  }
  await engine.arbitrateTurn(turnId, sessionId);
  await engine.narrateTurn(turnId, sessionId);
  return engine.finishTurn(turnId, sessionId);
}
