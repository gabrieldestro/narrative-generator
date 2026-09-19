import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TurnService, shortDid } from '../TurnService.js';
import { WorldService } from '../../world/WorldService.js';
import type { GameState, StepAction, StepResolution } from '../../../domain/types.js';

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

const OK: StepResolution = { outcome: 'success', violent: false, reason: 'ok', hit: [] };

function makeStubs() {
  const arbiter = {
    arbitrateStep: vi.fn(async (..._args: any[]): Promise<any> => ({ ...OK })),
    applyDiceRule: vi.fn((r: StepResolution) => r),
  };
  const gate = { gateReactions: vi.fn(async (..._args: any[]): Promise<any[]> => []) };
  const narrator = { narrateStep: vi.fn(async (..._args: any[]) => `Narrado: ${String(_args[1])}.`) };
  const extractor = (delta: unknown) => ({ hasSignal: () => true, extract: vi.fn(async (..._args: any[]) => delta) });
  const inventory = extractor({ grab: [], drop: [] });
  const movement = extractor({ move: [] });
  const conditions = extractor({ conditions: [] });
  const management = new WorldService({} as any);
  const cpuReflection = {
    reflectAndAct: vi.fn(async (..._args: any[]) => ({
      reasoning: 'r', updatedObjective: 'o', action: `${String((_args[1] as { name: string }).name)} age com cautela.`,
    })),
    recordArbiterResult: vi.fn(),
  };
  return { arbiter, gate, narrator, inventory, movement, conditions, management, cpuReflection };
}

function makeSceneStubs() {
  return {
    extractor: { extract: vi.fn(async (..._args: any[]): Promise<any> => ({ new_locations: [], new_npcs: [], dead: [], lost: [], healed: [] })) },
    memory: { consolidateFacts: vi.fn(async (..._args: any[]): Promise<any> => ({ facts: ['fato novo'], threads: [] })) },
  };
}

function makeOrchestrator(
  stubs: ReturnType<typeof makeStubs>,
  settings: Record<string, unknown> = {},
  scene?: { extractor: unknown; memory: unknown },
) {
  return new TurnService(
    stubs.arbiter as any, stubs.gate as any, stubs.narrator as any,
    stubs.inventory as any, stubs.movement as any, stubs.conditions as any,
    stubs.management, stubs.cpuReflection as any,
    { godMode: false, memoryWindowSize: 5, debug: false, unexpectedEventChance: 0, narrationSize: 'balanced', narrationSizePrompts: { concise: '', balanced: '', descriptive: '' }, arbiterHistoryTurns: 0, maxScratchpadSize: 5, maxCpuRetries: 1, maxHealRetries: 0, healSummaryOnOverflow: false, jsonRepairMaxInputChars: 100, ...settings } as any,
    undefined,
    scene as any,
  );
}

/**
 * Roda 1 turno completo (1 ação + reações) pelas fases, como o
 * `GameService` faz via HTTP: start → react* → arbiter → narrate → commit.
 */
async function runSingleTurn(
  orch: ReturnType<typeof makeOrchestrator>,
  state: GameState,
  actorName: string,
  playerText?: string,
) {
  const actor = state.characters.find((c) => c.name === actorName)!;
  const actions = new Map<string, string>();
  if (playerText !== undefined) actions.set(actorName, playerText);
  const started = await orch.startAction(state, actor, actions);

  const priorLines = [`${actorName}: ${started.text}`];
  const reactions: StepAction[] = [];
  const reacted: string[] = [];
  const ignored: string[] = [];
  for (const ruling of started.ordered) {
    const reactor = state.characters.find((c) => c.name === ruling.who)!;
    const result = await orch.resolveReaction(state, reactor, priorLines, started.action, ruling.channel);
    if (result.ignored) {
      ignored.push(reactor.name);
      continue;
    }
    reactions.push({ actor: reactor.name, text: result.action });
    priorLines.push(`${reactor.name}: ${result.action}`);
    reacted.push(reactor.name);
  }

  const resolution = await orch.arbitrateAction(state, started.action, reactions, started.roll);
  const narration = await orch.narrateAction(
    state, `${actorName} tenta: ${started.text} (d20: ${started.roll})`, resolution, false,
  );
  const committed = await orch.commitTurn(state, {
    actorName,
    actionText: started.text,
    reactions: reactions.map((r) => ({ who: r.actor, action: r.text })),
    resolution,
    actorWhere: started.actorWhere,
    narration,
    gate: {
      allowed: started.ordered.map((r) => ({ who: r.who, channel: r.channel })),
      denied: started.denied.map((r) => ({ who: r.who, why: r.why })),
    },
    reacted,
    ignored,
  });
  return { started, reactions, resolution, narration, committed };
}

