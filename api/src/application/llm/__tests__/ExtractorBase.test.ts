import { describe, it, expect } from 'vitest';
import { ExtractorBase } from '../extractors/ExtractorBase.js';
import type { GameState } from '../../../domain/types.js';

// Extrator concreto mínimo só para testar a base (Fase 0).
class InventoryProbe extends ExtractorBase<{ grab: { who: string; item: string }[] }> {
  readonly formatSpec = '{"grab":[{"who":"Nome","item":"Item"}]}';
  hasSignal(narration: string): boolean {
    return /peg[ao]u?|larg|inventário|mochila/i.test(narration);
  }
  validate(value: unknown): value is { grab: { who: string; item: string }[] } {
    return (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray((value as Record<string, unknown>).grab)
    );
  }
}

function makeState(): GameState {
  return {
    narrativeStyle: 'Fantasia',
    writingStyle: 'Épico',
    worldContext: 'Taverna.',
    turnNumber: 1,
    history: [],
    characters: [
      { id: '1', name: 'Elara', description: 'd', personality: 'p', isPlayer: false, currentLocation: 'Porão' },
    ],
    locations: [{ id: 'porao', name: 'Porão', description: 'Úmido', connectedTo: [] }],
  };
}

// Doc 27, Fase 0 — esqueleto compartilhado, sem LLM.
describe('ExtractorBase', () => {
  it('hasSignal detecta menção de inventário', () => {
    const ex = new InventoryProbe();
    expect(ex.hasSignal('Elara pega a chave de bronze.')).toBe(true);
    expect(ex.hasSignal('Eles conversam sobre o tempo.')).toBe(false);
  });

  it('validate aceita formato e rejeita resto', () => {
    const ex = new InventoryProbe();
    expect(ex.validate({ grab: [] })).toBe(true);
    expect(ex.validate({ grab: 'x' })).toBe(false);
    expect(ex.validate({})).toBe(false);
  });

  it('expõe formatSpec para prompt + repair', () => {
    expect(new InventoryProbe().formatSpec).toContain('grab');
  });

  it('isGrounded usa o util compartilhado (sem LLM)', () => {
    const ex = new InventoryProbe();
    const check = (ex as unknown as { isGrounded: (t: string, n: string) => boolean }).isGrounded
      .bind(ex);
    expect(check('Chave de Bronze', 'ela pega a CHAVE DE BRONZE enferrujada')).toBe(true);
    expect(check('Chave de Bronze', 'conversam sobre o tempo')).toBe(false);
    // Fase 2: cada extrator concreto testa `hasSignal()==false` → LLM nunca chamado (assert no mock).
  });

  it('conhece nomes e locais do estado', () => {
    const ex = new InventoryProbe();
    const internals = ex as unknown as {
      knownNames: (s: GameState) => Set<string>;
      knownLocations: (s: GameState) => Set<string>;
    };
    expect(internals.knownNames(makeState()).has('elara')).toBe(true);
    expect(internals.knownLocations(makeState()).has('porão')).toBe(true);
  });
});
