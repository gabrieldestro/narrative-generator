import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileSaveStore } from '../FileSaveStore.js';
import type { SessionBundle } from '../../domain/types.js';
import { SAVE_SCHEMA_VERSION } from '../../domain/types.js';

function makeBundle(id: string, overrides: Partial<SessionBundle> = {}): SessionBundle {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    id,
    rootId: overrides.rootId ?? id,
    parentId: overrides.parentId ?? null,
    branchId: overrides.branchId ?? 0,
    depth: overrides.depth ?? 1,
    mode: 'template',
    title: 'Masmorra Sombria',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    turnNumber: 1,
    playerCharacterName: 'Aric',
    lastNarrative: 'Narrativa Inicial: Uma masmorra escura.',
    state: {
      worldContext: 'Uma masmorra sombria.',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
      turnNumber: 1,
      history: ['Narrativa Inicial: Uma masmorra escura.'],
      characters: [
        { id: '1', name: 'Aric', description: 'Herói', personality: 'Bravo', isPlayer: true },
      ],
      locations: [],
      lastSceneLocation: 'Entrada da Masmorra',
    },
    ...overrides,
  };
}

describe('FileSaveStore', () => {
  let tempDir: string;
  let store: FileSaveStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saves-store-test-'));
    store = new FileSaveStore(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('deve fazer round-trip save/get/list/delete', async () => {
    const bundle = makeBundle('abc-123');
    await store.save(bundle);

    const loaded = await store.get('abc-123');
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(bundle);

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('abc-123');

    await store.delete('abc-123');
    expect(await store.get('abc-123')).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });

  it('deve retornar null para save inexistente e listar vazio em diretório vazio', async () => {
    expect(await store.get('nao-existe')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('arquivo corrompido não deve derrubar a listagem', async () => {
    await store.save(makeBundle('ok-1'));
    await store.save(makeBundle('ok-2'));
    await fs.writeFile(path.join(tempDir, 'corrompido.json'), '{ nao é json de verdade', 'utf-8');

    const list = await store.list();
    const ids = list.map(b => b.id);
    expect(ids).toContain('ok-1');
    expect(ids).toContain('ok-2');
    expect(await store.get('corrompido')).toBeNull();
  });

  it('escrita atômica (temp + rename) deve deixar arquivo íntegro e sem .tmp órfão', async () => {
    await store.save(makeBundle('abc-123'));
    const raw = await fs.readFile(path.join(tempDir, 'abc-123.json'), 'utf-8');
    expect(JSON.parse(raw)).toBeTruthy();

    const files = await fs.readdir(tempDir);
    expect(files.some(f => f.endsWith('.tmp.json'))).toBe(false);
  });

  it('deve salvar múltiplas partidas independentes e listar ordenado por updatedAt DESC', async () => {
    await store.save(makeBundle('a', { updatedAt: '2026-01-01T10:00:00.000Z' }));
    await store.save(makeBundle('b', { title: 'Outra Aventura', mode: 'custom', updatedAt: '2026-01-02T10:00:00.000Z' }));

    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0]!.id).toBe('b');
    expect(list[1]!.id).toBe('a');
  });

  it('listLatestPerRoot deve agrupar por rootId e retornar somente o mais recente de cada campanha', async () => {
    // Campanha 1 (root: camp-1) com 3 turnos
    await store.save(makeBundle('c1-t1', { rootId: 'camp-1', parentId: null, turnNumber: 1, updatedAt: '2026-01-01T10:00:00.000Z' }));
    await store.save(makeBundle('c1-t2', { rootId: 'camp-1', parentId: 'c1-t1', turnNumber: 2, updatedAt: '2026-01-01T11:00:00.000Z' }));
    await store.save(makeBundle('c1-t3', { rootId: 'camp-1', parentId: 'c1-t2', turnNumber: 3, updatedAt: '2026-01-01T12:00:00.000Z' }));

    // Campanha 2 (root: camp-2) com 1 turno
    await store.save(makeBundle('c2-t1', { rootId: 'camp-2', parentId: null, turnNumber: 1, updatedAt: '2026-01-02T08:00:00.000Z' }));

    const latest = await store.listLatestPerRoot();
    expect(latest).toHaveLength(2);
    expect(latest[0]!.id).toBe('c2-t1'); // Mais recente globalmente
    expect(latest[1]!.id).toBe('c1-t3'); // Mais recente da camp-1
    expect((latest[0] as any).state).toBeUndefined(); // Projeção sem state
  });

  it('listByRootId deve retornar todos os checkpoints de uma campanha específica ordenados DESC', async () => {
    await store.save(makeBundle('c1-t1', { rootId: 'camp-1', parentId: null, turnNumber: 1, updatedAt: '2026-01-01T10:00:00.000Z' }));
    await store.save(makeBundle('c1-t2', { rootId: 'camp-1', parentId: 'c1-t1', turnNumber: 2, updatedAt: '2026-01-01T11:00:00.000Z' }));
    await store.save(makeBundle('c2-t1', { rootId: 'camp-2', parentId: null, turnNumber: 1, updatedAt: '2026-01-02T08:00:00.000Z' }));

    const history = await store.listByRootId('camp-1');
    expect(history).toHaveLength(2);
    expect(history[0]!.id).toBe('c1-t2');
    expect(history[1]!.id).toBe('c1-t1');
  });

  it('prune por rootId deve manter apenas o checkpoint mais recente da campanha', async () => {
    await store.save(makeBundle('c1-t1', { rootId: 'camp-1', updatedAt: '2026-01-01T10:00:00.000Z' }));
    await store.save(makeBundle('c1-t2', { rootId: 'camp-1', updatedAt: '2026-01-01T11:00:00.000Z' }));
    await store.save(makeBundle('c1-t3', { rootId: 'camp-1', updatedAt: '2026-01-01T12:00:00.000Z' }));
    await store.save(makeBundle('c2-t1', { rootId: 'camp-2', updatedAt: '2026-01-02T08:00:00.000Z' }));

    const result = await store.prune({ rootId: 'camp-1' });
    expect(result.deleted).toBe(2);
    expect(result.kept).toBe('c1-t3');

    const history = await store.listByRootId('camp-1');
    expect(history).toHaveLength(1);
    expect(history[0]!.id).toBe('c1-t3');

    // camp-2 não foi afetada
    expect(await store.get('c2-t1')).not.toBeNull();
  });

  it('prune global deve manter apenas o mais recente global', async () => {
    await store.save(makeBundle('c1-t1', { rootId: 'camp-1', updatedAt: '2026-01-01T10:00:00.000Z' }));
    await store.save(makeBundle('c2-t1', { rootId: 'camp-2', updatedAt: '2026-01-02T08:00:00.000Z' }));

    const result = await store.prune({ keepLatest: true });
    expect(result.deleted).toBe(1);
    expect(result.kept).toBe('c2-t1');

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('c2-t1');
  });

  it('migrate deve preencher rootId, parentId, branchId, depth para saves legados', () => {
    const legacy = JSON.parse(JSON.stringify(makeBundle('legacy'))) as any;
    delete legacy.schemaVersion;
    delete legacy.rootId;
    delete legacy.parentId;
    delete legacy.branchId;
    delete legacy.depth;

    const migrated = store.migrate(legacy as unknown as SessionBundle);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.rootId).toBe('legacy');
    expect(migrated.parentId).toBeNull();
    expect(migrated.branchId).toBe(0);
    expect(migrated.depth).toBe(1);
  });

  it('migrate deve preencher state.concepts: [] em bundles v1', () => {
    const legacy = makeBundle('legacy') as any;
    legacy.schemaVersion = 1;
    delete legacy.state.concepts;

    const migrated = store.migrate(legacy as unknown as SessionBundle);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.state.concepts).toEqual([]);
  });

  it('migrate preserva campos desconhecidos ao re-gravar', () => {
    const extra = JSON.parse(JSON.stringify(makeBundle('com-extra'))) as Record<string, unknown>;
    extra['campoFuturo'] = { algum: 'dado' };

    const migrated = store.migrate(extra as unknown as SessionBundle);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect((migrated as unknown as Record<string, unknown>)['campoFuturo']).toEqual({ algum: 'dado' });
  });
});