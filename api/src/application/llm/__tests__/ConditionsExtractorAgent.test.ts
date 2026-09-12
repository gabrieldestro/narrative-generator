import { describe, it, expect, vi } from 'vitest';
import { ConditionsExtractorAgent } from '../extractors/conditions/ConditionsExtractorAgent.js';
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
  } as unknown as GameState;
}

function mockDeps(resolvedValue: unknown | null) {
  const client = { invoke: vi.fn(async () => 'irrelevante') };
  const resolver = { resolveJson: vi.fn(async () => (resolvedValue === null ? null : { value: resolvedValue, attempt: 1 })) };
  return { client, resolver };
}

// Doc 27, Fase 2.
describe('ConditionsExtractorAgent', () => {
  it('hasSignal detecta heurística de dano, ignora conversa pura', () => {
    const { client, resolver } = mockDeps(null);
    const agent = new ConditionsExtractorAgent(client as any, resolver as any);
    expect(agent.hasSignal('Darian cai do muro e o sangue escorre.')).toBe(true);
    expect(agent.hasSignal('Eles conversam sobre o tempo.')).toBe(false);
  });

  it('retorna `{}` sem chamar o resolver quando não há sinal nem violência', async () => {
    const { client, resolver } = mockDeps({ conditions: [{ who: 'Darian', add: 'corte' }] });
    const agent = new ConditionsExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Eles conversam sobre o tempo.');
    expect(out).toEqual({});
    expect(resolver.resolveJson).not.toHaveBeenCalled();
  });

  it('`violent=true` força o sinal mesmo sem palavra-chave', async () => {
    const { client, resolver } = mockDeps({ conditions: [{ who: 'Darian', add: 'ombro deslocado' }] });
    const agent = new ConditionsExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Darian é jogado contra a parede.', { violent: true });
    expect(out).toEqual({ conditions: [{ who: 'Darian', add: 'ombro deslocado' }] });
    expect(resolver.resolveJson).toHaveBeenCalledTimes(1);
  });

  it('retorna `{}` quando o resolver falha (fail-isolated)', async () => {
    const { client, resolver } = mockDeps(null);
    const agent = new ConditionsExtractorAgent(client as any, resolver as any);
    const out = await agent.extract(makeState(), 'Darian sangra muito.', { violent: true });
    expect(out).toEqual({});
  });
});
