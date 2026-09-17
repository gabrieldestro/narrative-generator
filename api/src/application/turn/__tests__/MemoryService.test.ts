import { describe, it, expect, vi } from 'vitest';
import { MemoryService } from '../MemoryService.js';

// Doc 27, Fase 4 — memória factual junta (§8.1).
describe('MemoryService.consolidateFacts', () => {
  function mockDeps(resolvedValue: unknown | null) {
    const client = { invoke: vi.fn(async (system: string, human: string) => `${system}\n${human}`.slice(0, 50)) };
    const resolver = { resolveJson: vi.fn(async () => (resolvedValue === null ? null : { value: resolvedValue, attempt: 1 })) };
    return { client, resolver };
  }

  it('substitui a ficha (replace) com limites e descarte de trivial', async () => {
    const { client, resolver } = mockDeps({
      facts: ['Elara deve a Darian pelo resgate no Porão'],
      threads: [{ id: 'artefato', text: 'recuperar artefato no Sótão', status: 'open' }],
    });
    const agent = new MemoryService(client as any, resolver as any);
    const out = await agent.consolidateFacts(
      { facts: ['fato antigo que some'], threads: [] },
      [{ seq: 1, turn: 2, who: 'Darian', did: 'resgatou Elara', outcome: 'success', where: 'Porão' }],
      ['Darian resgata Elara no Porão.'],
      2,
    );
    expect(out).toEqual({
      facts: ['Elara deve a Darian pelo resgate no Porão'],
      threads: [{ id: 'artefato', text: 'recuperar artefato no Sótão', status: 'open' }],
    });
    // Entrada inclui narrações dos steps da cena (events sozinhos insuficientes).
    const human = resolver.resolveJson.mock.calls[0]![0].human as string;
    expect(human).toContain('Darian resgata Elara no Porão.');
  });

  it('falha de parse mantém a ficha antiga (nunca apaga)', async () => {
    const { client, resolver } = mockDeps(null);
    const agent = new MemoryService(client as any, resolver as any);
    const old = { facts: ['importante'], threads: [] };
    const out = await agent.consolidateFacts(old, [], [], 2);
    expect(out).toBe(old);
  });

  it('sem ficha antiga, falha retorna ficha vazia', async () => {
    const { client, resolver } = mockDeps(null);
    const agent = new MemoryService(client as any, resolver as any);
    expect(await agent.consolidateFacts(undefined, [], [], 2)).toEqual({ facts: [], threads: [] });
  });
});

describe('MemoryService.summarizeMemory/updateWorldContext', () => {
  it('delegam ao `LlmClient` com os prompts legados', async () => {
    const client = { invoke: vi.fn(async () => 'resumo ou contexto') };
    const resolver = { resolveJson: vi.fn() };
    const agent = new MemoryService(client as any, resolver as any);
    expect(await agent.summarizeMemory('antigo', ['Turno 1: x'], 3)).toBe('resumo ou contexto');
    expect(await agent.updateWorldContext('ctx', 'narr', 3)).toBe('resumo ou contexto');
    expect(client.invoke).toHaveBeenCalledTimes(2);
    expect(client.invoke.mock.calls[0]![0]).toContain('condensar');
  });
});
