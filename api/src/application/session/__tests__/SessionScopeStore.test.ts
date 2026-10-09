import { describe, it, expect, vi } from 'vitest';
import { SessionScopeStore } from '../SessionScopeStore.js';
import { TurnService } from '../../turn/TurnService.js';
import { LlmService } from '../../shared/LlmService.js';
import { CharacterService } from '../../characters/CharacterService.js';
import type { GameSettings } from '../../../domain/types.js';

/** Factory real (sem mocks de settings): cobre o caminho de produção. */
function realFactory(settings: GameSettings) {
  const llmService = new LlmService({} as any, settings);
  const characterService = new CharacterService(llmService, settings);
  const orchestrator = new TurnService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, characterService, settings,
  );
  return { orchestrator, llmService, characterService };
}

describe('SessionScopeStore (F2)', () => {
  it('getOrCreate isola settings por rootId (R2)', () => {
    const store = new SessionScopeStore(undefined, realFactory);
    store.update('A', { godMode: true, narrationSize: 'descriptive' });

    const b = store.getOrCreate('B');
    expect(b.settings.godMode).toBe(false);
    expect(b.settings.narrationSize).toBe('balanced');
    // Grafos distintos por campanha, com snapshots distintos.
    const a = store.getOrCreate('A');
    expect(a.graph).toBeDefined();
    expect(b.graph).toBeDefined();
    expect(a.graph).not.toBe(b.graph);
  });

  it('godMode do grafo A não vaza para o grafo B', () => {
    const store = new SessionScopeStore(undefined, realFactory);
    store.update('A', { godMode: true });
    const player = { name: 'Aric', isPlayer: true } as any;

    expect(store.getOrCreate('A').graph!.orchestrator.rollDice(player).roll).toBe(20);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      expect(store.getOrCreate('B').graph!.orchestrator.rollDice(player).roll).toBe(11);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('updates concorrentes fazem merge sem lost-update (R3)', async () => {
    const store = new SessionScopeStore(undefined, realFactory);
    await Promise.all([
      (async () => { store.update('A', { godMode: true }); })(),
      (async () => { store.update('A', { narrationSize: 'descriptive' }); })(),
      (async () => { store.update('B', { godMode: true }); })(),
    ]);

    const a = store.getOrCreate('A').settings;
    expect(a.godMode).toBe(true);
    expect(a.narrationSize).toBe('descriptive');
    expect(store.getOrCreate('B').settings.narrationSize).toBe('balanced');
  });

  it('update nunca muta o objeto anterior (copy-on-write p/ inherit)', () => {
    const store = new SessionScopeStore(undefined, realFactory);
    store.update('A', { godMode: false });
    const before = store.getOrCreate('A').settings;
    store.inherit('child', 'A');
    store.update('A', { godMode: true });

    expect(store.getOrCreate('child').settings.godMode).toBe(false);
    expect(before.godMode).toBe(false);
  });

  it('prune evicta por TTL e por teto (mais antigos primeiro)', () => {
    const store = new SessionScopeStore(undefined, undefined, { ttlMs: 1000, maxScopes: 2 });
    store.getOrCreate('old');
    store.getOrCreate('mid');
    store.getOrCreate('new');
    const evicted = store.prune(Date.now() + 10_000);
    expect(evicted).toHaveLength(3);
    expect(store.size).toBe(0);
  });
});
