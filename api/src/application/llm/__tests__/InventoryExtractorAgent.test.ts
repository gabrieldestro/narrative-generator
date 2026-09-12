import { describe, it, expect, vi } from 'vitest';
import { InventoryExtractorAgent } from '../extractors/inventory/InventoryExtractorAgent.js';
import type { GameState } from '../../../domain/types.js';

function makeState(): GameState {
  return {
    narrativeStyle: 'fantasia',
    writingStyle: 'épico',
    worldContext: 'Porão úmido',
    history: [],
    turnNumber: 1,
    characters: [
      { id: 'd', name: 'Darian', description: 'x', personality: 'y' },
      { id: 'e', name: 'Elara', description: 'x', personality: 'y' },
    ],
  } as unknown as GameState;
}

function mockDeps(resolvedValue: unknown | null) {
  const client = { invoke: vi.fn(async () => 'irrelevante') };
  const resolver = { resolveJson: vi.fn(async () => (resolvedValue === null ? null : { value: resolvedValue, attempt: 1 })) };
  return { client, resolver };
}

// Doc 27, Fase 2 — cada extrator retorna `{}` sem chamar LLM quando
// `hasSignal()==false` (assert no mock do resolver).
describe('InventoryExtractorAgent', () => {
  it('hasSignal detecta menção de item, ignora conversa pura', () => {
    const { client, resolver } = mockDeps(null);
    const agent = new InventoryExtractorAgent(client as any, resolver as any);
    expect(agent.hasSignal('Elara pega a chave de bronze.')).toBe(true);
    expect(agent.hasSignal('Ele guarda a adaga na mochila.')).toBe(true);
    expect(agent.hasSignal('Eles conversam sobre o tempo.')).toBe(false);
  });

  it('retorna `{}` sem chamar o resolver quando não há sinal', async () => {
    const { client, resolver } = mockDeps({ grab: [{ who: 'Elara', item: 'X' }] });
    const agent = new InventoryExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Eles conversam sobre o tempo.');
    expect(out).toEqual({});
    expect(resolver.resolveJson).not.toHaveBeenCalled();
  });

  it('retorna o delta normalizado quando há sinal', async () => {
    const { client, resolver } = mockDeps({
      grab: [{ who: 'Elara', item: 'Chave de Bronze' }],
      drop: [],
    });
    const agent = new InventoryExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Elara pega a Chave de Bronze.');
    expect(out).toEqual({ grab: [{ who: 'Elara', item: 'Chave de Bronze' }], drop: [] });
    expect(resolver.resolveJson).toHaveBeenCalledTimes(1);
  });

  it('retorna `{}` quando o resolver falha (fail-isolated)', async () => {
    const { client, resolver } = mockDeps(null);
    const agent = new InventoryExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Elara pega a chave.');
    expect(out).toEqual({});
  });
});
