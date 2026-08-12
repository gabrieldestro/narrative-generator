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
    expect(ids).toEqual(['ok-1', 'ok-2']);
    expect(await store.get('corrompido')).toBeNull();
  });

  it('escrita atômica (temp + rename) deve deixar arquivo íntegro e sem .tmp órfão', async () => {
    await store.save(makeBundle('abc-123'));
    const raw = await fs.readFile(path.join(tempDir, 'abc-123.json'), 'utf-8');
    expect(JSON.parse(raw)).toBeTruthy();

    const files = await fs.readdir(tempDir);
    expect(files.some(f => f.endsWith('.tmp.json'))).toBe(false);
  });

  it('deve salvar múltiplas partidas independentes', async () => {
    await store.save(makeBundle('a'));
    await store.save(makeBundle('b', { title: 'Outra Aventura', mode: 'custom' }));

    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list.find(b => b.id === 'b')!.mode).toBe('custom');
  });

  it('migrate deve tratar bundle sem schemaVersion como v1', () => {
    const legacy = JSON.parse(JSON.stringify(makeBundle('legacy'))) as { schemaVersion?: number };
    delete legacy.schemaVersion;

    const migrated = store.migrate(legacy as unknown as SessionBundle);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.id).toBe('legacy');
    expect(migrated.state.turnNumber).toBe(1);
  });

  it('migrate preserva campos desconhecidos ao re-gravar', () => {
    const extra = JSON.parse(JSON.stringify(makeBundle('com-extra'))) as Record<string, unknown>;
    extra['campoFuturo'] = { algum: 'dado' };

    const migrated = store.migrate(extra as unknown as SessionBundle);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect((migrated as unknown as Record<string, unknown>)['campoFuturo']).toEqual({ algum: 'dado' });
  });
});