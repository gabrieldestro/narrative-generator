import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MicroTurnOrchestrator, shortDid } from '../MicroTurnOrchestrator.js';
import { GameManagementService } from '../GameManagementService.js';
import type { GameState, MicroAction, MicroResolution } from '../../domain/types.js';

function makeState(names: { name: string; isPlayer?: boolean; where?: string; vitality?: 'caído'; status?: 'dead' }[]): GameState {
  return {
    narrativeStyle: 'fantasia',
    writingStyle: 'épico',
    worldContext: 'Pátio.',
    history: [],
    turnNumber: 2,
    characters: names.map((n, i) => ({
      id: String(i + 1),
      name: n.name,
      description: 'd',
      personality: 'p',
      isPlayer: n.isPlayer ?? false,
      currentLocation: n.where ?? 'Pátio',
      inventory: [],
      ...(n.vitality ? { vitality: n.vitality } : {}),
      ...(n.status ? { status: n.status } : {}),
    })),
    locations: [{ id: 'patio', name: 'Pátio', description: 'Aberto', connectedTo: [] }],
  } as unknown as GameState;
}

const OK: MicroResolution = { outcome: 'success', violent: false, reason: 'ok', hit: [] };

function makeStubs() {
  const arbiter = {
    arbitrateMicro: vi.fn(async (..._args: any[]): Promise<any> => ({ ...OK })),
    applyDiceRule: vi.fn((r: MicroResolution) => r),
  };
  const gate = { gateReactions: vi.fn(async (..._args: any[]): Promise<any[]> => []) };
  const narrator = { narrateMicro: vi.fn(async (..._args: any[]) => `Narrado: ${String(_args[1])}.`) };
  const extractor = (delta: unknown) => ({ hasSignal: () => true, extract: vi.fn(async (..._args: any[]) => delta) });
  const inventory = extractor({ grab: [], drop: [] });
  const movement = extractor({ move: [] });
  const conditions = extractor({ conditions: [] });
  const management = new GameManagementService({} as any);
  const cpuReflection = {
    reflectAndAct: vi.fn(async (..._args: any[]) => ({
      reasoning: 'r', updatedObjective: 'o', action: `${String((_args[1] as { name: string }).name)} age com cautela.`,
    })),
    recordArbiterResult: vi.fn(),
  };
  return { arbiter, gate, narrator, inventory, movement, conditions, management, cpuReflection };
}

function makeOrchestrator(stubs: ReturnType<typeof makeStubs>, settings: Record<string, unknown> = {}) {
  return new MicroTurnOrchestrator(
    stubs.arbiter as any, stubs.gate as any, stubs.narrator as any,
    stubs.inventory as any, stubs.movement as any, stubs.conditions as any,
    stubs.management, stubs.cpuReflection as any,
    { godMode: false, memoryWindowSize: 5, debug: false, unexpectedEventChance: 0, narrationSize: 'balanced', narrationSizePrompts: { concise: '', balanced: '', descriptive: '' }, arbiterHistoryTurns: 0, maxScratchpadSize: 5, maxCpuRetries: 1, maxHealRetries: 0, healSummaryOnOverflow: false, jsonRepairMaxInputChars: 100, ...settings } as any,
    undefined,
  );
}

