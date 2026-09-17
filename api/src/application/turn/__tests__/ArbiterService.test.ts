import { describe, it, expect, vi } from 'vitest';
import { ArbiterService, renderResolution } from '../ArbiterService.js';
import type { GameState, StepAction, StepResolution } from '../../../domain/types.js';

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
  const selfHealing = { invokeWithRetry: vi.fn(async () => 'resolução do turno') };
  return { client, resolver, selfHealing };
}

const ACTION: StepAction = { actor: 'Darian', text: 'escalar muro', roll: 7 };

// `ArbiterService.arbitrateStep`.
describe('ArbiterService.arbitrateStep', () => {
  it('retorna a resolução do resolver filtrando `hit` pela allowlist', async () => {
    const { client, resolver, selfHealing } = mockDeps({
      outcome: 'failure', violent: true, reason: 'muro liso, caiu de 2m', hit: ['Darian', 'Fantasma'],
    });
    const agent = new ArbiterService(client as any, resolver as any, selfHealing as any);
    const res = await agent.arbitrateStep(makeState(), ACTION, []);
    expect(res).toEqual({ outcome: 'failure', violent: true, reason: 'muro liso, caiu de 2m', hit: ['Darian'] });
    expect(resolver.resolveJson).toHaveBeenCalledTimes(1);
  });

  it('fallback `partial/non-violent` quando o resolver retorna null', async () => {
    const { client, resolver, selfHealing } = mockDeps(null);
    const agent = new ArbiterService(client as any, resolver as any, selfHealing as any);
    const res = await agent.arbitrateStep(makeState(), ACTION, []);
    expect(res).toEqual({ outcome: 'partial', violent: false, reason: 'inconclusivo', hit: [] });
  });

  it('usa o nome canônico do personagem no `hit` (case-insensitive)', async () => {
    const { client, resolver, selfHealing } = mockDeps({
      outcome: 'success', violent: false, reason: 'ok', hit: ['darian'],
    });
    const agent = new ArbiterService(client as any, resolver as any, selfHealing as any);
    const res = await agent.arbitrateStep(makeState(), ACTION, []);
    expect(res.hit).toEqual(['Darian']);
  });
});

describe('ArbiterService.applyDiceRule', () => {
  it('roll 20 eleva `partial` → `success`; roll 1 derruba → `failure`', () => {
    const { client, resolver, selfHealing } = mockDeps(null);
    const agent = new ArbiterService(client as any, resolver as any, selfHealing as any);
    const base: StepResolution = { outcome: 'partial', violent: false, reason: 'x', hit: [] };
    expect(agent.applyDiceRule({ ...base }, 20).outcome).toBe('success');
    expect(agent.applyDiceRule({ ...base }, 1).outcome).toBe('failure');
    expect(agent.applyDiceRule({ ...base }, 10).outcome).toBe('partial');
  });

  it('nunca muda `success`/`failure` (impossível físico e trivial)', () => {
    const { client, resolver, selfHealing } = mockDeps(null);
    const agent = new ArbiterService(client as any, resolver as any, selfHealing as any);
    expect(agent.applyDiceRule({ outcome: 'success', violent: false, reason: 'x', hit: [] }, 1).outcome).toBe('success');
    expect(agent.applyDiceRule({ outcome: 'failure', violent: true, reason: 'x', hit: [] }, 20).outcome).toBe('failure');
  });
});

describe('ArbiterService.arbitrateTurn', () => {
  it('delega ao `invokeWithRetry` com os prompts do turno', async () => {
    const { client, resolver, selfHealing } = mockDeps(null);
    const agent = new ArbiterService(client as any, resolver as any, selfHealing as any);
    const state = makeState();
    const out = await agent.arbitrateTurn(state, ['Darian tenta: X']);
    expect(out).toBe('resolução do turno');
    expect(selfHealing.invokeWithRetry).toHaveBeenCalledTimes(1);
    const opts = selfHealing.invokeWithRetry.mock.calls.at(0)?.at(0) as unknown as { agent: string };
    expect(opts.agent).toBe('Árbitro');
  });
});

describe('renderResolution', () => {
  it('gera linhas `.Fulano tentou X -> Sucesso/Falha porque ....`', () => {
    const text = renderResolution([
      { actor: 'Darian', text: 'escalar muro', outcome: 'failure', reason: 'muro liso' },
      { actor: 'Elara', text: 'segurar a corda', outcome: 'success', reason: 'corda firme' },
    ]);
    expect(text).toMatch(/Darian.*?->\s*Falha/i);
    expect(text).toMatch(/Elara.*?->\s*Sucesso/i);
  });
});
