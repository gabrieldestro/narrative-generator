import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { buildApp } from '../server.js';
import { SessionRepository } from '../../infrastructure/persistence/SessionRepository.js';
import { CheckpointRepository } from '../../infrastructure/persistence/CheckpointRepository.js';
import { WorldTemplateRepository } from '../../infrastructure/persistence/WorldTemplateRepository.js';

/**
 * F2 (doc 31, §7.1): settings de gameplay por campanha — zero contaminação.
 * `Math.random` mockado (0.5 ⇒ dado normal = 11): godMode ⇔ 20 determinístico.
 * Contra o código antigo (global last-wins), o 2º start de A daria 11.
 */
describe('settings por campanha (F2: R2/R3)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let saveDir: string;

  beforeEach(async () => {
    saveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saves-iso-test-'));
    const fakeLlm = new FakeListChatModel({
      responses: [
        'Narrativa inicial de teste.',
        '{"allow": true, "channel": "saw", "why": "viu", "who": "Elara"}',
        '{"newCharacters": [], "removedCharacters": [], "newLocations": []}',
        '{"Elara": "Biblioteca"}',
        'Resolução lógica: Sucesso.',
        'Narrativa do turno: avanço.',
      ],
    });
    app = await buildApp({
      llmModel: fakeLlm,
      sessionRepo: new SessionRepository(),
      worldRepo: new WorldTemplateRepository(),
      checkpointRepo: new CheckpointRepository(saveDir),
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(saveDir, { recursive: true, force: true });
  });

  async function createGame(settings?: Record<string, unknown>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
        ...(settings ? { settings } : {}),
      },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.payload).sessionId as string);
  }

  async function start(sessionId: string, body: Record<string, unknown> = { playerText: 'Avanço.' }) {
    const res = await app.inject({ method: 'POST', url: `/api/games/${sessionId}/turn/start`, payload: body });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.payload) as { turnId: string; diceRoll: { roll: number; isGodMode?: boolean } };
  }

  async function cancel(sessionId: string, turnId: string) {
    const res = await app.inject({ method: 'POST', url: `/api/games/${sessionId}/turn/${turnId}/cancel` });
    expect(res.statusCode).toBe(200);
  }

  it('godMode de A não vaza para B; B não apaga o de A (ida e volta)', async () => {
    const a = await createGame({ godMode: true });
    const b = await createGame({ godMode: false });

    const s1 = await start(a);
    expect(s1.diceRoll.roll).toBe(20);

    const sB = await start(b);
    expect(sB.diceRoll.roll).toBe(11);

    await cancel(a, s1.turnId);
    const s2 = await start(a);
    expect(s2.diceRoll.roll).toBe(20);
  });

  it('settings no payload do start valem só para a campanha', async () => {
    const a = await createGame();
    const b = await createGame();

    const s1 = await start(a, { playerText: 'Avanço.', settings: { godMode: true } });
    expect(s1.diceRoll.roll).toBe(20);

    const sB = await start(b);
    expect(sB.diceRoll.roll).toBe(11);

    await cancel(a, s1.turnId);
    const s2 = await start(a);
    expect(s2.diceRoll.roll).toBe(20);
  });
});
