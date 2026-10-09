import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameService } from '../../application/session/GameService.js';
import { TurnError, type ActiveTurn } from '../../application/turn/TurnStore.js';
import type { GameState } from '../../domain/types.js';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function makeState(): GameState {
  return {
    narrativeStyle: 'Fantasia',
    writingStyle: 'Épico',
    worldContext: 'Mundo de teste.',
    turnNumber: 1,
    history: [],
    characters: [
      { id: '1', name: 'Aric', description: 'Herói', personality: 'Corajoso', isPlayer: true },
      { id: '2', name: 'Elara', description: 'Elfa', personality: 'Furtiva', isPlayer: false },
      { id: '3', name: 'Brom', description: 'Anão', personality: 'Teimoso', isPlayer: false },
    ],
  };
}

function makeOpenTurn(turnId: string, sessionId: string, allowed: string[]): ActiveTurn {
  const state = makeState();
  return {
    turnId,
    sessionId,
    turnNumber: 1,
    status: 'open',
    phase: 'awaiting_reactions',
    actorName: 'Aric',
    actorWhere: 'Pátio',
    actionText: 'Aric avança.',
    actionReasoning: '',
    diceRoll: { characterName: 'Aric', roll: 11 },
    action: { actor: 'Aric', text: 'Aric avança.', roll: 11 },
    allowed: allowed.map((who) => ({ who, allow: true, channel: 'saw' as const, why: 'viu' })),
    denied: [],
    reactionCursor: 0,
    reacted: [],
    ignored: [],
    priorLines: ['Aric: Aric avança.'],
    unexpectedEvent: false,
    workingState: state,
    createdAt: Date.now(),
  };
}

function makeFinishTurn(turnId: string, sessionId: string): ActiveTurn {
  const turn = makeOpenTurn(turnId, sessionId, []);
  turn.phase = 'awaiting_finish';
  turn.resolution = { outcome: 'success', violent: false, reason: 'ok', hit: [] };
  turn.resolutionLine = 'Aric avançou -> Sucesso porque ok';
  turn.narration = 'Aric avançou pelo pátio.';
  return turn;
}

/**
 * F0-b (doc 31): 2× `react` / 2× `finish` paralelos no MESMO turnId.
 * Comportamento correto (pós-F1): exatamente 1 vence, o outro recebe erro
 * determinístico — sem reator duplicado, sem duplo commit.
 * Estes testes FALHAM antes da F1 (R4/R5) e PASSAM depois (regressão).
 */
describe('saga race (F0-b: R4/R5)', () => {
  let svc: GameService;
  let resolveReaction: ReturnType<typeof vi.fn>;
  let commitTurn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resolveReaction = vi.fn(async (_state: unknown, reactor: { name: string }) => {
      await delay(20); // abre a janela entre requireOpen e cursor++
      return { who: reactor.name, action: `${reactor.name} reage.`, reasoning: 'r', ignored: false, channel: 'saw' as const };
    });
    commitTurn = vi.fn(async () => {
      await delay(20); // abre a janela entre requireOpen e finish()
      return {
        pendingMoves: [],
        resolutionLine: 'Aric avançou -> Sucesso porque ok',
        trace: { step: 1, actor: 'Aric', actorWhere: 'Pátio', queue: [], spotlight: 'Aric', gate: { allowed: [], denied: [] } },
      };
    });
    const orchestrator = {
      activeRoster: (s: GameState) => s.characters,
      spotlightOrder: (r: GameState['characters']) => r,
      startAction: vi.fn(),
      resolveReaction,
      arbitrateAction: vi.fn(),
      narrateAction: vi.fn(),
      renderResolutionLine: () => 'Aric avançou -> Sucesso porque ok',
      commitTurn,
      updateSettings: vi.fn(),
    };
    const llmService = {
      summarizeMemory: vi.fn(async () => 'resumo'),
      updateWorldContext: vi.fn(async (ctx: string) => ctx),
    };
    svc = new GameService(
      undefined, undefined, undefined,
      llmService as any, undefined, undefined,
      {}, undefined, undefined, undefined, orchestrator as any,
    );
  });

  it('R4: 2× react paralelos com 2 reatores → cada um resolve um reator distinto', async () => {
    svc.getTurnStore().begin(makeOpenTurn('t1', 's1', ['Elara', 'Brom']));

    const [r1, r2] = await Promise.all([
      svc.reactNext('t1', 's1'),
      svc.reactNext('t1', 's1'),
    ]);

    // Sem duplicação: um reator por chamada, sem pular ninguém.
    expect(new Set([r1.who, r2.who])).toEqual(new Set(['Elara', 'Brom']));
    const status = svc.getTurnStatus('t1', 's1');
    expect(status.reacted.map((r) => r.who).sort()).toEqual(['Brom', 'Elara']);
  });

  it('R4: 2× react paralelos com 1 reator → 1 vence, outro NO_PENDING_REACTIONS', async () => {
    svc.getTurnStore().begin(makeOpenTurn('t1', 's1', ['Elara']));

    const results = await Promise.allSettled([
      svc.reactNext('t1', 's1'),
      svc.reactNext('t1', 's1'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const err = results.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(err).toHaveLength(1);
    expect((err[0] as PromiseRejectedResult).reason).toBeInstanceOf(TurnError);
    expect(((err[0] as PromiseRejectedResult).reason as TurnError).code).toBe('NO_PENDING_REACTIONS');
    expect(resolveReaction).toHaveBeenCalledTimes(1);
  });

  it('R5: 2× finish paralelos → 1 commit, outro OUT_OF_ORDER', async () => {
    svc.getTurnStore().begin(makeFinishTurn('t1', 's1'));

    const results = await Promise.allSettled([
      svc.finishTurn('t1', 's1'),
      svc.finishTurn('t1', 's1'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const err = results.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(err).toHaveLength(1);
    expect(((err[0] as PromiseRejectedResult).reason as TurnError).code).toBe('OUT_OF_ORDER');
    expect(commitTurn).toHaveBeenCalledTimes(1);
  });

  it('R6: 2× start paralelos na mesma sessão → 1 vence, outro TURN_IN_PROGRESS (sem gastar 2× LLM)', async () => {
    const startAction = vi.fn(async () => {
      await delay(20); // simula os LLMs do beginTurn com a flag já marcada
      return {
        actorWhere: 'Pátio',
        text: 'Aric avança com cautela.',
        reasoning: 'r',
        roll: 11,
        diceRoll: { characterName: 'Aric', roll: 11, isGodMode: false },
        action: { actor: 'Aric', text: 'Aric avança com cautela.', roll: 11 },
        allowed: [],
        denied: [],
        ordered: [],
      };
    });
    const starter = new GameService(
      undefined, undefined, undefined,
      { summarizeMemory: vi.fn(), updateWorldContext: vi.fn() } as any,
      undefined, undefined, {}, undefined, undefined, undefined,
      {
        activeRoster: (s: GameState) => s.characters,
        spotlightOrder: (r: GameState['characters']) => r,
        startAction,
        updateSettings: vi.fn(),
      } as any,
    );
    const state = makeState();
    const playerAction = { charName: 'Aric', text: 'Avanço pelo pátio.' };

    const results = await Promise.allSettled([
      starter.beginTurn('s1', state, playerAction),
      starter.beginTurn('s1', state, playerAction),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const err = results.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(err).toHaveLength(1);
    expect(((err[0] as PromiseRejectedResult).reason as TurnError).code).toBe('TURN_IN_PROGRESS');
    expect(startAction).toHaveBeenCalledTimes(1);
  });
});