// Doc 27, Fase 3 — orquestrador com agentes mockados por interface.
describe('MicroTurnOrchestrator.runTurn', () => {
  let stubs: ReturnType<typeof makeStubs>;

  beforeEach(() => {
    stubs = makeStubs();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11
  });

  it('1 ação + 1 reação com stake gera 1 event + 1 micro-narração por micro', async () => {
    stubs.gate.gateReactions.mockImplementation(async (_a: unknown, _w: unknown, candidates: { name: string }[]) =>
      candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' })),
    );
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const result = await orch.runTurn(state, new Map([['Darian', 'Darian avança até a porta']]));

    expect(result.microTrace).toHaveLength(2);
    expect(result.npcOrder).toEqual(['Darian', 'Elara']);
    expect(state.events).toHaveLength(2);
    expect(state.events![0]).toMatchObject({ seq: 1, turn: 2, who: 'Darian', outcome: 'success', where: 'Pátio' });
    expect(state.events![1]!.seq).toBe(2);
    expect(result.diceRolls).toHaveLength(2);
    expect(result.npcDecisions).toHaveLength(1);
    // turnNumber++ é do GameEngine, não do orquestrador.
    expect(state.turnNumber).toBe(2);
  });

  it('caído/morto/self nunca são chamados (spotlight + gate)', async () => {
    const orch = makeOrchestrator(stubs);
    const state = makeState([
      { name: 'Darian', isPlayer: true },
      { name: 'Caido', vitality: 'caído' },
      { name: 'Morto', status: 'dead' },
    ]);
    const result = await orch.runTurn(state, new Map([['Darian', 'olha ao redor']]));

    expect(result.npcOrder).toEqual(['Darian']);
    expect(result.microTrace).toHaveLength(1);
    const calledNames = stubs.cpuReflection.reflectAndAct.mock.calls.map((c) => (c[1] as { name: string }).name);
    expect(calledNames).not.toContain('Caido');
    expect(calledNames).not.toContain('Morto');
    // self nunca é candidato do gate.
    for (const call of stubs.gate.gateReactions.mock.calls) {
      const candidates = call[2] as { name: string }[];
      const actor = (call[0] as { actor: string }).actor;
      expect(candidates.map((c) => c.name)).not.toContain(actor);
    }
  });

  it('gate negando → NPC não é chamado para reagir (só age no próprio micro)', async () => {
    stubs.gate.gateReactions.mockResolvedValue([]);
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await orch.runTurn(state, new Map([['Darian', 'Darian sussurra']]));

    const reactionCalls = stubs.cpuReflection.reflectAndAct.mock.calls.filter((c) => c[4] !== undefined);
    expect(reactionCalls).toHaveLength(0);
    // Elara foi chamada 1x: só a própria ação.
    const elaraCalls = stubs.cpuReflection.reflectAndAct.mock.calls.filter((c) => (c[1] as { name: string }).name === 'Elara');
    expect(elaraCalls).toHaveLength(1);
  });

  it('gate permitindo → reação carrega o channel; árbitro recebe as reações', async () => {
    stubs.gate.gateReactions.mockImplementation(async (_a: unknown, _w: unknown, candidates: { name: string }[]) =>
      candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' })),
    );
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await orch.runTurn(state, new Map([['Darian', 'Darian grita']]));

    const reactionCalls = stubs.cpuReflection.reflectAndAct.mock.calls.filter((c) => c[4] !== undefined);
    expect(reactionCalls.length).toBeGreaterThan(0);
    expect(reactionCalls[0]![4]).toMatchObject({ channel: 'saw' });
    const darianArbiter = stubs.arbiter.arbitrateMicro.mock.calls.find((c) => (c[1] as { actor: string }).actor === 'Darian');
    expect((darianArbiter![2] as unknown[])).toHaveLength(1);
  });

  it('reação `ignorar` é descartada antes do árbitro', async () => {
    stubs.gate.gateReactions.mockImplementation(async (..._args: any[]) => {
      const candidates = _args[2] as { name: string }[];
      return candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' }));
    });
    stubs.cpuReflection.reflectAndAct.mockImplementation(async (..._args: any[]) => {
      const char = _args[1] as { name: string };
      const ctx = _args[4] as unknown;
      if (ctx) return { reasoning: 'r', updatedObjective: 'o', action: 'ignorar' };
      return { reasoning: 'r', updatedObjective: 'o', action: `${char.name} age.` };
    });
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await orch.runTurn(state, new Map([['Darian', 'Darian grita']]));

    for (const call of stubs.arbiter.arbitrateMicro.mock.calls) {
      expect(call[2] as unknown[]).toEqual([]);
    }
  });

  it('sem teto: 5 permitidos → 5 reações, sem corte', async () => {
    stubs.gate.gateReactions.mockImplementation(async (_a: unknown, _w: unknown, candidates: { name: string }[]) =>
      candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' })),
    );
    const orch = makeOrchestrator(stubs);
    const state = makeState([
      { name: 'Darian', isPlayer: true },
      { name: 'N1' }, { name: 'N2' }, { name: 'N3' }, { name: 'N4' }, { name: 'N5' },
    ]);
    await orch.runTurn(state, new Map([['Darian', 'Darian explode o barril']]));

    const darianArbiter = stubs.arbiter.arbitrateMicro.mock.calls.find((c) => (c[1] as { actor: string }).actor === 'Darian');
    expect((darianArbiter![2] as unknown[])).toHaveLength(5);
  });

  it('ordena por stake: alvo antes de mesmo-local', async () => {
    stubs.gate.gateReactions.mockImplementation(async () => [
      { who: 'Perto', allow: true, channel: 'saw' as const, why: 'viu' },
      { who: 'Alvo', allow: true, channel: 'stake' as const, why: 'alvo' },
    ]);
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Perto' }, { name: 'Alvo' }]);
    await orch.runTurn(state, new Map([['Darian', 'Darian ataca Alvo']]));

    const reactionOrder = stubs.cpuReflection.reflectAndAct.mock.calls
      .filter((c) => c[4] !== undefined)
      .map((c) => (c[1] as { name: string }).name);
    expect(reactionOrder[0]).toBe('Alvo');
  });

  it('godMode=20 só para o player; player sem ação hesita', async () => {
    const orch = makeOrchestrator(stubs, { godMode: true });
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const result = await orch.runTurn(state, new Map());
    expect(result.diceRolls.find((d) => d.characterName === 'Darian')).toMatchObject({ roll: 20, isGodMode: true });
    expect(result.diceRolls.find((d) => d.characterName === 'Elara')!.roll).toBe(11);
  });

  it('pendingMoves atravessam o resultado sem aplicar local desconhecido', async () => {
    stubs.movement.extract.mockResolvedValue({ move: [{ who: 'Elara', to: 'Sótão' }] });
    stubs.narrator.narrateMicro.mockResolvedValue('Elara sobe ao Sótão escuro.');
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const result = await orch.runTurn(state, new Map([['Darian', 'olha']]));
    expect(state.characters.find((c) => c.name === 'Elara')!.currentLocation).toBe('Pátio');
    expect(result.pendingMoves.length).toBeGreaterThan(0);
  });
});

