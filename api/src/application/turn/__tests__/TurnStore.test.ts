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
});
