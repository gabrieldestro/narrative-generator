import { describe, it, expect } from 'vitest';
import { FileSaveStore } from '../FileSaveStore.js';
import { SAVE_SCHEMA_VERSION } from '../../domain/types.js';
import type { SessionBundle } from '../../domain/types.js';

function v3Bundle(): SessionBundle {
  return {
    schemaVersion: 3,
    id: 'c1',
    rootId: 'c1',
    parentId: null,
    branchId: 0,
    depth: 1,
    mode: 'custom',
    title: 'Aventura',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    narrativeStyle: 'Fantasia',
    writingStyle: 'Épico',
    turnNumber: 2,
    playerCharacterName: 'Darian',
    lastNarrative: '...',
    state: {
      narrativeStyle: 'Fantasia',
      writingStyle: 'Épico',
      worldContext: 'Pátio.',
      characters: [
        { id: '1', name: 'Darian', description: 'd', personality: 'p', isPlayer: true, currentLocation: 'Pátio' },
      ],
      history: ['Turno 1: ...'],
      turnNumber: 2,
    },
  } as unknown as SessionBundle;
}

// Doc 27, Fase 0 — migração v3 -> v4.
describe('FileSaveStore.migrate v3->v4', () => {
  it('preenche events/nextSeq/vitality/conditions com defaults', () => {
    const store = new FileSaveStore();
    const migrated = store.migrate(v3Bundle());
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.state.events).toEqual([]);
    expect(migrated.state.nextSeq).toBe(1);
    expect(migrated.state.characters[0]!.vitality).toBe('ileso');
    expect(migrated.state.characters[0]!.conditions).toEqual([]);
  });

  it('preserva valores já existentes (nunca destrói)', () => {
    const store = new FileSaveStore();
    const bundle = v3Bundle();
    bundle.state.events = [{ seq: 7, turn: 2, who: 'Darian', did: 'escalou muro', outcome: 'failure', where: 'Pátio' }];
    bundle.state.nextSeq = 8;
    (bundle.state.characters[0] as unknown as Record<string, unknown>).vitality = 'ferido';
    const migrated = store.migrate(bundle);
    expect(migrated.state.events).toHaveLength(1);
    expect(migrated.state.nextSeq).toBe(8);
    expect(migrated.state.characters[0]!.vitality).toBe('ferido');
  });

  it('deriva nextSeq do maior seq quando ausente', () => {
    const store = new FileSaveStore();
    const bundle = v3Bundle();
    bundle.state.events = [
      { seq: 3, turn: 1, who: 'A', did: 'x', outcome: 'success', where: 'P' },
      { seq: 9, turn: 2, who: 'B', did: 'y', outcome: 'partial', where: 'P' },
    ];
    const migrated = store.migrate(bundle);
    expect(migrated.state.nextSeq).toBe(10);
  });
});
