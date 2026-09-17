import { describe, it, expect, vi } from 'vitest';
import { SceneService } from '../../extractors/SceneService.js';
import type { GameState } from '../../../../domain/types.js';

function makeState(): GameState {
  return {
    narrativeStyle: 'fantasia',
    writingStyle: 'épico',
    worldContext: 'Pátio.',
    history: [],
    turnNumber: 3,
    characters: [
      { id: '1', name: 'Darian', description: 'd', personality: 'p', isPlayer: true, currentLocation: 'Pátio' },
    ],
    locations: [{ id: 'patio', name: 'Pátio', description: 'Aberto', connectedTo: [] }],
  } as unknown as GameState;
}

function mockDeps(resolvedValue: unknown | null) {
  const client = { invoke: vi.fn(async () => 'irrelevante') };
  const resolver = { resolveJson: vi.fn(async () => (resolvedValue === null ? null : { value: resolvedValue, attempt: 1 })) };
  return { client, resolver };
}

// Doc 27, Fase 4 — cena-extrator (§6.3).
describe('SceneService', () => {
  it('retorna o delta normalizado (sem exigir `id`)', async () => {
    const { client, resolver } = mockDeps({
      new_locations: [{ name: 'Sótão', desc: 'Escuro' }],
      new_npcs: [{ name: 'Vulto', desc: 'Sombra', where: 'Sótão' }],
      dead: [], lost: [], healed: [],
    });
    const agent = new SceneService(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Eles sobem ao Sótão escuro e veem o Vulto.');
    expect(out.new_locations).toEqual([{ name: 'Sótão', desc: 'Escuro' }]);
    expect(out.new_npcs).toEqual([{ name: 'Vulto', desc: 'Sombra', where: 'Sótão' }]);
    expect(resolver.resolveJson).toHaveBeenCalledTimes(1);
  });

  it('retorna delta vazio quando o resolver falha', async () => {
    const { client, resolver } = mockDeps(null);
    const agent = new SceneService(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Nada acontece.');
    expect(out).toEqual({ new_locations: [], new_npcs: [], dead: [], lost: [], healed: [] });
  });

  it('hasSignal é sempre true (cena roda 1x por turno, fora do caminho crítico)', () => {
    const { client, resolver } = mockDeps(null);
    const agent = new SceneService(client as any, resolver as any);
    expect(agent.hasSignal('qualquer coisa')).toBe(true);
  });
});
