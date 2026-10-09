import { describe, it, expect } from 'vitest';
import { TurnStore, TurnError } from '../TurnStore.js';
import type { ActiveTurn } from '../TurnStore.js';

function makeTurn(turnId: string, sessionId: string): ActiveTurn {
  return {
    turnId,
    sessionId,
    turnNumber: 1,
    status: 'open',
    phase: 'awaiting_reactions',
    actorName: 'Zé',
    actorWhere: 'Pátio',
    actionText: 'Zé avança.',
    actionReasoning: '',
    diceRoll: { characterName: 'Zé', roll: 11 },
    action: { actor: 'Zé', text: 'Zé avança.', roll: 11 },
    allowed: [],
    denied: [],
    reactionCursor: 0,
    reacted: [],
    ignored: [],
    priorLines: ['Zé: Zé avança.'],
    unexpectedEvent: false,
    workingState: {} as any,
    createdAt: Date.now(),
  };
}

describe('TurnStore (sem TTL)', () => {
  it('begin duplo na mesma sessão → TURN_IN_PROGRESS com turnId existente', () => {
    const store = new TurnStore();
    store.begin(makeTurn('t1', 's1'));
    try {
      store.begin(makeTurn('t2', 's1'));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TurnError);
      expect((err as TurnError).code).toBe('TURN_IN_PROGRESS');
      expect((err as TurnError).turnId).toBe('t1');
    }
  });

  it('finish libera o lock; turno finalizado permanece consultável (sem expiração)', () => {
    const store = new TurnStore();
    store.begin(makeTurn('t1', 's1'));
    store.finish('t1');
    expect(store.get('t1')?.status).toBe('finished');
    expect(store.getOpenBySession('s1')).toBeUndefined();
    store.begin(makeTurn('t2', 's1'));
    expect(store.get('t2')?.status).toBe('open');
  });

  it('requireOpen valida sessão e status', () => {
    const store = new TurnStore();
    store.begin(makeTurn('t1', 's1'));
    expect(() => store.requireOpen('t1', 'outra')).toThrowError(TurnError);
    expect(() => store.requireOpen('inexistente', 's1')).toThrowError(TurnError);
    store.cancel('t1');
    expect(() => store.requireOpen('t1', 's1')).toThrowError(TurnError);
  });

  it('F1: tryClaimReaction reserva o slot de forma síncrona (R4)', () => {
    const store = new TurnStore();
    const turn = makeTurn('t1', 's1');
    turn.allowed = [
      { who: 'Elara', allow: true, channel: 'saw', why: 'viu' },
      { who: 'Brom', allow: true, channel: 'saw', why: 'ouviu' },
    ];
    store.begin(turn);

    const c1 = store.tryClaimReaction('t1', 's1');
    const c2 = store.tryClaimReaction('t1', 's1');
    expect(c1.ruling.who).toBe('Elara');
    expect(c1.index).toBe(0);
    expect(c2.ruling.who).toBe('Brom');
    expect(c2.index).toBe(1);
    expect(() => store.tryClaimReaction('t1', 's1')).toThrowError(
      expect.objectContaining({ code: 'NO_PENDING_REACTIONS' }),
    );
  });

  it('F1: tryClaimCommit/clearCommit + finish idempotente (R5)', () => {
    const store = new TurnStore();
    const turn = makeTurn('t1', 's1');
    turn.phase = 'awaiting_finish';
    turn.resolution = { outcome: 'success', violent: false, reason: 'ok', hit: [] };
    turn.narration = 'Narração.';
    store.begin(turn);

    store.tryClaimCommit('t1', 's1');
    expect(() => store.tryClaimCommit('t1', 's1')).toThrowError(
      expect.objectContaining({ code: 'OUT_OF_ORDER' }),
    );
    store.clearCommit('t1');
    store.tryClaimCommit('t1', 's1'); // liberou, pode reivindicar de novo
    store.finish('t1');
    expect(store.finish('t1')?.status).toBe('finished'); // idempotente
    expect(store.cancel('t1')?.status).toBe('finished'); // não reabre nem troca
  });

  it('F1: tryMarkStarting/clearStarting (R6)', () => {
    const store = new TurnStore();
    store.tryMarkStarting('s1');
    expect(() => store.tryMarkStarting('s1')).toThrowError(
      expect.objectContaining({ code: 'TURN_IN_PROGRESS' }),
    );
    store.tryMarkStarting('outra'); // sessões distintas não contend
    store.clearStarting('s1');
    store.tryMarkStarting('s1'); // liberou
  });
});