describe('MicroTurnOrchestrator — heurísticas', () => {

  let stubs: ReturnType<typeof makeStubs>;

  beforeEach(() => { stubs = makeStubs(); });

  it('resolveStakeFlags: nome citado vira alvo; item citado vira ownsItem', () => {
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    state.characters.find((c) => c.name === 'Elara')!.inventory = ['Mochila de Couro'];
    const flags = orch.resolveStakeFlags('Darian revira a Mochila de Couro de Elara', 'Darian', state.characters);
    expect(flags.get('elara')).toEqual({ isTarget: true, ownsItem: true });
    expect(orch.inferTarget('Darian ataca Elara', 'Darian', state.characters)).toBe('Elara');
    expect(orch.inferTarget('Darian olha ao redor', 'Darian', state.characters)).toBeUndefined();
  });

  it('spotlightOrder: players antes de NPCs; caído fora', () => {
    const orch = makeOrchestrator(stubs);
    const state = makeState([
      { name: 'N1' }, { name: 'Darian', isPlayer: true }, { name: 'Caido', vitality: 'caído' },
    ]);
    expect(orch.spotlightOrder(state.characters).map((c) => c.name)).toEqual(['Darian', 'N1']);
  });

  it('shortDid resume em 6 palavras', () => {
    expect(shortDid('Darian avança cautelosamente pelo corredor escuro e úmido')).toBe('Darian avança cautelosamente pelo corredor escuro');
    expect(shortDid('')).toBe('(ação)');
  });
});

