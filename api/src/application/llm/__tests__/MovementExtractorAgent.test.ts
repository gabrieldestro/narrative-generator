import { describe, it, expect, vi } from 'vitest';
import { MovementExtractorAgent } from '../extractors/movement/MovementExtractorAgent.js';
import type { GameState } from '../../../domain/types.js';

function makeState(): GameState {
  return {
    narrativeStyle: 'fantasia',
    writingStyle: 'épico',
    worldContext: 'Pátio',
    history: [],
    turnNumber: 1,
    characters: [
      { id: 'd', name: 'Darian', description: 'x', personality: 'y' },
      { id: 'e', name: 'Elara', description: 'x', personality: 'y' },
    ],
    locations: [
      { id: 'patio', name: 'Pátio', description: 'Aberto', connectedTo: [] },
      { id: 'porao', name: 'Porão', description: 'Úmido', connectedTo: [] },
    ],
  } as unknown as GameState;
}

function mockDeps(resolvedValue: unknown | null) {
  const client = { invoke: vi.fn(async () => 'irrelevante') };
  const resolver = { resolveJson: vi.fn(async () => (resolvedValue === null ? null : { value: resolvedValue, attempt: 1 })) };
  return { client, resolver };
}

// Doc 27, Fase 2.
describe('MovementExtractorAgent', () => {
  it('hasSignal detecta verbo de movimento; local conhecido dá sinal', () => {
    const { client, resolver } = mockDeps(null);
    const agent = new MovementExtractorAgent(client as any, resolver as any);
    const state = makeState();
    expect(agent.hasSignal('Elara corre para o portão.')).toBe(true);
    expect(agent.hasSignal('Eles conversam sobre o tempo.')).toBe(false);
    expect(agent.hasLocationSignal(state, 'O Porão estava silencioso.')).toBe(true);
    expect(agent.hasLocationSignal(state, 'Eles conversam sobre o tempo.')).toBe(false);
  });

  it('retorna `{}` sem chamar o resolver quando não há sinal', async () => {
    const { client, resolver } = mockDeps({ move: [{ who: 'Elara', to: 'Porão' }] });
    const agent = new MovementExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Eles conversam sobre o tempo.');
    expect(out).toEqual({});
    expect(resolver.resolveJson).not.toHaveBeenCalled();
  });

  it('retorna o delta normalizado quando há sinal', async () => {
    const { client, resolver } = mockDeps({ move: [{ who: 'Elara', to: 'Porão' }] });
    const agent = new MovementExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Elara desce ao Porão.');
    expect(out).toEqual({ move: [{ who: 'Elara', to: 'Porão' }] });
    expect(resolver.resolveJson).toHaveBeenCalledTimes(1);
  });

  it('retorna `{}` quando o resolver falha (fail-isolated)', async () => {
    const { client, resolver } = mockDeps(null);
    const agent = new MovementExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Elara desce ao Porão.');
    expect(out).toEqual({});
  });
});