// Orquestrador com agentes mockados por interface (fases de ação única).
describe('TurnService.startAction', () => {
  let stubs: ReturnType<typeof makeStubs>;

  beforeEach(() => {
    stubs = makeStubs();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11
  });

  it('ação do jogador + gate: devolve texto, dado e fila sem mutar o mundo', async () => {
    stubs.gate.gateReactions.mockImplementation(async (_a: unknown, _w: unknown, candidates: { name: string }[]) =>
      candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' })),
    );
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const actor = state.characters.find((c) => c.name === 'Darian')!;

    const started = await orch.startAction(state, actor, new Map([['Darian', 'Darian avança até a porta']]));

    expect(started.text).toBe('Darian avança até a porta');
    expect(started.diceRoll).toMatchObject({ characterName: 'Darian', roll: 11 });
    expect(started.ordered.map((r) => r.who)).toEqual(['Elara']);
    expect(started.denied).toEqual([]);
    // Fases 1-3 não comitam: sem ledger, sem turnNumber++ (do GameService).
    expect(state.events ?? []).toHaveLength(0);
    expect(state.turnNumber).toBe(2);
  });

  it('ator NPC resolve via reflexão (1 LLM) com reasoning', async () => {
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const actor = state.characters.find((c) => c.name === 'Elara')!;

    const started = await orch.startAction(state, actor, new Map());

    expect(started.text).toBe('Elara age com cautela.');
    expect(started.reasoning).toBe('r');
    expect(stubs.cpuReflection.reflectAndAct).toHaveBeenCalledTimes(1);
    expect(stubs.cpuReflection.reflectAndAct.mock.calls[0]![4]).toBeUndefined();
  });

  it('caído/morto/self nunca são candidatos do gate', async () => {
    const orch = makeOrchestrator(stubs);
    const state = makeState([
      { name: 'Darian', isPlayer: true },
      { name: 'Caido', vitality: 'caído' },
      { name: 'Morto', status: 'dead' },
    ]);
    const actor = state.characters.find((c) => c.name === 'Darian')!;

    await orch.startAction(state, actor, new Map([['Darian', 'olha ao redor']]));

    const candidates = stubs.gate.gateReactions.mock.calls[0]![2] as { name: string }[];
    expect(candidates.map((c) => c.name)).toEqual([]);
  });

  it('gate negando → allowed vazio (reação nunca chamada)', async () => {
    stubs.gate.gateReactions.mockResolvedValue([]);
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const actor = state.characters.find((c) => c.name === 'Darian')!;

    const started = await orch.startAction(state, actor, new Map([['Darian', 'Darian sussurra']]));

    expect(started.ordered).toEqual([]);
    const reactionCalls = stubs.cpuReflection.reflectAndAct.mock.calls.filter((c) => c[4] !== undefined);
    expect(reactionCalls).toHaveLength(0);
  });

  it('ordena por stake: alvo antes de mesmo-local', async () => {
    stubs.gate.gateReactions.mockImplementation(async () => [
      { who: 'Perto', allow: true, channel: 'saw' as const, why: 'viu' },
      { who: 'Alvo', allow: true, channel: 'stake' as const, why: 'alvo' },
    ]);
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Perto' }, { name: 'Alvo' }]);
    const actor = state.characters.find((c) => c.name === 'Darian')!;

    const started = await orch.startAction(state, actor, new Map([['Darian', 'Darian ataca Alvo']]));

    expect(started.ordered[0]!.who).toBe('Alvo');
  });

  it('godMode=20 só para o player; player sem ação hesita', async () => {
    const orch = makeOrchestrator(stubs, { godMode: true });
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);

    const playerStarted = await orch.startAction(
      state, state.characters.find((c) => c.name === 'Darian')!, new Map(),
    );
    expect(playerStarted.diceRoll).toMatchObject({ roll: 20, isGodMode: true });
    expect(playerStarted.text).toContain('hesita');

    const npcStarted = await orch.startAction(
      state, state.characters.find((c) => c.name === 'Elara')!, new Map(),
    );
    expect(npcStarted.diceRoll.roll).toBe(11);
  });
});