describe('MicroTurnOrchestrator — fechamento de cena (doc 27, Fase 4)', () => {
  let stubs: ReturnType<typeof makeStubs>;

  beforeEach(() => {
    stubs = makeStubs();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  function makeSceneStubs() {
    return {
      extractor: { extract: vi.fn(async (..._args: any[]): Promise<any> => ({ new_locations: [], new_npcs: [], dead: [], lost: [], healed: [] })) },
      memory: { consolidateFacts: vi.fn(async (..._args: any[]): Promise<any> => ({ facts: ['fato novo'], threads: [] })) },
    };
  }

  function makeOrchestratorWithScene(current: ReturnType<typeof makeStubs>, scene: { extractor: unknown; memory: unknown }) {
    return new MicroTurnOrchestrator(
      current.arbiter as any, current.gate as any, current.narrator as any,
      current.inventory as any, current.movement as any, current.conditions as any,
      current.management, current.cpuReflection as any,
      { godMode: false } as any, undefined, scene as any,
    );
  }

  it('sem cena: comportamento Fase 3 preservado (sem factSheet, sem vitalidade)', async () => {
    stubs.arbiter.arbitrateMicro.mockResolvedValue({ outcome: 'success', violent: true, reason: 'golpe', hit: ['Elara'] });
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await orch.runTurn(state, new Map([['Darian', 'Darian ataca Elara']]));
    expect(state.factSheet).toBeUndefined();
    expect(state.characters.find((c) => c.name === 'Elara')!.vitality ?? 'ileso').toBe('ileso');
  });

  it('com cena: vitalidade do hit + consolidateFacts + factSheet', async () => {
    stubs.arbiter.arbitrateMicro.mockResolvedValue({ outcome: 'success', violent: true, reason: 'golpe', hit: ['Elara'] });
    const scene = makeSceneStubs();
    const orch = makeOrchestratorWithScene(stubs, scene);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await orch.runTurn(state, new Map([['Darian', 'Darian ataca Elara']]));

    expect(scene.extractor.extract).toHaveBeenCalledTimes(1);
    expect(state.characters.find((c) => c.name === 'Elara')!.vitality).toBe('ferido');
    expect(state.characters.find((c) => c.name === 'Darian')!.vitality ?? 'ileso').toBe('ileso');
    expect(scene.memory.consolidateFacts).toHaveBeenCalledTimes(1);
    expect(state.factSheet).toEqual({ facts: ['fato novo'], threads: [] });
  });

  it('failure violenta só aplica auto-dano (ator no próprio hit)', async () => {
    stubs.arbiter.arbitrateMicro.mockImplementation(async (..._args: any[]) => {
      const action = _args[1] as MicroAction;
      return action.actor === 'Darian'
        ? { outcome: 'failure', violent: true, reason: 'caiu do muro', hit: ['Darian', 'Elara'] }
        : { outcome: 'success', violent: false, reason: 'ok', hit: [] };
    });
    const scene = makeSceneStubs();
    const orch = makeOrchestratorWithScene(stubs, scene);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await orch.runTurn(state, new Map([['Darian', 'Darian escala o muro']]));

    expect(state.characters.find((c) => c.name === 'Darian')!.vitality).toBe('ferido');
    expect(state.characters.find((c) => c.name === 'Elara')!.vitality ?? 'ileso').toBe('ileso');
  });

  it('pendingMoves retentados contra locais criados na cena', async () => {
    stubs.movement.extract.mockResolvedValue({ move: [{ who: 'Elara', to: 'Sótão' }] });
    stubs.narrator.narrateMicro.mockResolvedValue('Elara sobe ao Sótão escuro.');
    const scene = makeSceneStubs();
    scene.extractor.extract.mockResolvedValue({
      new_locations: [{ name: 'Sótão', desc: 'Escuro' }], new_npcs: [], dead: [], lost: [], healed: [],
    });
    const orch = makeOrchestratorWithScene(stubs, scene);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const result = await orch.runTurn(state, new Map([['Darian', 'olha']]));

    expect(result.pendingMoves).toEqual([]);
    expect(state.characters.find((c) => c.name === 'Elara')!.currentLocation).toBe('Sótão');
  });
});
