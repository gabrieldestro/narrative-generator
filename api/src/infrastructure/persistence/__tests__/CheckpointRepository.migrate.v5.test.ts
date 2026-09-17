import { describe, it, expect } from 'vitest';
import { CheckpointRepository } from '../CheckpointRepository.js';
import { SAVE_SCHEMA_VERSION } from '../../../domain/types.js';
import type { SessionBundle } from '../../../domain/types.js';

function v4Bundle(): SessionBundle {
  return {
    schemaVersion: 4,
    id: 'c1',
    rootId: 'c1',
    parentId: null,
    branchId: 0,
    depth: 2,
    mode: 'custom',
    title: 'Aventura',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    narrativeStyle: 'Fantasia',
    writingStyle: 'Épico',
    turnNumber: 3,
    playerCharacterName: 'Darian',
    lastNarrative: '...',
    state: {
      narrativeStyle: 'Fantasia',
      writingStyle: 'Épico',
      worldContext: 'Pátio.',
      characters: [
        { id: '1', name: 'Darian', description: 'd', personality: 'p', isPlayer: true, currentLocation: 'Pátio', vitality: 'ileso', conditions: [] },
      ],
      history: ['Turno 1: ...', 'Turno 2: ...'],
      turnNumber: 3,
      events: [],
      nextSeq: 1,
    },
  } as unknown as SessionBundle;
}

// Doc 27, Fase 4 — migração v4 -> v5 (memória factual).
describe('CheckpointRepository.migrate v4->v5', () => {
  it('preenche factSheet vazia com defaults', () => {
    const store = new CheckpointRepository();
    const migrated = store.migrate(v4Bundle());
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.state.factSheet).toEqual({ facts: [], threads: [] });
  });

  it('preserva factSheet existente e completa campos ausentes', () => {
    const store = new CheckpointRepository();
    const bundle = v4Bundle();
    bundle.state.factSheet = { facts: ['Elara deve a Darian'] } as any;
    const migrated = store.migrate(bundle);
    expect(migrated.state.factSheet).toEqual({ facts: ['Elara deve a Darian'], threads: [] });
  });

  it('migração completa v3 -> v5 em cadeia', () => {
    const store = new CheckpointRepository();
    const bundle = v4Bundle();
    (bundle as any).schemaVersion = 3;
    delete (bundle.state as any).events;
    delete (bundle.state as any).nextSeq;
    delete (bundle.state as any).factSheet;
    const migrated = store.migrate(bundle);
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.state.events).toEqual([]);
    expect(migrated.state.nextSeq).toBe(1);
    expect(migrated.state.factSheet).toEqual({ facts: [], threads: [] });
  });
});