describe('TurnService — reação, árbitro e commit', () => {
  let stubs: ReturnType<typeof makeStubs>;

  beforeEach(() => {
    stubs = makeStubs();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('1 ação + 1 reação gera 1 event + trace com queue', async () => {
    stubs.gate.gateReactions.mockImplementation(async (_a: unknown, _w: unknown, candidates: { name: string }[]) =>
      candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' })),
    );
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);

    const { started, reactions, committed } = await runSingleTurn(orch, state, 'Darian', 'Darian avança até a porta');

    expect(reactions).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    expect(state.events![0]).toMatchObject({ seq: 1, turn: 2, who: 'Darian', outcome: 'success', where: 'Pátio' });
    expect(committed.trace).toMatchObject({ step: 1, actor: 'Darian', spotlight: 'Darian' });
    expect(committed.trace.queue.map((q) => q.who)).toEqual(['Darian', 'Elara']);
    expect(started.diceRoll.roll).toBe(11);
  });

  it('reação carrega o channel; árbitro recebe as reações', async () => {
    stubs.gate.gateReactions.mockImplementation(async (_a: unknown, _w: unknown, candidates: { name: string }[]) =>
      candidates.map((c) => ({ who: c.name, allow: true, channel: 'heard' as const, why: 'ouviu' })),
    );
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const actor = state.characters.find((c) => c.name === 'Darian')!;
    const started = await orch.startAction(state, actor, new Map([['Darian', 'Darian grita']]));

    const reactor = state.characters.find((c) => c.name === 'Elara')!;
    const reaction = await orch.resolveReaction(state, reactor, [], started.action, 'heard');
    expect(reaction.ignored).toBe(false);
    expect(reaction.channel).toBe('heard');

    const resolution = await orch.arbitrateAction(
      state, started.action, [{ actor: 'Elara', text: reaction.action }], started.roll,
    );
    expect(stubs.arbiter.arbitrateStep).toHaveBeenCalledTimes(1);
    expect(stubs.arbiter.arbitrateStep.mock.calls[0]![2]).toHaveLength(1);
    expect(resolution.outcome).toBe('success');
  });

  it('reação `ignorar` é descartada antes do árbitro', async () => {
    stubs.gate.gateReactions.mockImplementation(async (..._args: any[]) => {
      const candidates = _args[2] as { name: string }[];
      return candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' }));
    });
    stubs.cpuReflection.reflectAndAct.mockResolvedValue({ reasoning: 'r', updatedObjective: 'o', action: 'ignorar' });
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const actor = state.characters.find((c) => c.name === 'Darian')!;
    const started = await orch.startAction(state, actor, new Map([['Darian', 'Darian grita']]));

    const reactor = state.characters.find((c) => c.name === 'Elara')!;
    const reaction = await orch.resolveReaction(state, reactor, [], started.action, 'saw');
    expect(reaction.ignored).toBe(true);

    await orch.arbitrateAction(state, started.action, [], started.roll);
    expect(stubs.arbiter.arbitrateStep.mock.calls[0]![2]).toEqual([]);
  });

  it('falha do LLM na reação ⇒ reator ignorado sem quebrar o turno', async () => {
    stubs.gate.gateReactions.mockImplementation(async (_a: unknown, _w: unknown, candidates: { name: string }[]) =>
      candidates.map((c) => ({ who: c.name, allow: true, channel: 'saw' as const, why: 'viu' })),
    );
    stubs.cpuReflection.reflectAndAct.mockRejectedValue(new Error('LLM fora do ar'));
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const actor = state.characters.find((c) => c.name === 'Darian')!;
    const started = await orch.startAction(state, actor, new Map([['Darian', 'Darian acena']]));

    const reactor = state.characters.find((c) => c.name === 'Elara')!;
    const reaction = await orch.resolveReaction(state, reactor, [], started.action, 'saw');
    expect(reaction.ignored).toBe(true);
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
    const actor = state.characters.find((c) => c.name === 'Darian')!;
    const started = await orch.startAction(state, actor, new Map([['Darian', 'Darian explode o barril']]));
    expect(started.ordered).toHaveLength(5);

    const reactions = started.ordered.map((r) => ({ actor: r.who, text: `${r.who} reage.` }));
    await orch.arbitrateAction(state, started.action, reactions, started.roll);
    expect(stubs.arbiter.arbitrateStep.mock.calls[0]![2]).toHaveLength(5);
  });

  it('pendingMoves sem local conhecido atravessam o commit sem teleportar', async () => {
    stubs.movement.extract.mockResolvedValue({ move: [{ who: 'Elara', to: 'Sótão' }] });
    stubs.narrator.narrateStep.mockResolvedValue('Elara sobe ao Sótão escuro.');
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);

    const { committed } = await runSingleTurn(orch, state, 'Darian', 'olha');
    expect(state.characters.find((c) => c.name === 'Elara')!.currentLocation).toBe('Pátio');
    expect(committed.pendingMoves.length).toBeGreaterThan(0);
  });
});

