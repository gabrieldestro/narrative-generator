import { describe, it, expect, vi } from 'vitest';
import { NarratorService } from '../NarratorService.js';
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

// Doc 27, Fase 1 — `NarratorService`.
describe('NarratorService.narrateStep', () => {
  it('retorna o texto do `invoke`', async () => {
    const client = { invoke: vi.fn(async () => 'Darian cai no chão úmido.') };
    const selfHealing = { invokeWithRetry: vi.fn() };
    const agent = new NarratorService(client as any, selfHealing as any, { ...DEFAULT_SETTINGS });
    const out = await agent.narrateStep(
      makeState(),
      'Darian tenta: escalar muro',
      { outcome: 'failure', violent: true, reason: 'muro liso', hit: ['Darian'] },
    );
    expect(out).toBe('Darian cai no chão úmido.');
    expect(client.invoke).toHaveBeenCalledTimes(1);
  });
});
