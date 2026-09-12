import { describe, it, expect, vi } from 'vitest';
import { NarratorAgent } from '../narrator/NarratorAgent.js';
import { DEFAULT_SETTINGS, type GameState } from '../../../domain/types.js';

function makeState(): GameState {
  return {
    narrativeStyle: 'fantasia',
    writingStyle: 'épico',
    worldContext: 'Porão úmido',
    history: ['Turno 1: algo aconteceu'],
    turnNumber: 2,
    characters: [
      { id: 'd', name: 'Darian', description: 'x', personality: 'y' },
    ],
  } as unknown as GameState;
}

// Doc 27, Fase 1 — `NarratorAgent`.
describe('NarratorAgent.narrateMicro', () => {
  it('retorna o texto e chama `onToken` 1x com o texto final (compat SSE)', async () => {
    const client = { invoke: vi.fn(async () => 'Darian cai no chão úmido.') };
    const selfHealing = { invokeWithRetry: vi.fn() };
    const agent = new NarratorAgent(client as any, selfHealing as any, { ...DEFAULT_SETTINGS });
    const onToken = vi.fn();
    const out = await agent.narrateMicro(
      makeState(),
      'Darian tenta: escalar muro',
      { outcome: 'failure', violent: true, reason: 'muro liso', hit: ['Darian'] },
      { onToken },
    );
    expect(out).toBe('Darian cai no chão úmido.');
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith('Darian cai no chão úmido.');
    expect(client.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('NarratorAgent.narrateLegacy', () => {
  it('caminho feliz: prefixo de cena + stream via `LlmClient`', async () => {
    const client = {
      invoke: vi.fn(),
      streamMessages: vi.fn(async (_msgs: unknown, opts: any) => {
        opts.onToken?.('chunk1 ');
        opts.onToken?.('chunk2');
        return 'chunk1 chunk2';
      }),
    };
    const selfHealing = { invokeWithRetry: vi.fn() };
    const agent = new NarratorAgent(client as any, selfHealing as any, { ...DEFAULT_SETTINGS });
    const written: string[] = [];
    const out = await agent.narrateLegacy(
      makeState(),
      ['Darian tenta: X'],
      'Darian tentou X -> Sucesso porque ...',
      { write: (t: string) => written.push(t), writeLine: (t: string) => written.push(t), clear: () => {} },
      false,
      'Descrição da cena.',
    );
    expect(out).toBe('Descrição da cena.\n\nchunk1 chunk2');
    expect(written.join('')).toContain('Descrição da cena.');
    expect(selfHealing.invokeWithRetry).not.toHaveBeenCalled();
  });

  it('fallback de overflow: retry via `invokeWithRetry` preservando o prefixo', async () => {
    const overflow = new Error('maximum context length exceeded');
    const client = {
      invoke: vi.fn(),
      streamMessages: vi.fn(async () => { throw overflow; }),
    };
    const selfHealing = { invokeWithRetry: vi.fn(async () => 'recuperado') };
    const agent = new NarratorAgent(client as any, selfHealing as any, { ...DEFAULT_SETTINGS });
    const written: string[] = [];
    const out = await agent.narrateLegacy(
      makeState(),
      ['Darian tenta: X'],
      'resolução',
      { write: (t: string) => written.push(t), writeLine: (t: string) => written.push(t), clear: () => {} },
      false,
      'Cena.',
    );
    expect(out).toBe('Cena.\n\nrecuperado');
    expect(selfHealing.invokeWithRetry).toHaveBeenCalledTimes(1);
  });

  it('erro não-overflow propaga sem fallback', async () => {
    const boom = new Error('connection reset');
    const client = {
      invoke: vi.fn(),
      streamMessages: vi.fn(async () => { throw boom; }),
    };
    const selfHealing = { invokeWithRetry: vi.fn() };
    const agent = new NarratorAgent(client as any, selfHealing as any, { ...DEFAULT_SETTINGS });
    await expect(agent.narrateLegacy(makeState(), ['X'], 'Y')).rejects.toThrow('connection reset');
    expect(selfHealing.invokeWithRetry).not.toHaveBeenCalled();
  });
});