describe('TurnService — heurísticas', () => {

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

describe('TurnService — fechamento de cena', () => {
  let stubs: ReturnType<typeof makeStubs>;

  beforeEach(() => {
    stubs = makeStubs();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('sem cena: sem factSheet, sem vitalidade', async () => {
    stubs.arbiter.arbitrateStep.mockResolvedValue({ outcome: 'success', violent: true, reason: 'golpe', hit: ['Elara'] });
    const orch = makeOrchestrator(stubs);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await runSingleTurn(orch, state, 'Darian', 'Darian ataca Elara');
    expect(state.factSheet).toBeUndefined();
    expect(state.characters.find((c) => c.name === 'Elara')!.vitality ?? 'ileso').toBe('ileso');
  });

  it('com cena: vitalidade do hit + consolidateFacts + factSheet', async () => {
    stubs.arbiter.arbitrateStep.mockResolvedValue({ outcome: 'success', violent: true, reason: 'golpe', hit: ['Elara'] });
    const scene = makeSceneStubs();
    const orch = makeOrchestrator(stubs, {}, scene);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await runSingleTurn(orch, state, 'Darian', 'Darian ataca Elara');

    expect(scene.extractor.extract).toHaveBeenCalledTimes(1);
    expect(state.characters.find((c) => c.name === 'Elara')!.vitality).toBe('ferido');
    expect(state.characters.find((c) => c.name === 'Darian')!.vitality ?? 'ileso').toBe('ileso');
    expect(scene.memory.consolidateFacts).toHaveBeenCalledTimes(1);
    expect(state.factSheet).toEqual({ facts: ['fato novo'], threads: [] });
  });

  it('failure violenta só aplica auto-dano (ator no próprio hit)', async () => {
    stubs.arbiter.arbitrateStep.mockResolvedValue({ outcome: 'failure', violent: true, reason: 'caiu do muro', hit: ['Darian', 'Elara'] });
    const scene = makeSceneStubs();
    const orch = makeOrchestrator(stubs, {}, scene);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    await runSingleTurn(orch, state, 'Darian', 'Darian escala o muro');

    expect(state.characters.find((c) => c.name === 'Darian')!.vitality).toBe('ferido');
    expect(state.characters.find((c) => c.name === 'Elara')!.vitality ?? 'ileso').toBe('ileso');
  });

  it('pendingMoves retentados contra locais criados na cena', async () => {
    stubs.movement.extract.mockResolvedValue({ move: [{ who: 'Elara', to: 'Sótão' }] });
    stubs.narrator.narrateStep.mockResolvedValue('Elara sobe ao Sótão escuro.');
    const scene = makeSceneStubs();
    scene.extractor.extract.mockResolvedValue({
      new_locations: [{ name: 'Sótão', desc: 'Escuro' }], new_npcs: [], dead: [], lost: [], healed: [],
    });
    const orch = makeOrchestrator(stubs, {}, scene);
    const state = makeState([{ name: 'Darian', isPlayer: true }, { name: 'Elara' }]);
    const { committed } = await runSingleTurn(orch, state, 'Darian', 'olha');

    expect(committed.pendingMoves).toEqual([]);
    expect(state.characters.find((c) => c.name === 'Elara')!.currentLocation).toBe('Sótão');
  });
});
